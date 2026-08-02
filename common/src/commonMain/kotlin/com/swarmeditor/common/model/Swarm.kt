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
    DEFERRED_OWNERSHIP_CONFLICT,
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
enum class SwarmArtifactIntegrationStatus {
    PREPARED,
    APPLIED,
    DISCARDED,
}

@Serializable
enum class SwarmArtifactReviewAction {
    OPENED,
    COVERAGE_RECORDED,
    CLOSED,
    REJECTED,
    APPLY_REQUESTED,
    APPLIED,
    STALE,
    APPLY_FAILED,
    APPLY_CANCELED,
}

@Serializable
enum class SwarmArtifactRejectionReason {
    ROOT_CAUSE_NOT_FIXED,
    FUNCTIONAL_INCORRECTNESS,
    INCOMPLETE_SCOPE,
    OUT_OF_SCOPE_CHANGE,
    BROKEN_DEPENDENCY_OR_API,
    SECURITY_OR_PRIVACY,
    PERFORMANCE_REGRESSION,
    MAINTAINABILITY,
    INSUFFICIENT_VERIFICATION,
}

@Serializable
enum class SwarmArtifactRejectionResolution {
    REVISE_AND_REVERIFY,
    ABANDON,
}

@Serializable
enum class SwarmArtifactRevisionScopeMode {
    TARGET_PATHS_ONLY,
    SOURCE_WRITE_SCOPE,
}

@Serializable
enum class SwarmArtifactRiskLevel {
    LOW,
    MEDIUM,
    HIGH,
}

@Serializable
enum class SwarmArtifactRiskReason {
    AUTHORIZATION,
    SECRET_HANDLING,
    PROCESS_OR_TOOL_EXECUTION,
    PERSISTENCE_OR_MIGRATION,
    PUBLIC_CONTRACT,
    BUILD_OR_DEPENDENCY,
    SANDBOX_BOUNDARY,
    BINARY_OR_GENERATED,
    LARGE_CHANGE,
}

@Serializable
enum class SwarmArtifactFileOperation {
    MODIFIED,
    ADDED,
    DELETED,
    RENAMED,
    BINARY,
}

@Serializable
enum class SwarmArtifactHunkDependencyKind {
    RANGE_OVERLAP,
    FILE_LIFECYCLE,
    SYMBOL_REFERENCE,
}

@Serializable
enum class SwarmArtifactHunkApplicabilityStatus {
    INDEPENDENTLY_APPLICABLE,
    NOT_INDEPENDENTLY_APPLICABLE,
    UNSUPPORTED,
    SKIPPED_LIMIT,
    SKIPPED_TRUNCATED_PREVIEW,
    CHECK_FAILED,
}

@Serializable
enum class SwarmArtifactSelectionApplicabilityStatus {
    APPLICABLE,
    NOT_APPLICABLE,
    UNSUPPORTED,
    CHECK_FAILED,
}

@Serializable
enum class SwarmRepositoryEvidenceKind {
    FILE_MATCH,
    SYMBOL,
    DIAGNOSTIC,
    GIT_HISTORY,
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
    val readPaths: List<String> = emptyList(),
    val writePaths: List<String> = emptyList(),
    val verificationCommands: List<List<String>> = emptyList(),
    val revisionContract: SwarmArtifactRevisionContract? = null,
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
data class SwarmArtifactRevisionContract(
    val id: String,
    val sourcePlanId: String,
    val sourceTaskId: String,
    val sourceAttempt: Int,
    val sourceArtifactRevision: String,
    val sourceArtifactTree: String,
    val rejectionReason: SwarmArtifactRejectionReason,
    val scopeMode: SwarmArtifactRevisionScopeMode = SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY,
    val sourceWritePaths: List<String> = emptyList(),
    val targetHunkIds: List<String> = emptyList(),
    val contextHunkIds: List<String> = emptyList(),
    val targetPaths: List<String> = emptyList(),
    val contextPaths: List<String> = emptyList(),
    val createdAt: Instant,
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
data class SwarmArtifactIntegrationPlan(
    val id: String,
    val runId: String,
    val taskId: String,
    val attempt: Int,
    val workspaceDeltaEvidenceId: String,
    val verificationEvidenceId: String,
    val baselineRevision: String,
    val baselineTree: String,
    val currentRevision: String,
    val currentTree: String,
    val artifactRevision: String,
    val artifactTree: String,
    val integratedRevision: String,
    val integratedTree: String,
    val pinnedReference: String,
    val status: SwarmArtifactIntegrationStatus = SwarmArtifactIntegrationStatus.PREPARED,
    val createdAt: Instant,
    val appliedAt: Instant? = null,
    val discardedAt: Instant? = null,
)

@Serializable
data class SwarmArtifactIntegrationPreview(
    val planId: String,
    val runId: String,
    val taskId: String,
    val status: SwarmArtifactIntegrationStatus,
    val verificationEvidenceId: String,
    val currentRevision: String,
    val integratedRevision: String,
    val changedPaths: List<SwarmChangedPath>,
    val unifiedDiff: String,
    val truncated: Boolean,
    val hunks: List<SwarmArtifactDiffHunk> = emptyList(),
    val hunkDependencies: List<SwarmArtifactHunkDependency> = emptyList(),
    val hunkDependencyComponents: List<SwarmArtifactHunkDependencyComponent> = emptyList(),
    val hunkApplicability: List<SwarmArtifactHunkApplicability> = emptyList(),
)

@Serializable
data class SwarmArtifactDiffHunk(
    val id: String,
    val path: String,
    val header: String,
    val diff: String,
    val addedLineCount: Int,
    val removedLineCount: Int,
    val riskLevel: SwarmArtifactRiskLevel,
    val riskReasons: List<SwarmArtifactRiskReason> = emptyList(),
    val oldStartLine: Int? = null,
    val oldLineCount: Int? = null,
    val newStartLine: Int? = null,
    val newLineCount: Int? = null,
    val fileOperation: SwarmArtifactFileOperation = SwarmArtifactFileOperation.MODIFIED,
)

@Serializable
data class SwarmArtifactHunkDependency(
    val id: String,
    val prerequisiteHunkId: String,
    val dependentHunkId: String,
    val kind: SwarmArtifactHunkDependencyKind,
    val symbol: String? = null,
)

@Serializable
data class SwarmArtifactHunkDependencyComponent(
    val id: String,
    val hunkIds: List<String>,
    val prerequisiteComponentIds: List<String> = emptyList(),
    val cyclic: Boolean = false,
)

@Serializable
data class SwarmArtifactHunkApplicability(
    val hunkId: String,
    val status: SwarmArtifactHunkApplicabilityStatus,
    val checkedAgainstTree: String? = null,
)

@Serializable
data class SwarmArtifactSelectionPreview(
    val planId: String,
    val requestedHunkIds: List<String>,
    val prerequisiteHunkIds: List<String>,
    val effectiveHunkIds: List<String>,
    val changedPaths: List<String>,
    val unifiedDiff: String,
    val applicabilityStatus: SwarmArtifactSelectionApplicabilityStatus,
    val checkedAgainstTree: String? = null,
)

@Serializable
data class SwarmArtifactReviewEvent(
    val id: String,
    val runId: String,
    val taskId: String,
    val planId: String,
    val action: SwarmArtifactReviewAction,
    val occurredAt: Instant,
    val dwellMillis: Long = 0,
    val diffCharacterCount: Int = 0,
    val changedPathCount: Int = 0,
    val firstViewportMillis: Long = 0,
    val viewportDwellMillis: Long = 0,
    val viewedHunkIds: List<String> = emptyList(),
    val viewedHunkCount: Int = 0,
    val totalHunkCount: Int = 0,
    val viewedHighRiskHunkCount: Int = 0,
    val highRiskHunkCount: Int = 0,
    val reviewCoveragePermille: Int = 0,
    val rejectionReason: SwarmArtifactRejectionReason? = null,
    val rejectionResolution: SwarmArtifactRejectionResolution? = null,
    val revisionScopeMode: SwarmArtifactRevisionScopeMode? = null,
    val rejectedHunkIds: List<String> = emptyList(),
    val revisionContractId: String? = null,
    val revisionTaskId: String? = null,
    val failureCategory: String? = null,
)

@Serializable
data class SwarmRepositoryEvidence(
    val id: String,
    val kind: SwarmRepositoryEvidenceKind,
    val path: String? = null,
    val line: Int? = null,
    val score: Double,
    val summary: String,
    val excerpt: String? = null,
)

@Serializable
data class SwarmRepositoryEvidenceBundle(
    val queryFingerprint: String,
    val generatedAt: Instant,
    val scannedFileCount: Int,
    val candidateFileCount: Int,
    val characterBudget: Int,
    val consumedCharacters: Int,
    val truncated: Boolean,
    val evidence: List<SwarmRepositoryEvidence>,
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
    val planningEvidence: SwarmRepositoryEvidenceBundle? = null,
    val tasks: List<SwarmTask>,
    val planningExperienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val schedulingDecisions: List<SwarmSchedulingDecision> = emptyList(),
    val artifactIntegrationPlans: List<SwarmArtifactIntegrationPlan> = emptyList(),
    val artifactReviewEvents: List<SwarmArtifactReviewEvent> = emptyList(),
)
