package com.swarmeditor.common.model

import kotlin.time.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class DeliveryStatus {
    CREATED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELED,
    BLOCKED,
}

@Serializable
enum class DeliveryTriggerKind {
    DESKTOP,
    SESSION,
    SWARM,
    REVIEW,
    CI,
    SCHEDULED,
    API,
}

@Serializable
data class DeliveryTrigger(
    val kind: DeliveryTriggerKind,
    val sourceId: String? = null,
    val actor: String? = null,
    val promptFingerprint: String? = null,
)

@Serializable
data class DeliveryAdmission(
    val allowed: Boolean,
    val policyId: String,
    val policyVersion: String,
    val reason: String? = null,
    val capabilityIds: List<String> = emptyList(),
    val requestedPermissions: Set<CapabilityPermission> = emptySet(),
    val grantedPermissions: Set<CapabilityPermission> = emptySet(),
)

@Serializable
data class DeliveryWorkspaceReference(
    val workspaceId: String? = null,
    val worktreeId: String? = null,
    val projectPath: String,
    val path: String? = null,
    val baseRevision: String? = null,
)

@Serializable
data class DeliveryArtifactReference(
    val commitHash: String? = null,
    val patchSha256: String? = null,
    val artifactRevision: String? = null,
    val reviewPackageId: String? = null,
)

@Serializable
data class DeliveryRecord(
    val schemaVersion: Int = 1,
    val id: String,
    val projectPath: String,
    val status: DeliveryStatus = DeliveryStatus.CREATED,
    val trigger: DeliveryTrigger,
    val admission: DeliveryAdmission,
    val workspace: DeliveryWorkspaceReference? = null,
    val taskAttemptIds: List<String> = emptyList(),
    val sessionIds: List<String> = emptyList(),
    val toolAuditIds: List<String> = emptyList(),
    val contextEvidenceIds: List<String> = emptyList(),
    val workspaceDeltaEvidenceId: String? = null,
    val sandboxPreflightEvidenceId: String? = null,
    val verificationEvidenceIds: List<String> = emptyList(),
    val reviewPackageId: String? = null,
    val reviewCommentIds: List<String> = emptyList(),
    val artifact: DeliveryArtifactReference? = null,
    val redactionPolicyVersion: String? = null,
    val redactedOutputIds: List<String> = emptyList(),
    val residualRisk: List<String> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
)
