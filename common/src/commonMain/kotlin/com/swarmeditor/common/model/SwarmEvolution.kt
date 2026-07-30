package com.swarmeditor.common.model

import kotlinx.serialization.Serializable
import kotlin.time.Instant

@Serializable
data class SwarmEvaluationMetrics(
    val passed: Boolean,
    val qualityScore: Double,
    val retries: Int = 0,
    val tokenUsage: TokenUsage = TokenUsage(),
    val durationMillis: Long = 0,
)

@Serializable
data class SwarmExperienceEvaluation(
    val id: String,
    val experienceId: String,
    val taskFingerprint: String,
    val environmentFingerprint: String,
    val control: SwarmEvaluationMetrics,
    val treatment: SwarmEvaluationMetrics,
    val createdAt: Instant,
)

@Serializable
enum class SwarmSkillCandidateStatus {
    DRAFT,
    VALIDATED,
    REJECTED,
    PROMOTED,
}

@Serializable
data class SwarmSkillCandidate(
    val id: String,
    val experienceId: String,
    val name: String,
    val description: String,
    val markdown: String,
    val status: SwarmSkillCandidateStatus = SwarmSkillCandidateStatus.DRAFT,
    val evaluationIds: List<String>,
    val createdAt: Instant,
    val updatedAt: Instant,
)
