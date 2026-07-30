package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

/** 可被主智能体动态分配给会话或子智能体的模型配置。 */
@Serializable
data class ModelConfig(
    val id: String,
    val name: String,
    val provider: String = "",
    val model: String = "",
    val enabled: Boolean = true,
    val thinkingLevel: AgentThinkingLevel = AgentThinkingLevel.MEDIUM,
    val env: Map<String, String> = emptyMap(),
    val priority: Int = 100,
    val roles: List<SwarmAgentRole> = emptyList(),
    val maxConcurrentAgents: Int = 2,
)
