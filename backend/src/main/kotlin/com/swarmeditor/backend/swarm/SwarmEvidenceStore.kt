package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmVerificationEvidence
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.SwarmVerificationTestSummary
import com.swarmeditor.common.model.SwarmWorkspaceDeltaEvidence
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json

private val evidenceLog = KotlinLogging.logger {}

class SwarmEvidenceStore(
    private val directory: File,
    private val maxFileBytes: Long = 4L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mutex = Mutex()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
        directory.mkdirs()
    }

    suspend fun putWorkspaceDelta(evidence: SwarmWorkspaceDeltaEvidence): String = put(
        kind = EvidenceKind.WORKSPACE_DELTA,
        serializer = SwarmWorkspaceDeltaEvidence.serializer(),
        evidence = evidence,
        validate = ::validateWorkspaceDelta,
    )

    suspend fun getWorkspaceDelta(id: String): SwarmWorkspaceDeltaEvidence? = get(
        kind = EvidenceKind.WORKSPACE_DELTA,
        id = id,
        serializer = SwarmWorkspaceDeltaEvidence.serializer(),
        validate = ::validateWorkspaceDelta,
    )

    suspend fun putSandboxPreflight(evidence: SwarmSandboxPreflightReport): String = put(
        kind = EvidenceKind.SANDBOX_PREFLIGHT,
        serializer = SwarmSandboxPreflightReport.serializer(),
        evidence = evidence,
        validate = ::validateSandboxPreflight,
    )

    suspend fun getSandboxPreflight(id: String): SwarmSandboxPreflightReport? = get(
        kind = EvidenceKind.SANDBOX_PREFLIGHT,
        id = id,
        serializer = SwarmSandboxPreflightReport.serializer(),
        validate = ::validateSandboxPreflight,
    )

    suspend fun putVerification(evidence: SwarmVerificationEvidence): String {
        validateVerification(evidence)
        val workspace = checkNotNull(getWorkspaceDelta(evidence.workspaceDeltaEvidenceId)) {
            "Verification workspace evidence is missing: ${evidence.workspaceDeltaEvidenceId}"
        }
        val preflight = checkNotNull(getSandboxPreflight(evidence.sandboxPreflightEvidenceId)) {
            "Verification sandbox preflight evidence is missing: ${evidence.sandboxPreflightEvidenceId}"
        }
        require(workspace.runId == evidence.runId) { "Verification run does not match workspace evidence" }
        require(workspace.taskId == evidence.taskId) { "Verification task does not match workspace evidence" }
        require(workspace.attempt == evidence.attempt) { "Verification attempt does not match workspace evidence" }
        require(workspace.beforeTree == evidence.beforeTree) { "Verification before tree does not match workspace evidence" }
        require(workspace.afterTree == evidence.afterTree) { "Verification after tree does not match workspace evidence" }
        if (evidence.status == SwarmVerificationStatus.PASSED) {
            require(preflight.passed) { "Passed verification requires a passed sandbox preflight" }
        }
        return put(
            kind = EvidenceKind.VERIFICATION,
            serializer = SwarmVerificationEvidence.serializer(),
            evidence = evidence,
            validate = ::validateVerification,
        )
    }

    suspend fun getVerification(id: String): SwarmVerificationEvidence? = get(
        kind = EvidenceKind.VERIFICATION,
        id = id,
        serializer = SwarmVerificationEvidence.serializer(),
        validate = ::validateVerification,
    )

    private suspend fun <T> put(
        kind: EvidenceKind,
        serializer: KSerializer<T>,
        evidence: T,
        validate: (T) -> Unit,
    ): String = mutex.withLock {
        validate(evidence)
        val content = json.encodeToString(serializer, evidence)
            .requireUtf8Size(maxFileBytes, "${kind.label} evidence")
        val id = sha256(content)
        withContext(Dispatchers.IO) {
            val target = evidenceFile(kind, id)
            if (target.exists()) {
                val existing = try {
                    target.readBoundedUtf8(maxFileBytes)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    quarantine(target, kind, error)
                    null
                }
                if (existing == content) return@withContext id
                if (existing != null) {
                    quarantine(target, kind, IllegalStateException("Content-addressed evidence mismatch"))
                }
            }
            target.atomicWriteText(content)
            id
        }
    }

    private suspend fun <T> get(
        kind: EvidenceKind,
        id: String,
        serializer: KSerializer<T>,
        validate: (T) -> Unit,
    ): T? = mutex.withLock {
        requireEvidenceId(id)
        withContext(Dispatchers.IO) {
            val target = evidenceFile(kind, id)
            if (!target.exists()) return@withContext null
            try {
                val content = target.readBoundedUtf8(maxFileBytes)
                require(sha256(content) == id) { "Evidence digest does not match file name" }
                json.decodeFromString(serializer, content).also(validate)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                quarantine(target, kind, error)
                null
            }
        }
    }

    private fun evidenceFile(kind: EvidenceKind, id: String): File {
        requireEvidenceId(id)
        return File(File(File(directory, kind.directoryName), id.take(2)), "$id.json")
    }

    private fun quarantine(target: File, kind: EvidenceKind, error: Exception) {
        val quarantined = target.quarantineCorruptFile()
        evidenceLog.warn {
            "Quarantined invalid ${kind.label} evidence ${target.name} to ${quarantined.name}: ${error.message}"
        }
    }
}

private enum class EvidenceKind(val directoryName: String, val label: String) {
    WORKSPACE_DELTA("workspace-delta", "workspace delta"),
    SANDBOX_PREFLIGHT("sandbox-preflight", "sandbox preflight"),
    VERIFICATION("verification", "verification"),
}

private fun validateWorkspaceDelta(evidence: SwarmWorkspaceDeltaEvidence) {
    require(evidence.schemaVersion == CURRENT_EVIDENCE_SCHEMA_VERSION) { "Unsupported workspace evidence schema" }
    requireLabel(evidence.runId, "runId")
    requireLabel(evidence.taskId, "taskId")
    require(evidence.attempt > 0) { "Workspace evidence attempt must be positive" }
    requireLabel(evidence.worktreeId, "worktreeId")
    requireGitObjectId(evidence.baseRevision, "baseRevision")
    requireGitObjectId(evidence.beforeTree, "beforeTree")
    requireGitObjectId(evidence.afterTree, "afterTree")
    require((evidence.artifactRevision == null) == (evidence.pinnedReference == null)) {
        "Workspace artifact revision and pinned reference must be recorded together"
    }
    evidence.artifactRevision?.let { requireGitObjectId(it, "artifactRevision") }
    evidence.pinnedReference?.let { reference ->
        require(reference.matches(TASK_ARTIFACT_REFERENCE_PATTERN)) { "Invalid task artifact reference" }
    }
    requireSha256(evidence.nameStatusSha256, "nameStatusSha256")
    require(evidence.changedPathCount >= 0) { "changedPathCount cannot be negative" }
    requireLabel(evidence.gitVersion, "gitVersion")
    requireLabel(evidence.capturePolicyVersion, "capturePolicyVersion")
}

private fun validateSandboxPreflight(evidence: SwarmSandboxPreflightReport) {
    require(evidence.schemaVersion == CURRENT_EVIDENCE_SCHEMA_VERSION) { "Unsupported sandbox evidence schema" }
    requireLabel(evidence.provider, "provider")
    requireLabel(evidence.providerVersion, "providerVersion")
    requireSha256(evidence.binarySha256, "binarySha256")
    requireLabel(evidence.osName, "osName")
    requireLabel(evidence.osVersion, "osVersion")
    requireLabel(evidence.architecture, "architecture")
    evidence.kernelVersion?.let { requireLabel(it, "kernelVersion") }
    requireLabel(evidence.policyVersion, "policyVersion")
    requireSha256(evidence.policySha256, "policySha256")
    require(evidence.activeProtections.intersect(evidence.unsupportedProtections).isEmpty()) {
        "Active sandbox protections cannot be unsupported"
    }
    require(evidence.activeProtections.intersect(evidence.waivedProtections).isEmpty()) {
        "Active sandbox protections cannot be waived"
    }
    val missing = evidence.requiredProtections - evidence.activeProtections
    if (evidence.passed) {
        require(missing.isEmpty()) { "Passed sandbox preflight is missing required protections" }
        require(evidence.failureReasons.isEmpty()) { "Passed sandbox preflight cannot contain failure reasons" }
    } else {
        require(missing.isNotEmpty() || evidence.failureReasons.isNotEmpty()) {
            "Failed sandbox preflight must explain the failure"
        }
    }
    evidence.failureReasons.forEach { requireLabel(it, "failureReason", MAX_REASON_LENGTH) }
}

private fun validateVerification(evidence: SwarmVerificationEvidence) {
    require(evidence.schemaVersion == CURRENT_EVIDENCE_SCHEMA_VERSION) { "Unsupported verification evidence schema" }
    requireLabel(evidence.runId, "runId")
    requireLabel(evidence.taskId, "taskId")
    require(evidence.attempt > 0) { "Verification evidence attempt must be positive" }
    requireEvidenceId(evidence.workspaceDeltaEvidenceId)
    requireEvidenceId(evidence.sandboxPreflightEvidenceId)
    require(evidence.status != SwarmVerificationStatus.NOT_RECORDED) {
        "Stored verification evidence must have a terminal status"
    }
    requireLabel(evidence.policyId, "policyId")
    requireLabel(evidence.policyVersion, "policyVersion")
    requireSha256(evidence.commandSha256, "commandSha256")
    requireGitObjectId(evidence.beforeTree, "beforeTree")
    requireGitObjectId(evidence.afterTree, "afterTree")
    require(evidence.durationMillis >= 0) { "Verification duration cannot be negative" }
    require(evidence.stdoutBytes >= 0 && evidence.stderrBytes >= 0) { "Verification byte counts cannot be negative" }
    evidence.stdoutSha256?.let { requireSha256(it, "stdoutSha256") }
    evidence.stderrSha256?.let { requireSha256(it, "stderrSha256") }
    require(evidence.stdoutBytes == 0L || evidence.stdoutSha256 != null) {
        "Non-empty stdout requires a digest"
    }
    require(evidence.stderrBytes == 0L || evidence.stderrSha256 != null) {
        "Non-empty stderr requires a digest"
    }
    evidence.terminatingSignal?.let { requireLabel(it, "terminatingSignal") }
    evidence.toolAuditIds.forEach { requireLabel(it, "toolAuditId") }
    requireSha256(evidence.environmentFingerprint, "environmentFingerprint")
    requireLabel(evidence.verifierVersion, "verifierVersion")
    val testSummary = evidence.testSummary
    testSummary?.validate()
    if (evidence.status == SwarmVerificationStatus.PASSED) {
        require(evidence.exitCode == 0) { "Passed verification requires exit code zero" }
        require(!evidence.timedOut) { "Passed verification cannot time out" }
        require(evidence.terminatingSignal == null) { "Passed verification cannot terminate by signal" }
        require(testSummary == null || testSummary.failed == 0) {
            "Passed verification cannot contain failed tests"
        }
        require(testSummary == null || testSummary.errored == 0) {
            "Passed verification cannot contain errored tests"
        }
    }
}

private fun SwarmVerificationTestSummary.validate() {
    require(total >= 0 && passed >= 0 && failed >= 0 && skipped >= 0 && errored >= 0) {
        "Verification test counts cannot be negative"
    }
    require(total == passed + failed + skipped + errored) { "Verification test counts must add up to total" }
}

private fun requireLabel(value: String, field: String, maxLength: Int = MAX_LABEL_LENGTH) {
    require(value.isNotBlank() && value.length <= maxLength && value.none(Char::isISOControl)) {
        "$field is invalid"
    }
}

private fun requireEvidenceId(value: String) {
    require(value.matches(SHA256_PATTERN)) { "Invalid evidence id" }
}

private fun requireSha256(value: String, field: String) {
    require(value.matches(SHA256_PATTERN)) { "$field must be a lowercase SHA-256 digest" }
}

private fun requireGitObjectId(value: String, field: String) {
    require(value.matches(GIT_OBJECT_PATTERN)) { "$field must be a Git object id" }
}

private val TASK_ARTIFACT_REFERENCE_PATTERN =
    Regex("""^refs/swarm-editor/task-artifacts/task-[0-9a-f]{64}$""")

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private const val CURRENT_EVIDENCE_SCHEMA_VERSION = 1
private const val MAX_LABEL_LENGTH = 512
private const val MAX_REASON_LENGTH = 2_048
private val SHA256_PATTERN = Regex("[0-9a-f]{64}")
private val GIT_OBJECT_PATTERN = Regex("(?:[0-9a-f]{40}|[0-9a-f]{64})")
