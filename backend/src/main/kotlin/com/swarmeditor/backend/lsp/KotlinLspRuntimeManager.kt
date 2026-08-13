package com.swarmeditor.backend.lsp

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.BasicFileAttributes
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream

const val KOTLIN_LSP_RUNTIME_VERSION = "262.9593.0"

enum class KotlinLspRuntimeHealth {
    READY,
    MISSING,
    INVALID,
    UNSUPPORTED,
}

enum class KotlinLspRuntimeSource {
    OVERRIDE,
    MANAGED,
    PATH,
    NONE,
}

data class KotlinLspRuntimeStatus(
    val expectedVersion: String = KOTLIN_LSP_RUNTIME_VERSION,
    val health: KotlinLspRuntimeHealth,
    val source: KotlinLspRuntimeSource,
    val platform: String,
    val command: List<String> = emptyList(),
    val installSupported: Boolean = false,
    val artifactSha256: String? = null,
    val launcherSha256: String? = null,
    val downloadedBytes: Long = 0,
    val archiveSizeBytes: Long = 0,
    val message: String,
)

data class KotlinLspDownloadProgress(
    val downloadedBytes: Long,
    val totalBytes: Long,
    val resumed: Boolean,
)

internal enum class KotlinLspArchiveFormat {
    TAR_GZ,
    ZIP,
}

internal data class KotlinLspRuntimeArtifact(
    val platform: String,
    val archiveName: String,
    val sha256: String,
    val sizeBytes: Long,
    val format: KotlinLspArchiveFormat,
    val launcherRelativePath: String,
) {
    val downloadUrl: String
        get() = "$KOTLIN_LSP_DOWNLOAD_ROOT/$KOTLIN_LSP_RUNTIME_VERSION/$archiveName"
}

@Serializable
private data class InstalledKotlinLspMetadata(
    val version: String,
    val platform: String,
    val archiveName: String,
    val artifactSha256: String,
    val launcherSha256: String,
)

class KotlinLspRuntimeManager internal constructor(
    installRoot: File,
    private val environmentProvider: () -> Map<String, String> = System::getenv,
    private val systemPropertyProvider: (String) -> String? = System::getProperty,
    private val osNameProvider: () -> String = { System.getProperty("os.name") },
    private val architectureProvider: () -> String = { System.getProperty("os.arch") },
    private val artifactProvider: (String, String) -> KotlinLspRuntimeArtifact? = ::officialKotlinLspArtifact,
    private val downloader: suspend (
        KotlinLspRuntimeArtifact,
        File,
        suspend (KotlinLspDownloadProgress) -> Unit,
    ) -> Unit = ::downloadKotlinLspArchive,
    private val json: Json = Json { ignoreUnknownKeys = false; prettyPrint = true },
) {
    private val root = installRoot.absoluteFile.normalize()
    private val mutex = Mutex()

    suspend fun inspect(): KotlinLspRuntimeStatus = mutex.withLock { inspectLocked() }

    suspend fun managedCommandOrNull(projectRoot: File): List<String>? = mutex.withLock {
        val artifact = artifactProvider(osNameProvider(), architectureProvider()) ?: return@withLock null
        val status = inspectManagedRuntime(artifact)?.takeIf { it.health == KotlinLspRuntimeHealth.READY }
            ?: return@withLock null
        managedCommand(File(status.command.first()), artifact.platform, projectRoot)
    }

    suspend fun install(
        onProgress: suspend (KotlinLspDownloadProgress) -> Unit = {},
    ): KotlinLspRuntimeStatus = mutex.withLock {
        val osName = osNameProvider()
        val architecture = architectureProvider()
        val artifact = artifactProvider(osName, architecture)
            ?: error("当前平台不支持自动安装 Kotlin LSP: ${platformLabel(osName, architecture)}")
        withContext(Dispatchers.IO) {
            require(!Files.isSymbolicLink(root.toPath())) { "Kotlin LSP runtime root cannot be a symbolic link" }
            Files.createDirectories(root.toPath())
        }
        val platformRoot = File(root, "$KOTLIN_LSP_RUNTIME_VERSION/${artifact.platform}")
        val nonce = UUID.randomUUID().toString().replace("-", "")
        val archive = withContext(Dispatchers.IO) { preparePendingArchive(root, artifact) }
        val staging = File(root, ".kotlin-lsp.$nonce.staging")
        val backup = File(root, ".kotlin-lsp.$nonce.backup")
        var installed = false
        try {
            downloader(artifact, archive, onProgress)
            require(archive.isFile && archive.length() in 1..MAX_KOTLIN_LSP_ARCHIVE_BYTES) {
                "Downloaded Kotlin LSP archive is empty or too large"
            }
            require(archive.length() == artifact.sizeBytes) { "Kotlin LSP archive size mismatch" }
            val archiveSha256 = withContext(Dispatchers.IO) { sha256(archive) }
            if (archiveSha256 != artifact.sha256) {
                withContext(NonCancellable + Dispatchers.IO) { Files.deleteIfExists(archive.toPath()) }
                error("Kotlin LSP archive SHA-256 mismatch")
            }
            withContext(Dispatchers.IO) {
                Files.createDirectories(staging.toPath())
                extractArchive(archive, staging, artifact.format)
                val extractedRoot = File(staging, "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION")
                require(extractedRoot.isDirectory) { "Kotlin LSP archive root is missing" }
                val launcher = File(extractedRoot, artifact.launcherRelativePath)
                require(launcher.isFile && !Files.isSymbolicLink(launcher.toPath())) {
                    "Kotlin LSP launcher is missing"
                }
                if (!isWindows(osName)) launcher.setExecutable(true, false)
                require(isRunnableLauncher(launcher, osName)) { "Kotlin LSP launcher is not executable" }
                val launcherSha256 = sha256(launcher)
                writeMetadata(
                    File(extractedRoot, METADATA_FILE),
                    InstalledKotlinLspMetadata(
                        version = KOTLIN_LSP_RUNTIME_VERSION,
                        platform = artifact.platform,
                        archiveName = artifact.archiveName,
                        artifactSha256 = archiveSha256,
                        launcherSha256 = launcherSha256,
                    ),
                )
                Files.createDirectories(platformRoot.parentFile.toPath())
                installAtomically(extractedRoot, platformRoot, backup)
            }
            installed = true
        } catch (error: CancellationException) {
            throw error
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                if (installed) Files.deleteIfExists(archive.toPath())
                deleteTreeSafely(staging.toPath())
                deleteTreeSafely(backup.toPath())
            }
        }
        inspectLocked()
    }

    private suspend fun inspectLocked(): KotlinLspRuntimeStatus {
        val osName = osNameProvider()
        val architecture = architectureProvider()
        val platform = platformLabel(osName, architecture)
        val artifact = artifactProvider(osName, architecture)
        val environment = environmentProvider()
        val override = environment[KOTLIN_LSP_OVERRIDE_ENV]
            ?: systemPropertyProvider(KOTLIN_LSP_OVERRIDE_PROPERTY)
        if (!override.isNullOrBlank()) {
            val command = splitCommand(override)
            return if (command.isNotEmpty() && commandAvailable(command.first(), environment, osName)) {
                KotlinLspRuntimeStatus(
                    health = KotlinLspRuntimeHealth.READY,
                    source = KotlinLspRuntimeSource.OVERRIDE,
                    platform = platform,
                    command = command,
                    installSupported = artifact != null,
                    message = "使用显式 Kotlin LSP 命令",
                )
            } else {
                KotlinLspRuntimeStatus(
                    health = KotlinLspRuntimeHealth.INVALID,
                    source = KotlinLspRuntimeSource.OVERRIDE,
                    platform = platform,
                    command = command,
                    installSupported = artifact != null,
                    message = "$KOTLIN_LSP_OVERRIDE_ENV 或 $KOTLIN_LSP_OVERRIDE_PROPERTY 指向的命令不可执行",
                )
            }
        }
        artifact?.let { supportedArtifact ->
            inspectManagedRuntime(supportedArtifact)?.let { return it }
        }
        DEFAULT_KOTLIN_LSP_COMMANDS.firstOrNull { command ->
            commandAvailable(command.first(), environment, osName)
        }?.let { command ->
            return KotlinLspRuntimeStatus(
                health = KotlinLspRuntimeHealth.READY,
                source = KotlinLspRuntimeSource.PATH,
                platform = platform,
                command = command,
                installSupported = artifact != null,
                message = "使用 PATH 中的 ${command.first()}",
            )
        }
        return KotlinLspRuntimeStatus(
            health = if (artifact == null) KotlinLspRuntimeHealth.UNSUPPORTED else KotlinLspRuntimeHealth.MISSING,
            source = KotlinLspRuntimeSource.NONE,
            platform = platform,
            installSupported = artifact != null,
            downloadedBytes = artifact?.let { pendingDownloadBytes(root, it) } ?: 0,
            archiveSizeBytes = artifact?.sizeBytes ?: 0,
            message = if (artifact == null) {
                "当前平台没有受支持的 Kotlin LSP 自动安装包"
            } else {
                "尚未安装 JetBrains Kotlin LSP $KOTLIN_LSP_RUNTIME_VERSION"
            },
        )
    }

    private suspend fun inspectManagedRuntime(
        artifact: KotlinLspRuntimeArtifact,
    ): KotlinLspRuntimeStatus? = withContext(Dispatchers.IO) {
        val platformRoot = File(root, "$KOTLIN_LSP_RUNTIME_VERSION/${artifact.platform}")
        val launcher = File(platformRoot, artifact.launcherRelativePath)
        val metadataFile = File(platformRoot, METADATA_FILE)
        if (!platformRoot.exists() && !launcher.exists() && !metadataFile.exists()) return@withContext null
        try {
            require(platformRoot.isDirectory && !Files.isSymbolicLink(platformRoot.toPath())) {
                "Managed Kotlin LSP directory is invalid"
            }
            require(launcher.isFile && !Files.isSymbolicLink(launcher.toPath())) {
                "Managed Kotlin LSP launcher is missing"
            }
            require(isRunnableLauncher(launcher, osNameProvider())) { "Managed Kotlin LSP launcher is not executable" }
            require(metadataFile.isFile && metadataFile.length() in 1..MAX_METADATA_BYTES) {
                "Managed Kotlin LSP metadata is missing"
            }
            val metadata = json.decodeFromString<InstalledKotlinLspMetadata>(metadataFile.readText())
            require(metadata.version == KOTLIN_LSP_RUNTIME_VERSION) { "Managed Kotlin LSP version mismatch" }
            require(metadata.platform == artifact.platform && metadata.archiveName == artifact.archiveName) {
                "Managed Kotlin LSP platform metadata mismatch"
            }
            require(metadata.artifactSha256 == artifact.sha256) { "Managed Kotlin LSP archive hash metadata mismatch" }
            val launcherSha256 = sha256(launcher)
            require(metadata.launcherSha256 == launcherSha256) { "Managed Kotlin LSP launcher SHA-256 mismatch" }
            KotlinLspRuntimeStatus(
                health = KotlinLspRuntimeHealth.READY,
                source = KotlinLspRuntimeSource.MANAGED,
                platform = artifact.platform,
                command = listOf(launcher.canonicalPath, "--stdio"),
                installSupported = true,
                artifactSha256 = metadata.artifactSha256,
                launcherSha256 = launcherSha256,
                archiveSizeBytes = artifact.sizeBytes,
                message = "JetBrains Kotlin LSP $KOTLIN_LSP_RUNTIME_VERSION 已就绪",
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            KotlinLspRuntimeStatus(
                health = KotlinLspRuntimeHealth.INVALID,
                source = KotlinLspRuntimeSource.MANAGED,
                platform = artifact.platform,
                command = listOf(launcher.absolutePath),
                installSupported = true,
                downloadedBytes = pendingDownloadBytes(root, artifact),
                archiveSizeBytes = artifact.sizeBytes,
                message = safeRuntimeMessage(error),
            )
        }
    }

    private fun writeMetadata(file: File, metadata: InstalledKotlinLspMetadata) {
        val temporary = File(file.parentFile, ".${file.name}.${UUID.randomUUID()}.tmp")
        temporary.writeText(json.encodeToString(InstalledKotlinLspMetadata.serializer(), metadata))
        movePath(temporary.toPath(), file.toPath())
    }

    private fun managedCommand(launcher: File, platform: String, projectRoot: File): List<String> {
        val projectIdentity = sha256(projectRoot.canonicalFile.absolutePath)
        val systemPath = createManagedDirectory(
            "system/$KOTLIN_LSP_RUNTIME_VERSION/$platform/workspaces/$projectIdentity",
        )
        return listOf(
            launcher.canonicalPath,
            "--stdio",
            "--system-path",
            systemPath.toAbsolutePath().toString(),
            "--log-level",
            "WARNING",
        )
    }

    private fun createManagedDirectory(relativePath: String): Path {
        val rootPath = root.toPath().toAbsolutePath().normalize()
        require(!Files.isSymbolicLink(rootPath)) { "Kotlin LSP runtime root cannot be a symbolic link" }
        Files.createDirectories(rootPath)

        val target = rootPath.resolve(relativePath).normalize()
        require(target.startsWith(rootPath)) { "Kotlin LSP system path escapes the runtime root" }
        var current = rootPath
        rootPath.relativize(target).forEach { segment ->
            current = current.resolve(segment)
            if (Files.exists(current)) {
                require(Files.isDirectory(current) && !Files.isSymbolicLink(current)) {
                    "Kotlin LSP system path contains an invalid directory"
                }
            } else {
                Files.createDirectory(current)
            }
        }
        return target
    }
}

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(StandardCharsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private fun officialKotlinLspArtifact(osName: String, architecture: String): KotlinLspRuntimeArtifact? {
    val os = osName.lowercase()
    val arch = architecture.lowercase()
    val platform = when {
        os.contains("linux") && arch in X64_ARCHITECTURES -> "x86_64-linux"
        os.contains("linux") && arch in ARM64_ARCHITECTURES -> "aarch64-linux"
        (os.contains("mac") || os.contains("darwin")) && arch in X64_ARCHITECTURES -> "x86_64-macos"
        (os.contains("mac") || os.contains("darwin")) && arch in ARM64_ARCHITECTURES -> "aarch64-macos"
        os.contains("windows") && arch in X64_ARCHITECTURES -> "x86_64-windows"
        os.contains("windows") && arch in ARM64_ARCHITECTURES -> "aarch64-windows"
        else -> return null
    }
    val archiveName = when (platform) {
        "x86_64-linux" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION.tar.gz"
        "aarch64-linux" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION-aarch64.tar.gz"
        "x86_64-macos" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION.sit"
        "aarch64-macos" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION-aarch64.sit"
        "x86_64-windows" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION.win.zip"
        "aarch64-windows" -> "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION-aarch64.win.zip"
        else -> return null
    }
    return KotlinLspRuntimeArtifact(
        platform = platform,
        archiveName = archiveName,
        sha256 = OFFICIAL_KOTLIN_LSP_SHA256.getValue(platform),
        sizeBytes = OFFICIAL_KOTLIN_LSP_ARCHIVE_SIZES.getValue(platform),
        format = if (platform.endsWith("linux")) KotlinLspArchiveFormat.TAR_GZ else KotlinLspArchiveFormat.ZIP,
        launcherRelativePath = if (platform.endsWith("windows")) "bin/intellij-server.exe" else "bin/intellij-server",
    )
}

private suspend fun downloadKotlinLspArchive(
    artifact: KotlinLspRuntimeArtifact,
    destination: File,
    onProgress: suspend (KotlinLspDownloadProgress) -> Unit,
) =
    withContext(Dispatchers.IO) {
        Files.createDirectories(destination.parentFile.toPath())
        require(!Files.isSymbolicLink(destination.toPath())) { "Kotlin LSP partial archive cannot be a symbolic link" }
        if (destination.length() > artifact.sizeBytes) Files.delete(destination.toPath())

        repeat(2) { attempt ->
            val offset = destination.length()
            val connection = URI(artifact.downloadUrl).toURL().openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = true
            connection.connectTimeout = 20_000
            connection.readTimeout = 120_000
            connection.setRequestProperty("User-Agent", "SwarmEditor/KotlinLsp-$KOTLIN_LSP_RUNTIME_VERSION")
            if (offset > 0) connection.setRequestProperty("Range", "bytes=$offset-")
            try {
                val responseCode = connection.responseCode
                if (responseCode == HTTP_RANGE_NOT_SATISFIABLE && offset == artifact.sizeBytes) {
                    onProgress(KotlinLspDownloadProgress(offset, artifact.sizeBytes, resumed = true))
                    return@withContext
                }
                check(responseCode in 200..299) { "Kotlin LSP download failed: HTTP $responseCode" }
                val append = offset > 0 && responseCode == HttpURLConnection.HTTP_PARTIAL
                if (offset > 0 && !append && attempt == 0) {
                    FileOutputStream(destination, false).use { }
                    return@repeat
                }
                if (append) requireContentRangeOffset(connection.getHeaderField("Content-Range"), offset, artifact.sizeBytes)
                val initialBytes = if (append) offset else 0L
                val declaredLength = connection.contentLengthLong
                require(declaredLength <= 0 || initialBytes + declaredLength <= artifact.sizeBytes) {
                    "Kotlin LSP archive exceeds the expected size"
                }
                onProgress(KotlinLspDownloadProgress(initialBytes, artifact.sizeBytes, resumed = append))
                BufferedInputStream(connection.inputStream).use { input ->
                    FileOutputStream(destination, append).use { output ->
                        copyDownload(input, output, initialBytes, artifact.sizeBytes, append, onProgress)
                    }
                }
                require(destination.length() == artifact.sizeBytes) {
                    "Kotlin LSP download ended at ${destination.length()} of ${artifact.sizeBytes} bytes"
                }
                return@withContext
            } finally {
                connection.disconnect()
            }
        }
        error("Kotlin LSP server did not honor restart or range download")
    }

private fun preparePendingArchive(root: File, artifact: KotlinLspRuntimeArtifact): File {
    val pending = File(root, ".${artifact.archiveName}.partial")
    require(!Files.isSymbolicLink(pending.toPath())) { "Kotlin LSP partial archive cannot be a symbolic link" }
    if (pending.length() > artifact.sizeBytes) Files.deleteIfExists(pending.toPath())

    val legacy = legacyPendingArchives(root, artifact)
    val bestLegacy = legacy.maxByOrNull(File::length)
    if (bestLegacy != null && (!pending.isFile || bestLegacy.length() > pending.length())) {
        Files.deleteIfExists(pending.toPath())
        movePath(bestLegacy.toPath(), pending.toPath())
    }
    legacy.filter { it != bestLegacy || it.exists() }.forEach { Files.deleteIfExists(it.toPath()) }
    return pending
}

private fun pendingDownloadBytes(root: File, artifact: KotlinLspRuntimeArtifact): Long =
    sequenceOf(File(root, ".${artifact.archiveName}.partial"))
        .plus(legacyPendingArchives(root, artifact))
        .filter { file -> file.isFile && !Files.isSymbolicLink(file.toPath()) }
        .map(File::length)
        .filter { bytes -> bytes in 1..artifact.sizeBytes }
        .maxOrNull()
        ?: 0L

private fun legacyPendingArchives(root: File, artifact: KotlinLspRuntimeArtifact): List<File> =
    root.listFiles { file ->
        file.isFile &&
            !Files.isSymbolicLink(file.toPath()) &&
            file.name.startsWith(".${artifact.archiveName}.") &&
            file.name.endsWith(".download")
    }?.toList().orEmpty()

private fun requireContentRangeOffset(header: String?, offset: Long, expectedSize: Long) {
    val match = header?.let { CONTENT_RANGE_PATTERN.matchEntire(it.trim()) }
        ?: error("Kotlin LSP range response is missing Content-Range")
    require(match.groupValues[1].toLong() == offset) { "Kotlin LSP range response starts at the wrong offset" }
    require(match.groupValues[3].toLong() == expectedSize) { "Kotlin LSP range response has an unexpected size" }
}

private suspend fun copyDownload(
    input: InputStream,
    output: OutputStream,
    initialBytes: Long,
    totalBytes: Long,
    resumed: Boolean,
    onProgress: suspend (KotlinLspDownloadProgress) -> Unit,
) {
    val buffer = ByteArray(DEFAULT_DOWNLOAD_BUFFER_BYTES)
    var downloaded = initialBytes
    var lastReported = initialBytes
    while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        if (read == 0) continue
        downloaded += read
        require(downloaded <= totalBytes && downloaded <= MAX_KOTLIN_LSP_ARCHIVE_BYTES) {
            "Kotlin LSP archive exceeds the expected size"
        }
        output.write(buffer, 0, read)
        if (downloaded - lastReported >= DOWNLOAD_PROGRESS_INTERVAL_BYTES) {
            onProgress(KotlinLspDownloadProgress(downloaded, totalBytes, resumed))
            lastReported = downloaded
        }
    }
    onProgress(KotlinLspDownloadProgress(downloaded, totalBytes, resumed))
}

private fun extractArchive(archive: File, destination: File, format: KotlinLspArchiveFormat) {
    var extractedBytes = 0L
    var entries = 0
    val pendingLinks = mutableListOf<PendingArchiveLink>()
    fun account(size: Long) {
        extractedBytes += size
        require(extractedBytes <= MAX_KOTLIN_LSP_EXTRACTED_BYTES) { "Kotlin LSP archive expands beyond the limit" }
    }
    when (format) {
        KotlinLspArchiveFormat.TAR_GZ -> FileInputStream(archive).use { fileInput ->
            GzipCompressorInputStream(BufferedInputStream(fileInput)).use { gzip ->
                TarArchiveInputStream(gzip).use { tar ->
                    while (true) {
                        val entry = tar.nextEntry ?: break
                        require(++entries <= MAX_ARCHIVE_ENTRIES) { "Kotlin LSP archive contains too many entries" }
                        val target = safeArchiveTarget(destination, entry.name)
                        if (entry.isSymbolicLink) {
                            pendingLinks += PendingArchiveLink(target, entry.linkName, relativeToParent = true)
                        } else if (entry.isLink) {
                            pendingLinks += PendingArchiveLink(target, entry.linkName, relativeToParent = false)
                        } else if (entry.isDirectory) {
                            Files.createDirectories(target.toPath())
                        } else {
                            require(entry.isFile) { "Unsupported Kotlin LSP archive entry: ${entry.name}" }
                            Files.createDirectories(target.parentFile.toPath())
                            FileOutputStream(target).use { output ->
                                val written = copyBounded(tar::read, output::write, MAX_KOTLIN_LSP_ENTRY_BYTES)
                                account(written)
                            }
                            if (entry.mode and EXECUTABLE_MODE_MASK != 0) target.setExecutable(true, false)
                        }
                    }
                }
            }
        }
        KotlinLspArchiveFormat.ZIP -> FileInputStream(archive).use { fileInput ->
            ZipArchiveInputStream(BufferedInputStream(fileInput)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    require(++entries <= MAX_ARCHIVE_ENTRIES) { "Kotlin LSP archive contains too many entries" }
                    val target = safeArchiveTarget(destination, entry.name)
                    if (entry.isUnixSymlink) {
                        val linkTarget = ByteArrayOutputStream().use { output ->
                            copyBounded(zip::read, output::write, MAX_ARCHIVE_LINK_BYTES)
                            output.toString(Charsets.UTF_8)
                        }
                        pendingLinks += PendingArchiveLink(target, linkTarget, relativeToParent = true)
                    } else if (entry.isDirectory) {
                        Files.createDirectories(target.toPath())
                    } else {
                        Files.createDirectories(target.parentFile.toPath())
                        FileOutputStream(target).use { output ->
                            val written = copyBounded(zip::read, output::write, MAX_KOTLIN_LSP_ENTRY_BYTES)
                            account(written)
                        }
                        if (entry.unixMode and EXECUTABLE_MODE_MASK != 0) target.setExecutable(true, false)
                    }
                }
            }
        }
    }
    pendingLinks.forEach { link ->
        val extractionRoot = destination.toPath().toAbsolutePath().normalize()
        val sourcePath = if (link.relativeToParent) {
            link.target.parentFile.toPath().resolve(link.linkName).normalize()
        } else {
            extractionRoot.resolve(link.linkName).normalize()
        }
        require(sourcePath.startsWith(extractionRoot) && sourcePath != extractionRoot) {
            "Kotlin LSP archive link escapes extraction root"
        }
        require(Files.isRegularFile(sourcePath) && !Files.isSymbolicLink(sourcePath)) {
            "Kotlin LSP archive link target is not a regular file"
        }
        require(!link.target.exists()) { "Kotlin LSP archive link target already exists" }
        Files.createDirectories(link.target.parentFile.toPath())
        FileInputStream(sourcePath.toFile()).use { input ->
            FileOutputStream(link.target).use { output ->
                val written = copyBounded(input::read, output::write, MAX_KOTLIN_LSP_ENTRY_BYTES)
                account(written)
            }
        }
    }
}

private data class PendingArchiveLink(
    val target: File,
    val linkName: String,
    val relativeToParent: Boolean,
)

private fun safeArchiveTarget(root: File, entryName: String): File {
    require(entryName.isNotBlank() && !entryName.contains('\u0000')) { "Invalid Kotlin LSP archive entry" }
    val rootPath = root.toPath().toAbsolutePath().normalize()
    val targetPath = rootPath.resolve(entryName).normalize()
    require(targetPath.startsWith(rootPath) && targetPath != rootPath) { "Kotlin LSP archive entry escapes extraction root" }
    return targetPath.toFile()
}

private fun copyBounded(
    read: (ByteArray, Int, Int) -> Int,
    write: (ByteArray, Int, Int) -> Unit,
    maximumBytes: Long,
): Long {
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0L
    while (true) {
        val count = read(buffer, 0, buffer.size)
        if (count < 0) break
        total += count
        require(total <= maximumBytes) { "Kotlin LSP archive entry exceeds the limit" }
        write(buffer, 0, count)
    }
    return total
}

private fun installAtomically(staging: File, destination: File, backup: File) {
    if (destination.exists()) movePath(destination.toPath(), backup.toPath())
    try {
        movePath(staging.toPath(), destination.toPath())
        deleteTreeSafely(backup.toPath())
    } catch (error: Throwable) {
        if (!destination.exists() && backup.exists()) movePath(backup.toPath(), destination.toPath())
        throw error
    }
}

private fun movePath(source: Path, destination: Path) {
    try {
        Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    } catch (_: AtomicMoveNotSupportedException) {
        Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING)
    }
}

private fun deleteTreeSafely(path: Path) {
    if (!Files.exists(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) return
    if (Files.isSymbolicLink(path)) {
        Files.deleteIfExists(path)
        return
    }
    Files.walkFileTree(path, object : SimpleFileVisitor<Path>() {
        override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
            Files.deleteIfExists(file)
            return FileVisitResult.CONTINUE
        }

        override fun postVisitDirectory(dir: Path, error: java.io.IOException?): FileVisitResult {
            if (error != null) throw error
            Files.deleteIfExists(dir)
            return FileVisitResult.CONTINUE
        }
    })
}

private fun commandAvailable(executable: String, environment: Map<String, String>, osName: String): Boolean {
    val direct = File(executable)
    if (direct.isAbsolute || File.separatorChar in executable) return isRunnableLauncher(direct, osName)
    return environment["PATH"].orEmpty()
        .split(File.pathSeparatorChar)
        .asSequence()
        .filter(String::isNotBlank)
        .map { directory -> File(directory, executable) }
        .any { candidate -> isRunnableLauncher(candidate, osName) }
}

private fun isRunnableLauncher(file: File, osName: String): Boolean =
    file.isFile && !Files.isSymbolicLink(file.toPath()) && (isWindows(osName) || file.canExecute())

private fun splitCommand(command: String): List<String> = command.trim().split(Regex("\\s+")).filter(String::isNotBlank)

private fun sha256(file: File): String = FileInputStream(file).use { input ->
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
    }
    digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private fun platformLabel(osName: String, architecture: String): String =
    "${osName.lowercase().replace(Regex("[^a-z0-9]+"), "-")}-${architecture.lowercase()}"

private fun safeRuntimeMessage(error: Throwable): String = error.message
    ?.replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
    ?.trim()
    ?.take(500)
    ?.ifBlank { null }
    ?: error::class.simpleName.orEmpty().ifBlank { "Kotlin LSP runtime is invalid" }

private fun isWindows(osName: String): Boolean = osName.lowercase().contains("windows")

private const val KOTLIN_LSP_DOWNLOAD_ROOT = "https://download-cdn.jetbrains.com/language-server/kotlin-server"
private const val KOTLIN_LSP_OVERRIDE_ENV = "SWARM_LSP_KOTLIN"
private const val KOTLIN_LSP_OVERRIDE_PROPERTY = "swarm.lsp.kotlin"
private const val METADATA_FILE = "runtime.json"
private const val MAX_METADATA_BYTES = 64 * 1024L
private const val MAX_KOTLIN_LSP_ARCHIVE_BYTES = 512L * 1024 * 1024
private const val MAX_KOTLIN_LSP_ENTRY_BYTES = 768L * 1024 * 1024
private const val MAX_KOTLIN_LSP_EXTRACTED_BYTES = 3L * 1024 * 1024 * 1024
private const val MAX_ARCHIVE_ENTRIES = 100_000
private const val MAX_ARCHIVE_LINK_BYTES = 4L * 1024
private const val EXECUTABLE_MODE_MASK = 0b001001001
private const val HTTP_RANGE_NOT_SATISFIABLE = 416
private const val DEFAULT_DOWNLOAD_BUFFER_BYTES = 64 * 1024
private const val DOWNLOAD_PROGRESS_INTERVAL_BYTES = 1024 * 1024L
private val CONTENT_RANGE_PATTERN = Regex("""bytes (\d+)-(\d+)/(\d+)""")
private val DEFAULT_KOTLIN_LSP_COMMANDS = listOf(listOf("kotlin-lsp"), listOf("kotlin-language-server"))
private val X64_ARCHITECTURES = setOf("amd64", "x86_64")
private val ARM64_ARCHITECTURES = setOf("aarch64", "arm64")
private val OFFICIAL_KOTLIN_LSP_SHA256 = mapOf(
    "x86_64-linux" to "2d99d8e198fbe4aa8f4481e37799724ce94803b4ea12a60b416040e3fcd7cc5e",
    "aarch64-linux" to "2317831c6e5607d05b7ebc1da655330125ce0e3d66fbf24517dfce442debc14e",
    "x86_64-macos" to "17369fda97c85418ac24ab38a9df56b21522a3468dfe193832fe455c13920745",
    "aarch64-macos" to "6ba6021a706b21e64cef33f7e2b79f187c0910320722bb2d3ed05ad1115ec43f",
    "x86_64-windows" to "f2daaa476f26d99301b406f76de6d87c437d04dc72f06845154619d8f991c51f",
    "aarch64-windows" to "73a552a6a420158622e5ad8d96b53da8aa8ced3f88a24fded01575927a2fd8e7",
)
private val OFFICIAL_KOTLIN_LSP_ARCHIVE_SIZES = mapOf(
    "x86_64-linux" to 394_243_049L,
    "aarch64-linux" to 393_240_374L,
    "x86_64-macos" to 389_632_790L,
    "aarch64-macos" to 387_618_228L,
    "x86_64-windows" to 390_673_324L,
    "aarch64-windows" to 370_301_920L,
)
