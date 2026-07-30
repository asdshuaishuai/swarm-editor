package com.swarmeditor.backend.mcp

import com.swarmeditor.common.model.McpServerType
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class UserMcpScannerTest {
    @Test
    fun `scans JSON and Codex TOML MCP sources and deduplicates equal connections`() = runTest {
        val directory = createTempDirectory("user-mcp-").toFile()
        try {
            val jsonFile = File(directory, "gemini.json").apply {
                writeText(
                    """
                    {
                      "mcpServers": {
                        "search": {
                          "command": "search-mcp",
                          "args": ["--stdio"],
                          "env": {"MODE": "fast"}
                        },
                        "remote": {
                          "url": "https://example.test/mcp",
                          "type": "http"
                        }
                      }
                    }
                    """.trimIndent()
                )
            }
            val tomlFile = File(directory, "config.toml").apply {
                writeText(
                    """
                    [mcp_servers.search]
                    command = "search-mcp"
                    args = ["--stdio"]
                    [mcp_servers.search.env]
                    MODE = "fast"
                    [mcp_servers.other]
                    command = "other-mcp"
                    """.trimIndent()
                )
            }
            val scanner = UserMcpScanner(
                listOf(
                    UserMcpConfigSource("gemini", jsonFile, UserMcpConfigFormat.JSON),
                    UserMcpConfigSource("codex", tomlFile, UserMcpConfigFormat.TOML)
                )
            )

            val servers = scanner.scan()

            assertEquals(3, servers.size)
            assertEquals(setOf("search", "remote", "other"), servers.map { it.name }.toSet())
            assertEquals(McpServerType.HTTP, servers.first { it.name == "remote" }.type)
            assertTrue(servers.first { it.name == "search" }.tags.contains("source:gemini"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `invalid and oversized sources are skipped without modifying external files`() = runTest {
        val directory = createTempDirectory("user-mcp-invalid-").toFile()
        try {
            val invalidBytes = byteArrayOf('{'.code.toByte(), '"'.code.toByte(), 0xC3.toByte(), 0x28)
            val invalid = File(directory, "invalid.json").apply { writeBytes(invalidBytes) }
            val oversizedContent = "x".repeat(1_000)
            val oversized = File(directory, "oversized.toml").apply { writeText(oversizedContent) }
            val valid = File(directory, "valid.json").apply {
                writeText("""{"mcpServers":{"ok":{"command":"ok-mcp"}}}""")
            }
            val scanner = UserMcpScanner(
                sources = listOf(
                    UserMcpConfigSource("invalid", invalid, UserMcpConfigFormat.JSON),
                    UserMcpConfigSource("oversized", oversized, UserMcpConfigFormat.TOML),
                    UserMcpConfigSource("valid", valid, UserMcpConfigFormat.JSON),
                ),
                maxFileBytes = 200,
            )

            val servers = scanner.scan()

            assertEquals(listOf("ok"), servers.map { it.name })
            assertTrue(invalid.readBytes().contentEquals(invalidBytes))
            assertEquals(oversizedContent, oversized.readText())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `source server limit skips only the offending source`() = runTest {
        val directory = createTempDirectory("user-mcp-limit-").toFile()
        try {
            val crowded = File(directory, "crowded.json").apply {
                writeText(
                    """
                    {"mcpServers":{
                      "one":{"command":"one"},
                      "two":{"command":"two"},
                      "three":{"command":"three"}
                    }}
                    """.trimIndent()
                )
            }
            val valid = File(directory, "valid.json").apply {
                writeText("""{"mcpServers":{"kept":{"command":"kept"}}}""")
            }
            val scanner = UserMcpScanner(
                sources = listOf(
                    UserMcpConfigSource("crowded", crowded, UserMcpConfigFormat.JSON),
                    UserMcpConfigSource("valid", valid, UserMcpConfigFormat.JSON),
                ),
                maxServersPerSource = 2,
            )

            assertEquals(listOf("kept"), scanner.scan().map { it.name })
        } finally {
            directory.deleteRecursively()
        }
    }
}
