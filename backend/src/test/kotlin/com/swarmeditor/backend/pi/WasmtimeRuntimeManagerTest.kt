package com.swarmeditor.backend.pi

import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalPathApi::class)
class WasmtimeRuntimeManagerTest {
    @Test
    fun `managed install verifies archive and detects binary tampering`() = runTest {
        val root = kotlin.io.path.createTempDirectory("wasmtime-runtime-")
        val archive = zipArchive("release/wasmtime.exe", "trusted-runtime".encodeToByteArray())
        val artifact = WasmtimeRuntimeArtifact(
            platform = "test-windows",
            archiveName = "wasmtime-test.zip",
            sha256 = sha256(archive),
            format = WasmtimeArchiveFormat.ZIP,
        )
        try {
            val manager = WasmtimeRuntimeManager(
                installRoot = root.toFile(),
                environmentProvider = { emptyMap() },
                resourcesDirectoryProvider = { null },
                osNameProvider = { "Windows 11" },
                architectureProvider = { "amd64" },
                commandRunner = CommandRunner {
                    CommandResult(0, "wasmtime $WASMTIME_VERSION (test)", 1)
                },
                artifactProvider = { _, _ -> artifact },
                downloader = { _, destination -> destination.writeBytes(archive) },
            )

            val installed = manager.install()

            assertEquals(WasmtimeRuntimeHealth.READY, installed.health)
            assertEquals(WasmtimeRuntimeSource.MANAGED, installed.source)
            assertEquals(artifact.sha256, installed.artifactSha256)
            val executable = File(assertNotNull(installed.executablePath))
            assertTrue(executable.isFile)
            executable.appendText("tampered")

            val invalid = manager.inspect()

            assertEquals(WasmtimeRuntimeHealth.INVALID, invalid.health)
            assertTrue(invalid.message.contains("SHA-256 mismatch"))
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `archive digest mismatch never installs runtime`() = runTest {
        val root = kotlin.io.path.createTempDirectory("wasmtime-runtime-invalid-")
        val archive = zipArchive("release/wasmtime.exe", "runtime".encodeToByteArray())
        val artifact = WasmtimeRuntimeArtifact(
            platform = "test-windows",
            archiveName = "wasmtime-test.zip",
            sha256 = "0".repeat(64),
            format = WasmtimeArchiveFormat.ZIP,
        )
        try {
            val manager = WasmtimeRuntimeManager(
                installRoot = root.toFile(),
                environmentProvider = { emptyMap() },
                resourcesDirectoryProvider = { null },
                osNameProvider = { "Windows 11" },
                architectureProvider = { "amd64" },
                commandRunner = CommandRunner {
                    CommandResult(0, "wasmtime $WASMTIME_VERSION", 1)
                },
                artifactProvider = { _, _ -> artifact },
                downloader = { _, destination -> destination.writeBytes(archive) },
            )

            val failure = runCatching { manager.install() }.exceptionOrNull()

            assertNotNull(failure)
            assertTrue(failure.message.orEmpty().contains("SHA-256 mismatch"))
            assertTrue(root.toFile().walkTopDown().none { it.name == "wasmtime.exe" })
        } finally {
            root.deleteRecursively()
        }
    }

    private fun zipArchive(path: String, content: ByteArray): ByteArray = ByteArrayOutputStream().use { bytes ->
        ZipOutputStream(bytes).use { zip ->
            zip.putNextEntry(ZipEntry(path))
            zip.write(content)
            zip.closeEntry()
        }
        bytes.toByteArray()
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }
}
