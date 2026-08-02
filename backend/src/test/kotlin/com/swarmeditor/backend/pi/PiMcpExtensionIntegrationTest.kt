package com.swarmeditor.backend.pi

import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PiMcpExtensionIntegrationTest {
    @Test
    fun `pi loads tools from configured stdio mcp server`() = runTest {
        val projectRoot = File(System.getProperty("user.dir")).let { directory ->
            generateSequence(directory) { it.parentFile }
                .first { File(it, "pi-0.83.0").isDirectory }
        }
        val runtime = PiRuntimeDistribution(projectRoot)
        val directory = Files.createTempDirectory("pi-mcp-integration").toFile()
        try {
            val agentDirectory = directory.resolve("agent")
            PiMcpExtensionInstaller.install(agentDirectory)
            val fakeServer = requireNotNull(javaClass.getResource("/pi/fake-mcp-server.js"))
                .toURI()
                .let(::File)
            val config = directory.resolve("mcp-servers.json").apply {
                writeText(
                    """{
                      "servers": {
                        "fake": {
                          "name": "Fake MCP",
                          "type": "stdio",
                          "command": "node",
                          "args": [${Json.encodeToString(fakeServer.absolutePath)}],
                          "enabledAgents": {"pi-default": true}
                        }
                      }
                    }""".trimIndent()
                )
            }
            val process = ProcessBuilder(
                "node",
                runtime.entrypoint.absolutePath,
                "--session-dir",
                directory.resolve("sessions").absolutePath,
                "--name",
                "mcp-integration",
                "--approve",
            ).directory(projectRoot).apply {
                environment()["PI_CODING_AGENT_DIR"] = agentDirectory.absolutePath
                environment()["SWARM_PI_AGENT_ID"] = "pi-default"
                environment()["SWARM_EDITOR_MCP_CONFIG"] = config.absolutePath
            }.start()
            try {
                withContext(Dispatchers.IO) {
                    process.outputStream.bufferedWriter().use { writer ->
                        writer.write("{\"id\":\"1\",\"type\":\"get_state\"}")
                        writer.newLine()
                        writer.flush()
                        val response = withTimeout(15_000) {
                            process.inputStream.bufferedReader().lineSequence()
                                .first { line -> line.contains("\"id\":\"1\"") }
                        }
                        val tools = Json.parseToJsonElement(response).jsonObject["data"]
                            ?.jsonObject
                            ?.get("tools")
                            ?.jsonArray
                            .orEmpty()
                        assertTrue(tools.any { tool ->
                            tool.jsonObject["name"]?.jsonPrimitive?.content == "mcp_fake_echo"
                        })
                    }
                }
            } finally {
                process.destroy()
                if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
            }
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `registered pi tool forwards calls to stdio mcp server`() = runTest {
        val projectRoot = projectRoot()
        val piRoot = projectRoot.resolve("pi-0.83.0")
        val directory = Files.createTempDirectory(piRoot.toPath(), ".pi-mcp-call-").toFile()
        try {
            val agentDirectory = directory.resolve("agent")
            PiMcpExtensionInstaller.install(agentDirectory)
            val fakeServer = resourceFile("/pi/fake-mcp-server.js")
            val harness = resourceFile("/pi/mcp-extension-harness.js")
            val config = directory.resolve("mcp-servers.json").apply {
                writeText(
                    """{
                      "servers": {
                        "fake": {
                          "name": "Fake MCP",
                          "type": "stdio",
                          "command": "node",
                          "args": [${Json.encodeToString(fakeServer.absolutePath)}],
                          "enabledAgents": {"pi-default": true}
                        }
                      }
                    }""".trimIndent()
                )
            }
            val extension = agentDirectory.resolve("extensions/swarm-mcp.js")
            val process = ProcessBuilder(
                "node",
                harness.absolutePath,
                extension.absolutePath,
                "mcp_fake_echo",
                "{\"text\":\"round trip\"}",
            ).directory(projectRoot).redirectErrorStream(true).apply {
                environment()["SWARM_PI_AGENT_ID"] = "pi-default"
                environment()["SWARM_EDITOR_MCP_CONFIG"] = config.absolutePath
            }.start()

            val output = withContext(Dispatchers.IO) {
                assertTrue(process.waitFor(15, TimeUnit.SECONDS), "MCP tool harness timed out")
                process.inputStream.bufferedReader().readLines().last()
            }
            val result = Json.parseToJsonElement(output).jsonObject
            assertFalse(result["isError"]?.jsonPrimitive?.content?.toBooleanStrict() ?: true)
            assertEquals(
                "round trip",
                result["content"]?.jsonArray?.single()?.jsonObject?.get("text")?.jsonPrimitive?.content
            )
            assertEquals(
                "fake",
                result["details"]?.jsonObject?.get("mcpServerId")?.jsonPrimitive?.content
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun projectRoot(): File = File(System.getProperty("user.dir")).let { directory ->
        generateSequence(directory) { it.parentFile }
            .first { File(it, "pi-0.83.0").isDirectory }
    }

    private fun resourceFile(path: String): File = requireNotNull(javaClass.getResource(path))
        .toURI()
        .let(::File)
}
