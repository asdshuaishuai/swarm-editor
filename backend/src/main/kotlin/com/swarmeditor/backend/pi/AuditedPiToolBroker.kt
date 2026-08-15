package com.swarmeditor.backend.pi

import com.swarmeditor.backend.capability.CapabilityRegistry
import com.swarmeditor.common.model.CapabilityPermission
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement

data class PiToolCapabilityResult(
    val result: JsonElement,
    val exitCode: Int? = null,
    val outputTruncated: Boolean = false,
)

fun interface PiToolCapabilityExecutor {
    suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult

    suspend fun close() = Unit
}

class AuditedPiToolBroker(
    private val agentId: String,
    workspace: File,
    private val executor: PiToolCapabilityExecutor,
    private val auditStore: PiToolAuditStore,
    override val brokersCoreTools: Boolean = true,
    private val currentTimeMillis: () -> Long = System::currentTimeMillis,
    private val capabilityRegistry: CapabilityRegistry? = null,
) : PiToolBroker {
    private val workspaceHash = sha256(workspace.canonicalFile.absolutePath)
    override val brokerSessionId = "broker-${UUID.randomUUID().toString().replace("-", "")}"
    private val persistedAuditIds = ConcurrentLinkedQueue<String>()

    override fun auditIds(): List<String> = persistedAuditIds.toList()

    override suspend fun execute(request: PiToolBrokerRequest): PiToolBrokerResult {
        val auditId = "audit-${UUID.randomUUID().toString().replace("-", "")}"
        val startedAt = currentTimeMillis()
        return try {
            enforceCapability(request)
            val execution = executor.execute(request)
            val completedAt = currentTimeMillis()
            auditStore.append(
                request.record(
                    auditId = auditId,
                    startedAt = startedAt,
                    completedAt = completedAt,
                    outcome = PiToolAuditOutcome.SUCCEEDED,
                    resultBytes = execution.result.toString().encodeToByteArray().size,
                    exitCode = execution.exitCode,
                    outputTruncated = execution.outputTruncated,
                )
            )
            persistedAuditIds += auditId
            PiToolBrokerResult(execution.result, auditId)
        } catch (error: CancellationException) {
            if (persistFailure(request, auditId, startedAt, PiToolAuditOutcome.CANCELED, error)) {
                persistedAuditIds += auditId
            }
            throw error
        } catch (error: Throwable) {
            if (persistFailure(request, auditId, startedAt, PiToolAuditOutcome.FAILED, error)) {
                persistedAuditIds += auditId
            }
            throw error
        }
    }

    private suspend fun enforceCapability(request: PiToolBrokerRequest) {
        val registry = capabilityRegistry ?: return
        val (capabilityId, permissions) = when (request.tool) {
            "read" -> "pi.read" to setOf(CapabilityPermission.READ_PROJECT)
            "edit", "write" -> "pi.edit" to setOf(
                CapabilityPermission.READ_PROJECT,
                CapabilityPermission.WRITE_PROJECT,
            )
            "bash" -> "pi.bash" to setOf(CapabilityPermission.EXECUTE_PROCESS)
            "wasm" -> "wasm.execute" to setOf(CapabilityPermission.EXECUTE_PROCESS)
            else -> error("No capability mapping for tool: ${request.tool}")
        }
        val decision = registry.check(capabilityId, permissions)
        check(decision.allowed) { "Capability denied for ${request.tool}.${request.operation}: ${decision.reason}" }
    }

    override suspend fun close() {
        executor.close()
    }

    private suspend fun persistFailure(
        request: PiToolBrokerRequest,
        auditId: String,
        startedAt: Long,
        outcome: PiToolAuditOutcome,
        original: Throwable,
    ): Boolean {
        val completedAt = currentTimeMillis()
        try {
            withContext(NonCancellable) {
                auditStore.append(
                    request.record(
                        auditId = auditId,
                        startedAt = startedAt,
                        completedAt = completedAt,
                        outcome = outcome,
                        errorCategory = original::class.simpleName ?: "Throwable",
                    )
                )
            }
            return true
        } catch (auditError: Throwable) {
            original.addSuppressed(auditError)
            return false
        }
    }

    private fun PiToolBrokerRequest.record(
        auditId: String,
        startedAt: Long,
        completedAt: Long,
        outcome: PiToolAuditOutcome,
        resultBytes: Int? = null,
        exitCode: Int? = null,
        outputTruncated: Boolean = false,
        errorCategory: String? = null,
    ) = PiToolAuditRecord(
        auditId = auditId,
        brokerSessionId = brokerSessionId,
        agentId = agentId,
        workspaceHash = workspaceHash,
        requestId = requestId,
        tool = tool,
        operation = operation,
        argumentsHash = argumentsHash,
        startedAtMillis = startedAt,
        completedAtMillis = completedAt,
        durationMillis = (completedAt - startedAt).coerceAtLeast(0),
        outcome = outcome,
        resultBytes = resultBytes,
        exitCode = exitCode,
        outputTruncated = outputTruncated,
        errorCategory = errorCategory,
    )
}

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.encodeToByteArray())
    .joinToString("") { byte -> "%02x".format(byte) }
