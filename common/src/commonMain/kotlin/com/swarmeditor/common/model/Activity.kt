package com.swarmeditor.common.model

import kotlinx.serialization.Serializable
import kotlin.time.Instant

@Serializable
data class ActivityEvent(
    val id: String,
    val sessionId: String,
    val timestamp: Instant,
    val actor: String,
    val action: String,
    val detail: String = "",
    val type: ActivityType = ActivityType.SESSION,
)

@Serializable
enum class ActivityType {
    SESSION,
    MESSAGE,
    TOOL,
    MCP,
    FILE,
    COMMAND,
    ERROR,
}
