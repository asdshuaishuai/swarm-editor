package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.PRIMARY_AGENT_NAME
import com.swarmeditor.desktop.PRIMARY_AGENT_ID
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.McpToolDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.api.AgentConfigDto
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.AgentClaude
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AgentKimi
import com.swarmeditor.desktop.theme.AgentQwen

internal fun AgentRuntimeInfo.toUiAgent(): AgentInfo {
    val isPrimary = config.id == PRIMARY_AGENT_ID
    val palette = listOf(AgentClaude, AgentQwen, AgentGemini, AgentKimi)
    return AgentInfo(
        id = config.id,
        name = if (isPrimary) PRIMARY_AGENT_NAME else config.name,
        emoji = "",
        color = if (isPrimary) AgentClaude else palette[(config.id.hashCode() and Int.MAX_VALUE) % palette.size],
        isConnected = config.enabled && status == AgentStatus.CONNECTED,
        version = version,
        letter = if (isPrimary) "主" else config.name.trim().firstOrNull()?.uppercase() ?: "P",
        description = config.description.ifBlank {
            if (isPrimary) "编辑器内置的智能执行核心" else "Pi Agent Profile"
        },
        provider = config.provider,
        model = config.model,
        enabled = config.enabled
    )
}

internal fun AgentInfo.toAgentDto() = AgentDto(
    config = AgentConfigDto(
        id = id,
        name = name,
        description = description,
        provider = provider,
        model = model,
        enabled = enabled
    ),
    status = when {
        isConnected -> "connected"
        version.isBlank() -> "not_installed"
        else -> "disconnected"
    },
    version = version,
    description = description
)

internal fun McpServerConfig.toDto(runtimeState: PiSessionState? = null): McpServerDto {
    val toolPrefix = mcpToolPrefix(id)
    val tools = runtimeState?.tools
        ?.filter { it.name.startsWith(toolPrefix) }
        ?.map { tool ->
            McpToolDto(
                name = tool.name,
                description = tool.description,
                active = tool.active
            )
        }
        .orEmpty()
    val runtimeStatus = when {
        disabled -> McpRuntimeStatus.DISABLED
        type == McpServerType.HTTP -> McpRuntimeStatus.UNSUPPORTED
        runtimeState?.isAlive == false || !runtimeState?.errorMessage.isNullOrBlank() -> McpRuntimeStatus.FAILED
        tools.isNotEmpty() -> McpRuntimeStatus.BRIDGED
        else -> McpRuntimeStatus.CONFIGURED
    }
    val runtimeMessage = when (runtimeStatus) {
        McpRuntimeStatus.DISABLED -> "配置已停用；运行中的会话需重启后卸载工具"
        McpRuntimeStatus.UNSUPPORTED -> "内置 MCP 执行环境目前仅支持 stdio server"
        McpRuntimeStatus.FAILED -> runtimeState?.errorMessage ?: "当前会话不可用"
        McpRuntimeStatus.BRIDGED -> "当前会话已加载 ${tools.count { it.active }}/${tools.size} 个工具"
        McpRuntimeStatus.CONFIGURED -> if (runtimeState == null) {
            "配置已保存；启动会话后加载工具"
        } else {
            "当前会话未发现工具；配置变更后需重启会话"
        }
    }

    return McpServerDto(
        id = id,
        name = name,
        type = type.name.lowercase(),
        command = command,
        args = args,
        env = env,
        url = url,
        enabledAgents = enabledAgents,
        description = description,
        tags = tags,
        bearerTokenEnvVar = bearerTokenEnvVar,
        headers = headers,
        disabled = disabled,
        tools = tools,
        runtimeStatus = runtimeStatus,
        runtimeMessage = runtimeMessage
    )
}

internal fun mcpToolPrefix(serverId: String): String = "mcp_${serverId}_"
    .replace(Regex("[^a-zA-Z0-9_-]"), "_")
    .take(64)

internal fun McpServerDto.toConfig() = McpServerConfig(
    id = id,
    name = name,
    type = if (type.equals("http", ignoreCase = true)) {
        com.swarmeditor.common.model.McpServerType.HTTP
    } else {
        com.swarmeditor.common.model.McpServerType.STDIO
    },
    command = command,
    args = args,
    env = env,
    url = url,
    enabledAgents = enabledAgents,
    description = description,
    tags = tags,
    bearerTokenEnvVar = bearerTokenEnvVar,
    headers = headers,
    disabled = disabled
)

internal fun SkillConfig.toDto() = SkillDto(
    id = id,
    name = name,
    description = description,
    source = source.name.lowercase(),
    scope = scope,
    path = path,
    enabledAgents = enabledAgents,
    tags = tags,
    files = files
)
