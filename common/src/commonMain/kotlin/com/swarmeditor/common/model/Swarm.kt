package com.swarmeditor.common.model

import kotlinx.serialization.Serializable
import kotlin.time.Instant

@Serializable
enum class SwarmRunStatus {
    CREATED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELED,
}

@Serializable
enum class SwarmTaskStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    FAILED,
    BLOCKED,
    CANCELED,
}

@Serializable
enum class SwarmSchedulingCandidateDisposition {
    SELECTED,
    DEFERRED_CAPACITY,
}

@Serializable
enum class SwarmTaskAttemptOutcome {
    RUNNING,
    SUCCEEDED,
    FAILED,
    TIMED_OUT,
    CANCELED,
}

@Serializable
enum class SwarmVerificationStatus {
    NOT_RECORDED,
    PASSED,
    FAILED,
}

@Serializable
enum class SwarmAgentRole {
    PLANNER,
    IMPLEMENTER,
    REVIEWER,
    INTEGRATOR,
    GENERAL,
}

@Serializable
enum class SwarmExperienceRoutingStatus {
    SELECTED,
    ABSTAINED_LIMIT,
    ABSTAINED_OBSERVED_HARM,
    ABSTAINED_CONTROLLED_REGRESSION,
}

@Serializable
data class SwarmExperienceRoutingDecision(
    val experienceId: String,
    val status: SwarmExperienceRoutingStatus,
    val queryFingerprint: String,
    val score: Int,
    val relevanceScore: Int,
    val observedUtility: Int,
    val controlledWins: Int,
    val controlledRegressions: Int,
    val medianQualityDelta: Double,
    val controlledEnvironmentFingerprint: String? = null,
    val attempt: Int = 0,
)

@Serializable
data class SwarmExecutionPolicy(
    val maxParallelism: Int = 3,
    val failFast: Boolean = false,
    val taskTimeoutSeconds: Int = 600,
    val maxTaskAttempts: Int = 2,
)

@Serializable
data class SwarmSchedulingCandidate(
    val taskId: String,
    val taskOrder: Int,
    val nextAttempt: Int,
    val requestedAgentId: String? = null,
    val disposition: SwarmSchedulingCandidateDisposition,
    val reason: String,
    val estimatedUtility: Double? = null,
)

@Serializable
data class SwarmSchedulingDecision(
    val id: String,
    val sequence: Int,
    val policyId: String,
    val stateFingerprint: String,
    val createdAt: Instant,
    val availableCapacity: Int,
    val activeTaskIds: List<String>,
    val candidates: List<SwarmSchedulingCandidate>,
)

@Serializable
data class SwarmTaskAttemptRecord(
    val id: String,
    val schedulingDecisionId: String,
    val attempt: Int,
    val requestedAgentId: String? = null,
    val resolvedAgentId: String? = null,
    val outcome: SwarmTaskAttemptOutcome = SwarmTaskAttemptOutcome.RUNNING,
    val startedAt: Instant,
    val completedAt: Instant? = null,
    val durationMillis: Long? = null,
    val tokenUsage: TokenUsage = TokenUsage(),
    val toolBrokerSessionIds: List<String> = emptyList(),
    val toolAuditIds: List<String> = emptyList(),
    val changedFileCount: Int? = null,
    val verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    val workspaceDeltaEvidenceId: String? = null,
    val verificationEvidenceId: String? = null,
    val errorCategory: String? = null,
)

@Serializable
data class SwarmTask(
    val id: String,
    val title: String,
    val prompt: String,
    val role: SwarmAgentRole = SwarmAgentRole.GENERAL,
    val agentId: String? = null,
    val dependsOn: List<String> = emptyList(),
    val status: SwarmTaskStatus = SwarmTaskStatus.PENDING,
    val output: String = "",
    val errorMessage: String? = null,
    val tokenUsage: TokenUsage = TokenUsage(),
    val attempt: Int = 0,
    val failureHistory: List<String> = emptyList(),
    val experienceIds: List<String> = emptyList(),
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val toolBrokerSessionIds: List<String> = emptyList(),
    val toolAuditIds: List<String> = emptyList(),
    val attemptRecords: List<SwarmTaskAttemptRecord> = emptyList(),
    val startedAt: Instant? = null,
    val completedAt: Instant? = null,
)

@Serializable
data class SwarmRepositoryBaseline(
    val revision: String,
    val baseRevision: String,
    val treeHash: String,
    val dirty: Boolean,
    val pinnedReference: String? = null,
    val capturedAt: Instant,
)

@Serializable
data class SwarmRun(
    val id: String,
    val title: String,
    val objective: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val status: SwarmRunStatus = SwarmRunStatus.CREATED,
    val policy: SwarmExecutionPolicy = SwarmExecutionPolicy(),
    val repositoryBaseline: SwarmRepositoryBaseline? = null,
    val tasks: List<SwarmTask>,
    val planningExperienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val schedulingDecisions: List<SwarmSchedulingDecision> = emptyList(),
)
