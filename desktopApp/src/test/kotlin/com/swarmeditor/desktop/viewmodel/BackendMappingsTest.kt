package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.pi.PiToolInfo
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.theme.AgentClaude
import kotlin.test.Test
import kotlin.test.assertEquals

class BackendMappingsTest {
    @Test
    fun `internal runtime identity maps to primary agent presentation`() {
        val agent = AgentRuntimeInfo(
            config = AgentConfig(id = "pi-default", name = "Pi"),
            status = AgentStatus.CONNECTED,
            version = "0.80.10"
        ).toUiAgent()

        assertEquals("主智能体", agent.name)
        assertEquals("主", agent.letter)
        assertEquals("编辑器内置的智能执行核心", agent.description)
    }

    @Test
    fun `dynamic profile preserves its own presentation identity`() {
        val agent = AgentRuntimeInfo(
            config = AgentConfig(
                id = "pi-review",
                name = "Reviewer",
                description = "Reviews risky changes",
            ),
            status = AgentStatus.CONNECTED,
            version = "0.80.10",
        ).toUiAgent()

        assertEquals("Reviewer", agent.name)
        assertEquals("R", agent.letter)
        assertEquals("Reviews risky changes", agent.description)
    }

    @Test
    fun `MCP access toggle expands implicit all-agent access`() {
        val updated = emptyMap<String, Boolean>().updatedAgentAccess(
            agentIds = listOf("pi-default", "pi-review"),
            agentId = "pi-review",
            enabled = false
        )

        assertEquals(true, updated["pi-default"])
        assertEquals(false, updated["pi-review"])
    }

    @Test
    fun `MCP access normalizes explicit all-agent access`() {
        val updated = mapOf("pi-default" to true, "pi-review" to false).updatedAgentAccess(
            agentIds = listOf("pi-default", "pi-review"),
            agentId = "pi-review",
            enabled = true
        )

        assertEquals(emptyMap(), updated)
    }

    @Test
    fun `connected installed agent maps to connected dto`() {
        val dto = AgentInfo(
            id = "claude-code",
            name = "Claude Code",
            emoji = "",
            color = AgentClaude,
            isConnected = true,
            version = "1.0.0",
            description = "Review code",
            provider = "openai",
            model = "gpt-5"
        ).toAgentDto()

        assertEquals("connected", dto.status)
        assertEquals("claude-code", dto.config.id)
        assertEquals("openai", dto.config.provider)
        assertEquals("gpt-5", dto.config.model)
        assertEquals("Review code", dto.description)
    }

    @Test
    fun `agent without detected version maps to not installed`() {
        val dto = AgentInfo(
            id = "claude-code",
            name = "Claude Code",
            emoji = "",
            color = AgentClaude,
            isConnected = false,
            version = ""
        ).toAgentDto()

        assertEquals("not_installed", dto.status)
    }

    @Test
    fun `model pool field updates only change scheduling metadata`() {
        val model = ModelConfig(
            id = "review-model",
            name = "Reviewer Model",
            provider = "openai",
            model = "gpt-5",
        ).updatedWith(
            mapOf("Provider" to "custom", "Model" to "other", "Priority" to "700")
        )

        assertEquals("openai", model.provider)
        assertEquals("gpt-5", model.model)
        assertEquals(700, model.priority)
    }

    @Test
    fun `mcp mapping preserves persistence fields`() {
        val config = McpServerConfig(
            id = "remote",
            name = "Remote",
            type = McpServerType.HTTP,
            env = mapOf("MODE" to "test"),
            url = "https://example.test/mcp",
            enabledAgents = mapOf("claude-code" to true),
            description = "Remote tools",
            tags = listOf("remote"),
            bearerTokenEnvVar = "TOKEN",
            headers = mapOf("X-Test" to "yes"),
            disabled = true
        )

        assertEquals(config, config.toDto().toConfig())
    }

    @Test
    fun `mcp mapping groups tools from current pi runtime`() {
        val config = McpServerConfig(id = "filesystem.local", name = "Filesystem")
        val runtimeState = piState(
            tools = listOf(
                PiToolInfo("mcp_filesystem_local_read_file", "Read a file", true),
                PiToolInfo("mcp_other_echo", "Echo", true)
            )
        )

        val dto = config.toDto(runtimeState)

        assertEquals(McpRuntimeStatus.BRIDGED, dto.runtimeStatus)
        assertEquals(listOf("mcp_filesystem_local_read_file"), dto.tools.map { it.name })
    }

    @Test
    fun `http mcp mapping is explicitly unsupported`() {
        val dto = McpServerConfig(
            id = "remote",
            name = "Remote",
            type = McpServerType.HTTP
        ).toDto(piState())

        assertEquals(McpRuntimeStatus.UNSUPPORTED, dto.runtimeStatus)
        assertEquals("内置 MCP 执行环境目前仅支持 stdio server", dto.runtimeMessage)
    }

    private fun piState(tools: List<PiToolInfo> = emptyList()) = PiSessionState(
        pid = 1,
        sessionId = "session",
        thinkingLevel = "off",
        isStreaming = false,
        isCompacting = false,
        autoCompactionEnabled = true,
        messageCount = 0,
        pendingMessageCount = 0,
        tools = tools
    )
}
