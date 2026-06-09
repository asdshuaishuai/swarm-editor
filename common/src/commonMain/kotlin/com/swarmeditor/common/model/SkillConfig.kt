package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

/** 技能来源 */
@Serializable
enum class SkillSource {
    FILESYSTEM,
    MCP
}

/** 技能配置 */
@Serializable
data class SkillConfig(
    val id: String,
    val name: String,
    val description: String = "",
    val source: SkillSource,
    val scope: String = "global",
    val path: String = "",
    val agentId: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(),
    val tags: List<String> = emptyList()
)
