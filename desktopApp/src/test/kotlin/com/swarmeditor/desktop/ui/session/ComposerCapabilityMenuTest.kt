package com.swarmeditor.desktop.ui.chat

import com.swarmeditor.backend.pi.PiCommandInfo
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.McpToolDto
import kotlin.test.Test
import kotlin.test.assertEquals

class ComposerCapabilityMenuTest {
    @Test
    fun `mcp menu includes only bridged active tools allowed for current agent`() {
        val servers = listOf(
            McpServerDto(
                id = "ready",
                name = "Ready",
                runtimeStatus = McpRuntimeStatus.BRIDGED,
                enabledAgents = mapOf("pi-default" to true),
                tools = listOf(McpToolDto("mcp_ready_search", active = true)),
            ),
            McpServerDto(
                id = "other-agent",
                name = "Other",
                runtimeStatus = McpRuntimeStatus.BRIDGED,
                enabledAgents = mapOf("other" to true),
                tools = listOf(McpToolDto("mcp_other_search", active = true)),
            ),
            McpServerDto(
                id = "configured",
                name = "Configured",
                runtimeStatus = McpRuntimeStatus.CONFIGURED,
                tools = listOf(McpToolDto("mcp_configured_search", active = true)),
            ),
            McpServerDto(
                id = "inactive",
                name = "Inactive",
                runtimeStatus = McpRuntimeStatus.BRIDGED,
                tools = listOf(McpToolDto("mcp_inactive_search", active = false)),
            ),
        )

        assertEquals(listOf("ready"), callableMcpServers(servers, "pi-default").map { it.id })
    }

    @Test
    fun `skill menu follows commands registered by current pi session`() {
        val commands = listOf(
            PiCommandInfo("skill:review", "Review changes", "skill"),
            PiCommandInfo("release", "Release prompt", "prompt"),
            PiCommandInfo("skill:review", "Duplicate", "skill"),
            PiCommandInfo("extension-status", "Extension", "extension"),
        )

        assertEquals(listOf("skill:review"), callableSkillCommands(commands).map { it.name })
    }
}
