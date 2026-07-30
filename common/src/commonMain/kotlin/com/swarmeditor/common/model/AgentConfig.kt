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

/** 主智能体从模型池选择执行模型的策略。 */
@Serializable
enum class AgentModelSelectionStrategy {
    BALANCED,
    QUALITY_FIRST,
    SPEED_FIRST
}

/**
 * 主智能体策略。
 *
 * 持久化内容只描述智能体身份、提示与调度策略。模型与凭据由独立模型池管理，
 * 子智能体由主智能体按任务动态构建，不再持久化静态子智能体 Profile。
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
    val modelSelectionStrategy: AgentModelSelectionStrategy = AgentModelSelectionStrategy.BALANCED,
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
