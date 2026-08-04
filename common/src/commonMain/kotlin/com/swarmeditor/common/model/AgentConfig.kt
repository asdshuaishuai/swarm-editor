package com.swarmeditor.common.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/** pi 推理强度。 */
@Serializable
enum class AgentThinkingLevel {
    OFF,
    MINIMAL,
    LOW,
    MEDIUM,
    HIGH,
    XHIGH
}

/**
 * Pi Agent 运行时配置。
 *
 * `AgentRegistry` 只持久化主模型 ID；其余字段由系统为默认主智能体和临时子智能体生成。
 * 模型凭据、能力角色与并发容量由独立模型池管理，不持久化静态子智能体 Profile。
 */
@Serializable
data class AgentConfig(
    val id: String,
    val name: String,
    val description: String = "",
    val enabled: Boolean = true,
    val systemPrompt: String = "",
    val workingDirectory: String = "",
    val tags: List<String> = emptyList(),
    val timeoutSeconds: Int = 300,
    val autoStart: Boolean = true,
    val maxDynamicSubagents: Int = 4,
    @Transient val provider: String = "",
    @Transient val model: String = "",
    @Transient val thinkingLevel: AgentThinkingLevel = AgentThinkingLevel.MEDIUM,
    @Transient val env: Map<String, String> = emptyMap(),
    @Transient val modelConfigId: String = "",
    @Transient val agentRevision: String = "",
    @Transient val modelRevision: String = "",
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
