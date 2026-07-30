package com.swarmeditor.common.model

import kotlinx.serialization.Serializable
import kotlin.time.Instant

@Serializable
enum class SwarmExperienceKind {
    STRATEGY,
    PITFALL,
}

@Serializable
data class SwarmExperience(
    val id: String,
    val principle: String,
    val rationale: String,
    val kind: SwarmExperienceKind,
    val role: SwarmAgentRole? = null,
    val tags: List<String> = emptyList(),
    val successfulEvidence: Int = 0,
    val failedEvidence: Int = 0,
    val successfulUses: Int = 0,
    val recoveredUses: Int = 0,
    val failedUses: Int = 0,
    val evaluatedTaskKeys: List<String> = emptyList(),
    val sourceRunIds: List<String> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
)
