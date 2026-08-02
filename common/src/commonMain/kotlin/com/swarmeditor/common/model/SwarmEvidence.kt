package com.swarmeditor.common.model

import kotlin.time.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class SwarmSandboxProtection {
    FILESYSTEM,
    NETWORK,
    IPC,
    SYSCALL,
    PROCESS,
    RESOURCE,
    COPY_ON_WRITE,
    DETERMINISTIC_TIME,
    DETERMINISTIC_RANDOMNESS,
}

@Serializable
data class SwarmChangedPath(
    val status: String,
    val path: String,
)

@Serializable
data class SwarmOwnershipViolation(
    val status: String,
    val path: String,
    val reason: String,
)

@Serializable
data class SwarmWorkspaceDeltaEvidence(
    val schemaVersion: Int = 2,
    val runId: String,
    val taskId: String,
    val attempt: Int,
    val worktreeId: String,
    val baseRevision: String,
    val beforeTree: String,
    val afterTree: String,
    val nameStatusSha256: String,
    val changedPathCount: Int,
    val changedPaths: List<SwarmChangedPath> = emptyList(),
    val declaredWritePaths: List<String> = emptyList(),
    val ownershipCompliant: Boolean? = null,
    val ownershipViolations: List<SwarmOwnershipViolation> = emptyList(),
    val ownershipPolicyVersion: String? = null,
    val gitVersion: String,
    val capturePolicyVersion: String,
    val createdAt: Instant,
    val artifactRevision: String? = null,
    val pinnedReference: String? = null,
)

@Serializable
data class SwarmVerificationTestSummary(
    val total: Int,
    val passed: Int,
    val failed: Int,
    val skipped: Int = 0,
    val errored: Int = 0,
)

@Serializable
data class SwarmSandboxPreflightReport(
    val schemaVersion: Int = 1,
    val provider: String,
    val providerVersion: String,
    val binarySha256: String,
    val osName: String,
    val osVersion: String,
    val architecture: String,
    val kernelVersion: String? = null,
    val requiredProtections: Set<SwarmSandboxProtection>,
    val activeProtections: Set<SwarmSandboxProtection>,
    val unsupportedProtections: Set<SwarmSandboxProtection> = emptySet(),
    val waivedProtections: Set<SwarmSandboxProtection> = emptySet(),
    val policyVersion: String,
    val policySha256: String,
    val passed: Boolean,
    val failureReasons: List<String> = emptyList(),
    val createdAt: Instant,
)

@Serializable
data class SwarmVerificationEvidence(
    val schemaVersion: Int = 1,
    val runId: String,
    val taskId: String,
    val attempt: Int,
    val workspaceDeltaEvidenceId: String,
    val sandboxPreflightEvidenceId: String,
    val status: SwarmVerificationStatus,
    val policyId: String,
    val policyVersion: String,
    val commandSha256: String,
    val beforeTree: String,
    val afterTree: String,
    val toolAuditIds: List<String> = emptyList(),
    val exitCode: Int? = null,
    val terminatingSignal: String? = null,
    val timedOut: Boolean = false,
    val durationMillis: Long,
    val stdoutSha256: String? = null,
    val stderrSha256: String? = null,
    val stdoutBytes: Long = 0,
    val stderrBytes: Long = 0,
    val stdoutTruncated: Boolean = false,
    val stderrTruncated: Boolean = false,
    val testSummary: SwarmVerificationTestSummary? = null,
    val environmentFingerprint: String,
    val verifierVersion: String,
    val createdAt: Instant,
)
