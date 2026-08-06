package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

/** 可被主智能体动态分配给会话或子智能体的模型配置。 */
@Serializable
data class ModelConfig(
    val id: String,
    val name: String,
    val provider: String = "",
    val model: String = "",
    val api: String = "",
    val reasoning: Boolean = false,
    val contextWindow: Int = 0,
    val maxTokens: Int = 0,
    val inputModes: List<String> = emptyList(),
    val enabled: Boolean = true,
    val thinkingLevel: AgentThinkingLevel = AgentThinkingLevel.MEDIUM,
    val priority: Int = 100,
    val roles: List<SwarmAgentRole> = emptyList(),
    val maxConcurrentAgents: Int = 2,
)
