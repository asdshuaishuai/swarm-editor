package com.swarmeditor.backend.lsp

import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream

class KotlinLspRuntimeManagerTest {
    @Test
    fun `managed install verifies archive and detects launcher tampering`() = runTest {
        val root = Files.createTempDirectory("kotlin-lsp-runtime")
        val archive = root.resolve("fixture.zip").toFile()
        createArchive(archive, launcherContent = "managed-launcher")
        val artifact = fixtureArtifact(sha256(archive))
        val manager = KotlinLspRuntimeManager(
            installRoot = root.resolve("install").toFile(),
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination -> archive.copyTo(destination, overwrite = true) },
        )

        val installed = manager.install()

        assertEquals(KotlinLspRuntimeHealth.READY, installed.health)
        assertEquals(KotlinLspRuntimeSource.MANAGED, installed.source)
        assertEquals(installed.command, manager.managedCommandOrNull())
        assertTrue("--stdio" in installed.command)
        assertEquals(artifact.sha256, installed.artifactSha256)

        File(installed.command.first()).writeText("tampered")
        val invalid = manager.inspect()

        assertEquals(KotlinLspRuntimeHealth.INVALID, invalid.health)
        assertTrue(invalid.message.contains("SHA-256"))
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
        val artifact = fixtureArtifact(sha256(archive))
        val manager = KotlinLspRuntimeManager(
            installRoot = root.resolve("install").toFile(),
            environmentProvider = { emptyMap() },
            osNameProvider = { "Linux" },
            architectureProvider = { "amd64" },
            artifactProvider = { _, _ -> artifact },
            downloader = { _, destination -> archive.copyTo(destination, overwrite = true) },
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

    private fun fixtureArtifact(sha256: String) = KotlinLspRuntimeArtifact(
        platform = "test-linux",
        archiveName = "fixture.zip",
        sha256 = sha256,
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
