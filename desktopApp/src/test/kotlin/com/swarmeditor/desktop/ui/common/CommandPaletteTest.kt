package com.swarmeditor.desktop.ui.common

import androidx.compose.ui.graphics.Color
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.backend.pi.PiCommandInfo
import kotlin.test.Test
import kotlin.test.assertEquals

class CommandPaletteTest {
    @Test
    fun `command palette exposes only the primary agent configuration`() {
        val commands = buildCommands(
            listOf(
                AgentInfo(
                    id = "pi-default",
                    name = "主智能体",
                    emoji = "",
                    color = Color.Magenta,
                )
            )
        )

        val agentCommands = commands.filter { it.group == "主智能体配置" }
        assertEquals(1, agentCommands.size)
        assertEquals("agent-config:pi-default", agentCommands.single().id)
        assertEquals("配置 主智能体", agentCommands.single().name)
    }

    @Test
    fun `command palette groups live pi commands by source`() {
        val commands = buildCommands(
            agents = emptyList(),
            piCommands = listOf(
                PiCommandInfo("skill:review", "Review changes", "skill"),
                PiCommandInfo("release", "Prepare release", "prompt"),
                PiCommandInfo("mcp-status", "", "extension"),
            ),
        )

        assertEquals("Pi Skills", commands.single { it.id == "pi-command:skill:review" }.group)
        assertEquals("Pi Prompt Templates", commands.single { it.id == "pi-command:release" }.group)
        assertEquals("Pi Extensions", commands.single { it.id == "pi-command:mcp-status" }.group)
    }
}
