package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

/** Agent 类型枚举 */
@Serializable
enum class AgentType {
    CLAUDE_CODE,
    GEMINI_CLI,
    KIMI_CODE,
    QWEN_CODE,
    OPEN_CODE
}

/** Agent 配置 */
@Serializable
data class AgentConfig(
    val id: String,
    val name: String,
    val description: String = "",
    val enabled: Boolean = true,
    val command: String,
    val args: List<String> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val agentType: AgentType,
    val tags: List<String> = emptyList(),
    val timeout: Int = 30
)

/** Agent 运行时状态 */
@Serializable
enum class AgentStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

/** Agent 运行时信息 */
@Serializable
data class AgentRuntimeInfo(
    val config: AgentConfig,
    val status: AgentStatus = AgentStatus.DISCONNECTED,
    val version: String = "",
    val pid: Int? = null,
    val errorMessage: String? = null
)
