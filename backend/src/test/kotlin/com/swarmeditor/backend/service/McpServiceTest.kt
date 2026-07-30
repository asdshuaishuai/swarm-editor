package com.swarmeditor.backend.service

import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.mcp.UserMcpConfigFormat
import com.swarmeditor.backend.mcp.UserMcpConfigSource
import com.swarmeditor.backend.mcp.UserMcpScanner
import com.swarmeditor.common.model.McpServerConfig
import kotlinx.coroutines.test.runTest
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals

class McpServiceTest {
    @Test
    fun `upsert persists and refreshes in-memory MCP state`() = runTest {
        val directory = createTempDirectory("mcp-service-").toFile()
        val service = McpService(McpStore(File(directory, "mcp.json")))
        val server = McpServerConfig(id = "search", name = "Search", command = "search-mcp")

        service.upsert(server).getOrThrow()

        assertEquals(listOf(server), service.servers.value)
        directory.deleteRecursively()
    }

    @Test
    fun `reload reflects configuration written by another store instance`() = runTest {
        val directory = createTempDirectory("mcp-service-reload-").toFile()
        val file = File(directory, "mcp.json")
        val service = McpService(McpStore(file))
        val externalStore = McpStore(file)
        val server = McpServerConfig(id = "external", name = "External", command = "external-mcp")
        externalStore.upsert(server)

        service.reload().getOrThrow()

        assertEquals(listOf(server), service.servers.value)
        directory.deleteRecursively()
    }

    @Test
    fun `configuration changes invalidate running pi sessions`() = runTest {
        val directory = createTempDirectory("mcp-service-invalidate-").toFile()
        var invalidations = 0
        val service = McpService(
            McpStore(File(directory, "mcp.json")),
            invalidateAllRuntimes = { invalidations++ }
        )
        val server = McpServerConfig(id = "search", name = "Search", command = "search-mcp")

        service.upsert(server).getOrThrow()
        service.delete(server.id).getOrThrow()

        assertEquals(2, invalidations)
        directory.deleteRecursively()
    }

    @Test
    fun `reload imports user MCP configuration without duplicating a manual connection`() = runTest {
        val directory = createTempDirectory("mcp-service-discovery-").toFile()
        try {
            val config = File(directory, "mcp.json").apply {
                writeText("""{"mcpServers":{"search":{"command":"search-mcp"}}}""")
            }
            val store = McpStore(File(directory, "swarm.json"))
            store.upsert(
                McpServerConfig(
                    id = "user:json:search:old",
                    name = "Search",
                    command = "search-mcp",
                    enabledAgents = mapOf("review-agent" to true)
                )
            )
            val service = McpService(
                store,
                userScanner = UserMcpScanner(
                    listOf(UserMcpConfigSource("json", config, UserMcpConfigFormat.JSON))
                )
            )

            service.reload().getOrThrow()

            assertEquals(1, service.servers.value.size)
            assertEquals("search-mcp", service.servers.value.single().command)
            assertEquals(mapOf("review-agent" to true), service.servers.value.single().enabledAgents)
        } finally {
            directory.deleteRecursively()
        }
    }
}
