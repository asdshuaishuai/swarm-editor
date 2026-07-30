package com.swarmeditor.backend.mcp

import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import kotlinx.coroutines.test.runTest
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class McpStoreTest {
    @Test
    fun `persists and reloads complete http server configuration`() = runTest {
        val directory = createTempDirectory("mcp-store-").toFile()
        val file = File(directory, "mcp.json")
        val expected = McpServerConfig(
            id = "remote-search",
            name = "Remote Search",
            type = McpServerType.HTTP,
            env = mapOf("LOG_LEVEL" to "debug"),
            url = "https://mcp.example.test",
            enabledAgents = mapOf("claude-code" to true, "qwen-code" to false),
            description = "Remote search tools",
            tags = listOf("search", "remote"),
            bearerTokenEnvVar = "MCP_TOKEN",
            headers = mapOf("X-Tenant" to "swarm"),
            disabled = true
        )

        McpStore(file).upsert(expected)
        val reloaded = McpStore(file).also { it.load() }.get(expected.id)

        assertEquals(expected.copy(enabledAgents = mapOf("pi-default" to true)), reloaded)
        directory.deleteRecursively()
    }

    @Test
    fun `dynamic pi profile authorization survives persistence`() = runTest {
        val directory = createTempDirectory("mcp-profile-access-").toFile()
        try {
            val file = File(directory, "mcp.json")
            val expected = McpServerConfig(
                id = "review-tools",
                name = "Review Tools",
                command = "review-mcp",
                enabledAgents = mapOf("pi-default" to true, "pi-review" to false),
            )

            McpStore(file).upsert(expected)
            val reloaded = McpStore(file).also { it.load() }.get(expected.id)

            assertEquals(expected, reloaded)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `reload replaces stale in-memory entries`() = runTest {
        val directory = createTempDirectory("mcp-reload-").toFile()
        val file = File(directory, "mcp.json")
        val store = McpStore(file)
        store.upsert(McpServerConfig(id = "stale", name = "Stale", command = "old"))

        McpStore(file).apply {
            delete("stale")
            upsert(McpServerConfig(id = "fresh", name = "Fresh", command = "new"))
        }
        store.load()

        assertEquals(listOf("fresh"), store.getAll().map { it.id })
        directory.deleteRecursively()
    }

    @Test
    fun `reload clears memory when config file was removed`() = runTest {
        val directory = createTempDirectory("mcp-removed-").toFile()
        val file = File(directory, "mcp.json")
        val store = McpStore(file)
        store.upsert(McpServerConfig(id = "removed", name = "Removed", command = "old"))

        file.delete()
        store.load()

        assertEquals(emptyList(), store.getAll())
        directory.deleteRecursively()
    }

    @Test
    fun `reload quarantines malformed configuration without discarding memory`() = runTest {
        val directory = createTempDirectory("mcp-malformed-").toFile()
        val file = File(directory, "mcp.json")
        val store = McpStore(file)
        val existing = McpServerConfig(id = "existing", name = "Existing", command = "ok")
        store.upsert(existing)
        file.writeText("not json")

        store.load()
        assertEquals(listOf(existing), store.getAll())
        assertFalse(file.exists())
        assertEquals(1, directory.listFiles().orEmpty().count { it.name.startsWith("mcp.json.corrupt-") })
        directory.deleteRecursively()
    }

    @Test
    fun `oversized mcp update rolls back memory and disk`() = runTest {
        val directory = createTempDirectory("mcp-size-").toFile()
        try {
            val file = File(directory, "mcp.json")
            val store = McpStore(file, maxFileBytes = 500)

            assertFailsWith<IllegalArgumentException> {
                store.upsert(McpServerConfig(id = "large", name = "Large", description = "x".repeat(2_000)))
            }

            assertEquals(emptyList(), store.getAll())
            assertFalse(file.exists())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `upsert rolls back memory when store file cannot be written`() = runTest {
        val parentFile = createTempDirectory("mcp-store-parent-").toFile().resolve("not-a-directory").apply { writeText("file") }
        try {
            val store = McpStore(File(parentFile, "mcp.json"))
            val server = McpServerConfig(id = "broken", name = "Broken", command = "mcp")

            assertFailsWith<Exception> { store.upsert(server) }
            assertEquals(emptyList(), store.getAll())
        } finally {
            parentFile.delete()
            parentFile.parentFile?.deleteRecursively()
        }
    }
}
