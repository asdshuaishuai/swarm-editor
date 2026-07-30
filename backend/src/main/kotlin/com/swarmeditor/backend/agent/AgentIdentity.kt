package com.swarmeditor.backend.agent

private val LEGACY_EXTERNAL_AGENT_IDS = setOf(
    "claude-code",
    "gemini-cli",
    "kimi-code",
    "opencode",
    "qwen-code",
)

internal fun Map<String, Boolean>.piProfileAccess(): Map<String, Boolean> {
    if (isEmpty()) return emptyMap()
    val normalized = filterKeys { it !in LEGACY_EXTERNAL_AGENT_IDS }.toMutableMap()
    val legacyAccess = filterKeys(LEGACY_EXTERNAL_AGENT_IDS::contains)
    if (legacyAccess.isNotEmpty()) {
        normalized[AgentRegistry.DEFAULT_AGENT_ID] =
            normalized[AgentRegistry.DEFAULT_AGENT_ID] == true || legacyAccess.values.any { it }
    }
    return normalized
}
