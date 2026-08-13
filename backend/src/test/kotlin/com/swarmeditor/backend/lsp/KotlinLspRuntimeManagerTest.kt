package com.swarmeditor.backend.lsp

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CancellationException
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream

class KotlinLspRuntimeManagerTest {
    @Test
    fun `managed install verifies archive and detects launcher tampering`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-runtime")
        val archive = root.resolve("fixture.zip").toFile()
        createArchive(archive, launcherContent = "managed-launcher")
        val artifact = fixtureArtifact(sha256(archive), archive.length())
        val manager = KotlinLspRuntimeManager(
            installRoot = root.resolve("install").toFile(),
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, _ -> archive.copyTo(destination, overwrite = true) },
        )

        val installed = manager.install()
        val projectRoot = root.resolve("project").toFile().apply { mkdirs() }
        val managedCommand = manager.managedCommandOrNull(projectRoot)

        assertEquals(KotlinLspRuntimeHealth.READY, installed.health)
        assertEquals(KotlinLspRuntimeSource.MANAGED, installed.source)
        assertTrue("--stdio" in installed.command)
        assertTrue("--system-path" in managedCommand.orEmpty())
        assertEquals(artifact.sha256, installed.artifactSha256)

        File(installed.command.first()).writeText("tampered")
        val invalid = manager.inspect()

        assertEquals(KotlinLspRuntimeHealth.INVALID, invalid.health)
        assertTrue(invalid.message.contains("SHA-256"))
        root.toFile().deleteRecursively()
    }

    @Test
    fun `managed system paths are stable and isolated per project`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-workspaces")
        val archive = root.resolve("fixture.zip").toFile()
        createArchive(archive, launcherContent = "managed-launcher")
        val artifact = fixtureArtifact(sha256(archive), archive.length())
        val installRoot = root.resolve("install").toFile()
        val manager = KotlinLspRuntimeManager(
            installRoot = installRoot,
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, _ -> archive.copyTo(destination, overwrite = true) },
        )
        manager.install()
        val firstProject = root.resolve("first-project").toFile().apply { mkdirs() }
        val secondProject = root.resolve("second-project").toFile().apply { mkdirs() }

        val firstCommand = requireNotNull(manager.managedCommandOrNull(firstProject))
        val repeatedCommand = requireNotNull(manager.managedCommandOrNull(firstProject))
        val secondCommand = requireNotNull(manager.managedCommandOrNull(secondProject))
        val firstSystemPath = File(firstCommand[firstCommand.indexOf("--system-path") + 1]).canonicalFile
        val secondSystemPath = File(secondCommand[secondCommand.indexOf("--system-path") + 1]).canonicalFile
        val managedRoot = File(
            installRoot,
            "system/$KOTLIN_LSP_RUNTIME_VERSION/${artifact.platform}/workspaces",
        ).canonicalFile

        assertEquals(firstCommand, repeatedCommand)
        assertTrue(firstSystemPath != secondSystemPath)
        assertTrue(firstSystemPath.toPath().startsWith(managedRoot.toPath()))
        assertTrue(secondSystemPath.toPath().startsWith(managedRoot.toPath()))
        assertTrue(firstSystemPath.isDirectory)
        assertTrue(secondSystemPath.isDirectory)
        root.toFile().deleteRecursively()
    }

    @Test
    fun `archive traversal is rejected before publishing runtime`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-traversal")
        val archive = root.resolve("traversal.zip").toFile()
        ZipArchiveOutputStream(archive).use { zip ->
            zip.putArchiveEntry(ZipArchiveEntry("../escaped"))
            zip.write("escape".toByteArray())
            zip.closeArchiveEntry()
        }
        val artifact = fixtureArtifact(sha256(archive), archive.length())
        val manager = KotlinLspRuntimeManager(
            installRoot = root.resolve("install").toFile(),
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, _ -> archive.copyTo(destination, overwrite = true) },
        )

        assertFailsWith<IllegalArgumentException> { manager.install() }
        assertTrue(!root.resolve("escaped").toFile().exists())
        root.toFile().deleteRecursively()
    }

    @Test
    fun `explicit command overrides managed and path discovery`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-override")
        val executable = root.resolve("custom-kotlin-lsp").toFile().apply {
            writeText("custom")
            setExecutable(true)
        }
        val manager = KotlinLspRuntimeManager(
            installRoot = root.resolve("install").toFile(),
            environmentProvider = { mapOf("SWARM_LSP_KOTLIN" to "${executable.absolutePath} --stdio") },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> fixtureArtifact("a".repeat(64)) },
        )

        val status = manager.inspect()

        assertEquals(KotlinLspRuntimeHealth.READY, status.health)
        assertEquals(KotlinLspRuntimeSource.OVERRIDE, status.source)
        assertEquals(listOf(executable.absolutePath, "--stdio"), status.command)
        root.toFile().deleteRecursively()
    }

    @Test
    fun `cancelled download is retained and resumed on the next install`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-resume")
        val archive = root.resolve("fixture.zip").toFile()
        createArchive(archive, launcherContent = "managed-launcher")
        val bytes = archive.readBytes()
        val split = bytes.size / 2
        val artifact = fixtureArtifact(sha256(archive), archive.length())
        val installRoot = root.resolve("install").toFile()
        val firstManager = KotlinLspRuntimeManager(
            installRoot = installRoot,
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, progress ->
                destination.writeBytes(bytes.copyOfRange(0, split))
                progress(KotlinLspDownloadProgress(split.toLong(), bytes.size.toLong(), resumed = false))
                throw CancellationException("interrupted")
            },
        )

        assertFailsWith<CancellationException> { firstManager.install() }
        val partial = installRoot.resolve(".${artifact.archiveName}.partial")
        assertEquals(split.toLong(), partial.length())

        var resumedFrom = 0L
        val secondManager = KotlinLspRuntimeManager(
            installRoot = installRoot,
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, progress ->
                resumedFrom = destination.length()
                FileOutputStream(destination, true).use { output -> output.write(bytes, split, bytes.size - split) }
                progress(KotlinLspDownloadProgress(bytes.size.toLong(), bytes.size.toLong(), resumed = true))
            },
        )

        assertEquals(KotlinLspRuntimeHealth.READY, secondManager.install().health)
        assertEquals(split.toLong(), resumedFrom)
        assertTrue(!partial.exists())
        root.toFile().deleteRecursively()
    }

    @Test
    fun `legacy randomized download is adopted as the resumable partial`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-legacy-partial")
        val archive = root.resolve("fixture.zip").toFile()
        createArchive(archive, launcherContent = "managed-launcher")
        val bytes = archive.readBytes()
        val artifact = fixtureArtifact(sha256(archive), archive.length())
        val installRoot = root.resolve("install").toFile().apply { mkdirs() }
        val legacy = installRoot.resolve(".${artifact.archiveName}.oldnonce.download")
        legacy.writeBytes(bytes.copyOfRange(0, bytes.size / 3))
        var adoptedLength = 0L
        val manager = KotlinLspRuntimeManager(
            installRoot = installRoot,
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination, _ ->
                adoptedLength = destination.length()
                FileOutputStream(destination, true).use { output ->
                    output.write(bytes, adoptedLength.toInt(), bytes.size - adoptedLength.toInt())
                }
            },
        )

        assertEquals(KotlinLspRuntimeHealth.READY, manager.install().health)
        assertEquals((bytes.size / 3).toLong(), adoptedLength)
        assertTrue(!legacy.exists())
        root.toFile().deleteRecursively()
    }

    private fun fixtureArtifact(sha256: String, sizeBytes: Long = 1) = KotlinLspRuntimeArtifact(
        platform = "test-linux",
        archiveName = "fixture.zip",
        sha256 = sha256,
        sizeBytes = sizeBytes,
        format = KotlinLspArchiveFormat.ZIP,
        launcherRelativePath = "bin/intellij-server",
    )

    private fun createArchive(file: File, launcherContent: String) {
        ZipArchiveOutputStream(file).use { zip ->
            listOf(
                "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION/",
                "kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION/bin/",
            ).forEach { name ->
                zip.putArchiveEntry(ZipArchiveEntry(name).apply { unixMode = 0b111101101 })
                zip.closeArchiveEntry()
            }
            val launcher = ZipArchiveEntry("kotlin-server-$KOTLIN_LSP_RUNTIME_VERSION/bin/intellij-server").apply {
                unixMode = 0b111101101
            }
            zip.putArchiveEntry(launcher)
            zip.write(launcherContent.toByteArray())
            zip.closeArchiveEntry()
        }
    }

    private fun sha256(file: File): String = MessageDigest.getInstance("SHA-256")
        .digest(file.readBytes())
        .joinToString("") { byte -> "%02x".format(byte) }
}
