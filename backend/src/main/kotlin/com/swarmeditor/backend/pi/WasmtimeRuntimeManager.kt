package com.swarmeditor.backend.pi

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream
import kotlin.io.path.createDirectories
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream

enum class WasmtimeRuntimeHealth {
    READY,
    MISSING,
    INVALID,
    UNSUPPORTED,
}

enum class WasmtimeRuntimeSource {
    ENVIRONMENT,
    PACKAGED,
    MANAGED,
    PATH,
    NONE,
}

data class WasmtimeRuntimeStatus(
    val expectedVersion: String = WASMTIME_VERSION,
    val health: WasmtimeRuntimeHealth,
    val source: WasmtimeRuntimeSource,
    val platform: String,
    val executablePath: String? = null,
    val detectedVersion: String? = null,
    val installSupported: Boolean = false,
    val artifactSha256: String? = null,
    val binarySha256: String? = null,
    val message: String,
)

internal enum class WasmtimeArchiveFormat {
    ZIP,
    TAR_XZ,
}

internal data class WasmtimeRuntimeArtifact(
    val platform: String,
    val archiveName: String,
    val sha256: String,
    val format: WasmtimeArchiveFormat,
) {
    val downloadUrl: String
        get() = "https://github.com/bytecodealliance/wasmtime/releases/download/v$WASMTIME_VERSION/$archiveName"
}

@Serializable
private data class InstalledWasmtimeMetadata(
    val version: String,
    val platform: String,
    val archiveName: String,
    val artifactSha256: String,
    val binarySha256: String,
)

class WasmtimeRuntimeManager internal constructor(
    installRoot: File,
    private val environmentProvider: () -> Map<String, String> = System::getenv,
    private val resourcesDirectoryProvider: () -> String? = {
        System.getProperty("compose.application.resources.dir")
    },
    private val osNameProvider: () -> String = { System.getProperty("os.name") },
    private val architectureProvider: () -> String = { System.getProperty("os.arch") },
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val artifactProvider: (String, String) -> WasmtimeRuntimeArtifact? = ::officialWasmtimeArtifact,
    private val downloader: suspend (WasmtimeRuntimeArtifact, File) -> Unit = ::downloadWasmtimeArchive,
    private val json: Json = Json { ignoreUnknownKeys = false; prettyPrint = true },
) {
    private val root = installRoot.absoluteFile.normalize()
    private val mutex = Mutex()
    private var cachedSandboxPath: String? = null
    private var cachedSandbox: WasmSandbox? = null

    suspend fun inspect(): WasmtimeRuntimeStatus = mutex.withLock { inspectLocked() }

    suspend fun sandboxOrNull(): WasmSandbox? = mutex.withLock {
        val status = inspectLocked()
        val executablePath = status.executablePath
        if (status.health != WasmtimeRuntimeHealth.READY || executablePath == null) return@withLock null
        if (cachedSandboxPath != executablePath) {
            cachedSandboxPath = executablePath
            cachedSandbox = WasmtimeCliSandbox(File(executablePath))
        }
        cachedSandbox
    }

    suspend fun install(): WasmtimeRuntimeStatus = mutex.withLock {
        val osName = osNameProvider()
        val architecture = architectureProvider()
        val artifact = artifactProvider(osName, architecture)
            ?: error("当前平台不支持自动安装 Wasmtime: ${platformLabel(osName, architecture)}")
        withContext(Dispatchers.IO) {
            require(!Files.isSymbolicLink(root.toPath())) { "Wasmtime runtime root cannot be a symbolic link" }
            root.toPath().createDirectories()
        }
        val platformRoot = File(root, "$WASMTIME_VERSION/${artifact.platform}")
        val parent = platformRoot.parentFile
        val nonce = UUID.randomUUID().toString().replace("-", "")
        val archive = File(root, ".${artifact.archiveName}.$nonce.download")
        val staging = File(parent, ".${artifact.platform}.$nonce.staging")
        val backup = File(parent, ".${artifact.platform}.$nonce.backup")
        try {
            downloader(artifact, archive)
            withContext(Dispatchers.IO) {
                require(archive.isFile && archive.length() in 1..MAX_WASMTIME_ARCHIVE_BYTES) {
                    "Wasmtime archive has an invalid size"
                }
                val archiveHash = sha256(archive)
                require(archiveHash == artifact.sha256) {
                    "Wasmtime archive SHA-256 mismatch"
                }
                staging.mkdirs()
                require(staging.isDirectory && !Files.isSymbolicLink(staging.toPath())) {
                    "Cannot create Wasmtime staging directory"
                }
                val executable = extractExecutable(archive, artifact, staging)
                require(executable.setExecutable(true, true) || executable.canExecute()) {
                    "Cannot mark Wasmtime executable as runnable"
                }
                val detectedVersion = verifyExecutable(executable)
                require(detectedVersion == WASMTIME_VERSION) {
                    "Wasmtime version mismatch: expected $WASMTIME_VERSION, received $detectedVersion"
                }
                val binaryHash = sha256(executable)
                File(staging, METADATA_FILE).writeText(
                    json.encodeToString(
                        InstalledWasmtimeMetadata(
                            version = WASMTIME_VERSION,
                            platform = artifact.platform,
                            archiveName = artifact.archiveName,
                            artifactSha256 = artifact.sha256,
                            binarySha256 = binaryHash,
                        )
                    )
                )
                installAtomically(staging, platformRoot, backup)
            }
            cachedSandboxPath = null
            cachedSandbox = null
            inspectLocked()
        } catch (error: CancellationException) {
            throw error
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                archive.delete()
                deleteTreeSafely(staging)
                deleteTreeSafely(backup)
            }
        }
    }

    private suspend fun inspectLocked(): WasmtimeRuntimeStatus {
        val osName = osNameProvider()
        val architecture = architectureProvider()
        val artifact = artifactProvider(osName, architecture)
        val platform = artifact?.platform ?: platformLabel(osName, architecture)
        val resolution = resolveExecutable(osName, architecture, artifact)
        val candidate = resolution.candidate
        if (candidate == null) {
            return WasmtimeRuntimeStatus(
                health = if (artifact == null) WasmtimeRuntimeHealth.UNSUPPORTED else resolution.health,
                source = resolution.source,
                platform = platform,
                installSupported = artifact != null,
                message = resolution.message,
            )
        }
        return try {
            val metadata = candidate.metadataFile?.let { metadataFile ->
                withContext(Dispatchers.IO) {
                    require(metadataFile.isFile && !Files.isSymbolicLink(metadataFile.toPath())) {
                        "Managed Wasmtime metadata is missing"
                    }
                    json.decodeFromString<InstalledWasmtimeMetadata>(metadataFile.readText())
                }
            }
            if (metadata != null) {
                require(metadata.version == WASMTIME_VERSION) { "Managed Wasmtime metadata version mismatch" }
                require(metadata.platform == platform) { "Managed Wasmtime metadata platform mismatch" }
                val currentHash = withContext(Dispatchers.IO) { sha256(candidate.executable) }
                require(currentHash == metadata.binarySha256) { "Managed Wasmtime binary SHA-256 mismatch" }
            }
            val detectedVersion = verifyExecutable(candidate.executable)
            require(detectedVersion == WASMTIME_VERSION) {
                "Wasmtime version mismatch: expected $WASMTIME_VERSION, received $detectedVersion"
            }
            WasmtimeRuntimeStatus(
                health = WasmtimeRuntimeHealth.READY,
                source = candidate.source,
                platform = platform,
                executablePath = candidate.executable.canonicalPath,
                detectedVersion = detectedVersion,
                installSupported = artifact != null,
                artifactSha256 = metadata?.artifactSha256,
                binarySha256 = metadata?.binarySha256,
                message = "Wasmtime $detectedVersion 已就绪",
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            WasmtimeRuntimeStatus(
                health = WasmtimeRuntimeHealth.INVALID,
                source = candidate.source,
                platform = platform,
                executablePath = candidate.executable.absolutePath,
                installSupported = artifact != null,
                message = safeRuntimeMessage(error),
            )
        }
    }

    private suspend fun verifyExecutable(executable: File): String {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf(executable.canonicalPath, "--version"),
                workingDirectory = executable.canonicalFile.parentFile,
                timeout = 5.seconds,
                maxOutputChars = 4_096,
                environment = emptyMap(),
                inheritEnvironment = false,
            )
        )
        check(result.exitCode == 0 && !result.timedOut) { "Wasmtime runtime preflight failed" }
        return VERSION_OUTPUT.find(result.output.trim())?.groupValues?.get(1)
            ?: error("Cannot parse Wasmtime version: ${result.output.trim().take(200)}")
    }

    private suspend fun resolveExecutable(
        osName: String,
        architecture: String,
        artifact: WasmtimeRuntimeArtifact?,
    ): RuntimeResolution = withContext(Dispatchers.IO) {
        val environment = environmentProvider()
        val explicit = environment[WASMTIME_ENV]?.trim()?.takeIf(String::isNotBlank)
        if (explicit != null) {
            val executable = File(explicit).absoluteFile
            return@withContext if (isExecutable(executable)) {
                RuntimeResolution(RuntimeCandidate(executable.canonicalFile, WasmtimeRuntimeSource.ENVIRONMENT), message = "")
            } else {
                RuntimeResolution(
                    candidate = null,
                    health = WasmtimeRuntimeHealth.INVALID,
                    source = WasmtimeRuntimeSource.ENVIRONMENT,
                    message = "$WASMTIME_ENV 指向的文件不可执行: ${executable.path}",
                )
            }
        }
        val executableName = executableName(osName)
        resourcesDirectoryProvider()?.let { resourcesDirectory ->
            val packaged = File(resourcesDirectory, "wasmtime/$executableName")
            if (isExecutable(packaged)) {
                return@withContext RuntimeResolution(
                    RuntimeCandidate(packaged.canonicalFile, WasmtimeRuntimeSource.PACKAGED),
                    message = "",
                )
            }
        }
        if (artifact != null) {
            val managedDirectory = File(root, "$WASMTIME_VERSION/${artifact.platform}")
            val managed = File(managedDirectory, executableName)
            if (isExecutable(managed)) {
                return@withContext RuntimeResolution(
                    RuntimeCandidate(
                        executable = managed.canonicalFile,
                        source = WasmtimeRuntimeSource.MANAGED,
                        metadataFile = File(managedDirectory, METADATA_FILE),
                    ),
                    message = "",
                )
            }
        }
        environment["PATH"].orEmpty()
            .split(File.pathSeparatorChar)
            .asSequence()
            .filter(String::isNotBlank)
            .map { directory -> File(directory, executableName) }
            .firstOrNull(::isExecutable)
            ?.let { pathExecutable ->
                return@withContext RuntimeResolution(
                    RuntimeCandidate(pathExecutable.canonicalFile, WasmtimeRuntimeSource.PATH),
                    message = "",
                )
            }
        RuntimeResolution(
            candidate = null,
            health = WasmtimeRuntimeHealth.MISSING,
            source = WasmtimeRuntimeSource.NONE,
            message = if (artifact == null) {
                "当前平台没有受支持的 Wasmtime 自动安装包"
            } else {
                "尚未安装 Wasmtime $WASMTIME_VERSION"
            },
        )
    }
}

private data class RuntimeCandidate(
    val executable: File,
    val source: WasmtimeRuntimeSource,
    val metadataFile: File? = null,
)

private data class RuntimeResolution(
    val candidate: RuntimeCandidate?,
    val health: WasmtimeRuntimeHealth = WasmtimeRuntimeHealth.MISSING,
    val source: WasmtimeRuntimeSource = WasmtimeRuntimeSource.NONE,
    val message: String,
)

private fun officialWasmtimeArtifact(osName: String, architecture: String): WasmtimeRuntimeArtifact? {
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
    val format = if (platform.endsWith("windows")) WasmtimeArchiveFormat.ZIP else WasmtimeArchiveFormat.TAR_XZ
    val extension = if (format == WasmtimeArchiveFormat.ZIP) "zip" else "tar.xz"
    val digest = OFFICIAL_WASMTIME_SHA256.getValue(platform)
    return WasmtimeRuntimeArtifact(
        platform = platform,
        archiveName = "wasmtime-v$WASMTIME_VERSION-$platform.$extension",
        sha256 = digest,
        format = format,
    )
}

private suspend fun downloadWasmtimeArchive(artifact: WasmtimeRuntimeArtifact, destination: File) =
    withContext(Dispatchers.IO) {
        val connection = URI(artifact.downloadUrl).toURL().openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = true
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000
        connection.setRequestProperty("User-Agent", "SwarmEditor/$WASMTIME_VERSION")
        try {
            val status = connection.responseCode
            require(status in 200..299) { "Wasmtime download failed with HTTP $status" }
            val declaredLength = connection.contentLengthLong
            require(declaredLength <= 0 || declaredLength <= MAX_WASMTIME_ARCHIVE_BYTES) {
                "Wasmtime archive exceeds $MAX_WASMTIME_ARCHIVE_BYTES bytes"
            }
            connection.inputStream.use { input ->
                FileOutputStream(destination).use { output ->
                    copyBounded(input, output, MAX_WASMTIME_ARCHIVE_BYTES)
                }
            }
        } finally {
            connection.disconnect()
        }
    }

private fun extractExecutable(
    archive: File,
    artifact: WasmtimeRuntimeArtifact,
    destination: File,
): File {
    val output = File(destination, if (artifact.platform.endsWith("windows")) "wasmtime.exe" else "wasmtime")
    var found = false
    when (artifact.format) {
        WasmtimeArchiveFormat.ZIP -> ZipInputStream(BufferedInputStream(FileInputStream(archive))).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                validateArchiveEntry(entry.name)
                if (!entry.isDirectory && entry.name.substringAfterLast('/') == output.name) {
                    require(!found) { "Wasmtime archive contains multiple executables" }
                    FileOutputStream(output).use { fileOutput ->
                        copyBounded(zip, fileOutput, MAX_WASMTIME_BINARY_BYTES)
                    }
                    found = true
                }
                zip.closeEntry()
            }
        }
        WasmtimeArchiveFormat.TAR_XZ -> TarArchiveInputStream(
            XZCompressorInputStream(BufferedInputStream(FileInputStream(archive))),
        ).use { tar ->
            while (true) {
                val entry = tar.nextEntry ?: break
                validateArchiveEntry(entry.name)
                require(!entry.isSymbolicLink && !entry.isLink) { "Wasmtime archive contains a link entry" }
                if (entry.isFile && entry.name.substringAfterLast('/') == output.name) {
                    require(!found) { "Wasmtime archive contains multiple executables" }
                    require(entry.size in 1..MAX_WASMTIME_BINARY_BYTES) { "Wasmtime binary has an invalid size" }
                    FileOutputStream(output).use { fileOutput ->
                        copyBounded(tar, fileOutput, MAX_WASMTIME_BINARY_BYTES)
                    }
                    found = true
                }
            }
        }
    }
    require(found && output.isFile) { "Wasmtime executable is missing from the release archive" }
    return output
}

private fun installAtomically(staging: File, destination: File, backup: File) {
    destination.parentFile.mkdirs()
    require(!Files.isSymbolicLink(destination.parentFile.toPath())) { "Wasmtime destination parent cannot be a symbolic link" }
    if (destination.exists()) movePath(destination, backup)
    try {
        movePath(staging, destination)
        deleteTreeSafely(backup)
    } catch (error: Throwable) {
        if (destination.exists()) deleteTreeSafely(destination)
        if (backup.exists()) movePath(backup, destination)
        throw error
    }
}

private fun movePath(source: File, destination: File) {
    try {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE)
    } catch (_: AtomicMoveNotSupportedException) {
        Files.move(source.toPath(), destination.toPath())
    }
}

private fun deleteTreeSafely(root: File) {
    if (!root.exists() && !Files.isSymbolicLink(root.toPath())) return
    Files.walk(root.toPath()).use { paths ->
        paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
    }
}

private fun validateArchiveEntry(name: String) {
    val normalized = name.replace('\\', '/')
    require(normalized.isNotBlank() && !normalized.startsWith('/')) { "Invalid Wasmtime archive entry" }
    require(normalized.split('/').none { it == ".." }) { "Wasmtime archive entry escapes extraction root" }
}

private fun copyBounded(input: java.io.InputStream, output: java.io.OutputStream, maxBytes: Long) {
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0L
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        total += count
        require(total <= maxBytes) { "Wasmtime payload exceeds $maxBytes bytes" }
        output.write(buffer, 0, count)
    }
}

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

private fun isExecutable(file: File): Boolean =
    file.isFile && !Files.isSymbolicLink(file.toPath()) && file.canExecute()

private fun executableName(osName: String): String =
    if (osName.lowercase().contains("windows")) "wasmtime.exe" else "wasmtime"

private fun platformLabel(osName: String, architecture: String): String =
    "${osName.lowercase().replace(Regex("[^a-z0-9]+"), "-")}-${architecture.lowercase()}"

private fun safeRuntimeMessage(error: Throwable): String = error.message
    ?.replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
    ?.trim()
    ?.take(500)
    ?.ifBlank { null }
    ?: error::class.simpleName.orEmpty().ifBlank { "Wasmtime runtime is invalid" }

private const val WASMTIME_ENV = "SWARM_WASMTIME"
private const val METADATA_FILE = "runtime.json"
private const val MAX_WASMTIME_ARCHIVE_BYTES = 64L * 1024 * 1024
private const val MAX_WASMTIME_BINARY_BYTES = 128L * 1024 * 1024
private val VERSION_OUTPUT = Regex("^wasmtime\\s+([^\\s]+)")
private val X64_ARCHITECTURES = setOf("amd64", "x86_64")
private val ARM64_ARCHITECTURES = setOf("aarch64", "arm64")
private val OFFICIAL_WASMTIME_SHA256 = mapOf(
    "x86_64-linux" to "9ec85751649139711b6a5061c4f48a41412bf9b1ab98a08b9924ca73f22ca575",
    "aarch64-linux" to "5bb3fe06876a1c3f4043781590b4c0a69e9237549023ccd441c18083f11decd5",
    "x86_64-macos" to "548b37f774d55e845f1d0407d9d9bbba8799cbabe45d617d5d0127706badd08b",
    "aarch64-macos" to "06d53af42ef3cbef5c7d44c14a6693b3456ac3d9df00950fb202075e27314f3e",
    "x86_64-windows" to "7faa93ad570275bbbc470178802ddff5b3552f07d7f8dca152139fc964926a29",
    "aarch64-windows" to "78181df3da6b6f9c8edee71809631d1a12ba6ec42436940ce22eadad29604f3c",
)
