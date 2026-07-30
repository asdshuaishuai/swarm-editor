package com.swarmeditor.backend.pi

import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertTrue

class PiMcpExtensionInstallerTest {
    @Test
    fun `installs bundled extension into agent directory`() = runTest {
        val directory = Files.createTempDirectory("pi-mcp-extension").toFile()
        try {
            PiMcpExtensionInstaller.install(directory)

            val extension = directory.resolve("extensions/swarm-mcp.js")
            assertTrue(extension.isFile)
            assertTrue(extension.readText().contains("registerTool"))
            assertTrue(extension.readText().contains("tools/list"))
        } finally {
            directory.deleteRecursively()
        }
    }
}
