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
        ).toUiAgent(isSelected = true)

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
        ).toUiAgent(isSelected = false)

        assertEquals("Reviewer", agent.name)
        assertEquals("R", agent.letter)
        assertEquals("Reviews risky changes", agent.description)
    }

    @Test
    fun `selected agent restoration falls back when profile was removed`() {
        assertEquals(
            "pi-review",
            resolveSelectedAgentId("pi-missing", listOf("pi-review", "pi-default"))
        )
        assertEquals(
            "pi-default",
            resolveSelectedAgentId("pi-default", listOf("pi-review", "pi-default"))
        )
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
    fun `partial agent field update preserves omitted runtime settings`() {
        val config = AgentConfig(
            id = "reviewer",
            name = "Reviewer",
            provider = "openai",
            model = "gpt-5",
            workingDirectory = "/workspace",
            systemPrompt = "Review carefully"
        )

        val updated = config.updatedWith(mapOf("Name" to "Senior Reviewer"))

        assertEquals("Senior Reviewer", updated.name)
        assertEquals("openai", updated.provider)
        assertEquals("gpt-5", updated.model)
        assertEquals("/workspace", updated.workingDirectory)
        assertEquals("Review carefully", updated.systemPrompt)
    }

    @Test
    fun `agent and model field updates remain independent`() {
        val updated = AgentConfig("pi-review", "Reviewer").updatedWith(
            mapOf(
                "Tags" to "review, security, review",
                "Max Dynamic Subagents" to "8",
            )
        )
        val model = ModelConfig("review-model", "Reviewer Model").updatedWith(
            mapOf("Environment" to "MODE=strict; API_BASE=https://example.test/v1")
        )

        assertEquals(listOf("review", "security"), updated.tags)
        assertEquals(8, updated.maxDynamicSubagents)
        assertEquals("strict", model.env["MODE"])
        assertEquals("https://example.test/v1", model.env["API_BASE"])
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
