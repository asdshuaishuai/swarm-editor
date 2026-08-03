package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.TokenUsage
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withContext

data class SwarmTaskExecution(
    val output: String,
    val tokenUsage: TokenUsage = TokenUsage(),
    val experienceIds: List<String> = emptyList(),
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val resolvedAgentId: String? = null,
    val resolvedModelConfigId: String? = null,
    val resolvedProvider: String? = null,
    val resolvedModel: String? = null,
    val toolBrokerSessionIds: List<String> = emptyList(),
    val toolAuditIds: List<String> = emptyList(),
    val changedFileCount: Int? = null,
    val verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    val workspaceDeltaEvidenceId: String? = null,
    val verificationEvidenceId: String? = null,
)

data class SwarmTaskExperienceContext(
    val experiences: List<SwarmExperience> = emptyList(),
    val routingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
)

class SwarmTaskExecutionException(
    cause: Throwable,
    val tokenUsage: TokenUsage,
    val experienceIds: List<String> = emptyList(),
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val resolvedAgentId: String? = null,
    val resolvedModelConfigId: String? = null,
    val resolvedProvider: String? = null,
    val resolvedModel: String? = null,
    var changedFileCount: Int? = null,
    var verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    var workspaceDeltaEvidenceId: String? = null,
    var verificationEvidenceId: String? = null,
    var toolBrokerSessionIds: List<String> = emptyList(),
    var toolAuditIds: List<String> = emptyList(),
) : RuntimeException(cause.message ?: "Swarm task failed", cause)

class SwarmTaskTimedOutException(
    cause: Throwable,
    val tokenUsage: TokenUsage,
    val experienceIds: List<String> = emptyList(),
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val resolvedAgentId: String? = null,
    val resolvedModelConfigId: String? = null,
    val resolvedProvider: String? = null,
    val resolvedModel: String? = null,
    var changedFileCount: Int? = null,
    var verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    var workspaceDeltaEvidenceId: String? = null,
    var verificationEvidenceId: String? = null,
    var toolBrokerSessionIds: List<String> = emptyList(),
    var toolAuditIds: List<String> = emptyList(),
) : RuntimeException(cause.message ?: "Swarm task timed out", cause)

class SwarmOwnershipViolationException(
    val taskId: String,
    val violations: List<com.swarmeditor.common.model.SwarmOwnershipViolation>,
) : IllegalStateException(
    "Task $taskId changed paths outside declared write ownership: " +
        violations.joinToString { "${it.status} ${it.path}" },
)

class SwarmTaskVerificationFailedException(
    val taskId: String,
    val evidenceId: String,
    val exitCode: Int?,
    val timedOut: Boolean,
    output: String,
) : IllegalStateException(
    buildString {
        append("Task $taskId failed runtime verification")
        if (timedOut) append(" after timing out") else exitCode?.let { append(" with exit code $it") }
        output.lineSequence().lastOrNull(String::isNotBlank)?.let { append(": ${it.take(512)}") }
    }
)

fun interface SwarmTaskExecutor {
    suspend fun execute(run: SwarmRun, task: SwarmTask): SwarmTaskExecution
}

fun interface SwarmAgentResolver {
    suspend fun resolve(task: SwarmTask): SwarmAgentAllocation
}

class SwarmAgentAllocation(
    val config: AgentConfig,
    val isCurrent: suspend () -> Boolean = { true },
    private val releaseAllocation: suspend () -> Unit = {},
) {
    private val released = AtomicBoolean(false)

    suspend fun release() {
        if (released.compareAndSet(false, true)) releaseAllocation()
    }
}

class PiSwarmTaskExecutor(
    private val sessions: PiSessionProvider,
    private val experienceProvider: suspend (SwarmRun, SwarmTask) -> SwarmTaskExperienceContext = { _, _ ->
        SwarmTaskExperienceContext()
    },
    private val workspaceManager: SwarmTaskWorkspaceManager? = null,
    private val workspaceDeltaCapturer: SwarmWorkspaceDeltaCapturer? = null,
    private val baseRevisionResolver: SwarmTaskBaseRevisionResolver = SwarmTaskBaseRevisionResolver { run, _ ->
        requireNotNull(run.repositoryBaseline) { "Swarm run has no repository baseline" }.revision
    },
    private val taskVerifier: SwarmTaskVerifier? = null,
    private val agentResolver: SwarmAgentResolver,
) : SwarmTaskExecutor {
    init {
        require((workspaceManager == null) == (workspaceDeltaCapturer == null)) {
            "Swarm task workspace manager and delta capturer must be configured together"
        }
    }

    override suspend fun execute(run: SwarmRun, task: SwarmTask): SwarmTaskExecution {
        val manager = workspaceManager ?: return executeSession(run, task, workingDirectory = null)
        val capturer = checkNotNull(workspaceDeltaCapturer)
        val baseRevision = baseRevisionResolver.resolve(run, task)
        return manager.withWorkspace(
            runId = run.id,
            taskId = task.id,
            attempt = task.attempt,
            baseRevision = baseRevision,
        ) { workspace ->
            executeInWorkspace(run, task, workspace, capturer)
        }
    }

    private suspend fun executeInWorkspace(
        run: SwarmRun,
        task: SwarmTask,
        workspace: SwarmTaskWorkspace,
        capturer: SwarmWorkspaceDeltaCapturer,
    ): SwarmTaskExecution {
        var execution: SwarmTaskExecution? = null
        var sessionFailure: Throwable? = null
        try {
            execution = executeSession(run, task, workspace.directory)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            sessionFailure = error
        }
        val captured = try {
            capturer.capture(workspace, task)
        } catch (error: CancellationException) {
            throw error
        } catch (captureError: Throwable) {
            val failure = sessionFailure
            if (failure != null) {
                failure.addSuppressed(captureError)
                throw failure
            }
            throw captureError
        }
        sessionFailure?.attachWorkspaceEvidence(captured)
        if (captured.evidence.ownershipCompliant == false) {
            val metadata = executionMetadata(execution, sessionFailure)
            throw SwarmTaskExecutionException(
                cause = SwarmOwnershipViolationException(task.id, captured.evidence.ownershipViolations),
                tokenUsage = metadata.tokenUsage,
                experienceIds = metadata.experienceIds,
                experienceRoutingDecisions = metadata.experienceRoutingDecisions,
                resolvedAgentId = metadata.resolvedAgentId,
                resolvedModelConfigId = metadata.resolvedModelConfigId,
                resolvedProvider = metadata.resolvedProvider,
                resolvedModel = metadata.resolvedModel,
                changedFileCount = captured.evidence.changedPathCount,
                verificationStatus = SwarmVerificationStatus.FAILED,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = metadata.verificationEvidenceId,
                toolBrokerSessionIds = metadata.toolBrokerSessionIds,
                toolAuditIds = metadata.toolAuditIds,
            ).also { violation -> sessionFailure?.let(violation::addSuppressed) }
        }
        sessionFailure?.let { throw it }
        val completedExecution = checkNotNull(execution)
        if (task.verificationCommands.isEmpty()) {
            return completedExecution.copy(
                changedFileCount = captured.evidence.changedPathCount,
                workspaceDeltaEvidenceId = captured.id,
            )
        }
        val verifier = checkNotNull(taskVerifier) {
            "Task ${task.id} declares verification commands but no task verifier is configured"
        }
        val verification = try {
            verifier.verify(
                SwarmTaskVerificationRequest(
                    runId = run.id,
                    task = task,
                    workspace = workspace,
                    workspaceDeltaEvidenceId = captured.id,
                    beforeTree = captured.evidence.beforeTree,
                    afterTree = captured.evidence.afterTree,
                    toolAuditIds = completedExecution.toolAuditIds,
                )
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw SwarmTaskExecutionException(
                cause = error,
                tokenUsage = completedExecution.tokenUsage,
                experienceIds = completedExecution.experienceIds,
                experienceRoutingDecisions = completedExecution.experienceRoutingDecisions,
                resolvedAgentId = completedExecution.resolvedAgentId,
                resolvedModelConfigId = completedExecution.resolvedModelConfigId,
                resolvedProvider = completedExecution.resolvedProvider,
                resolvedModel = completedExecution.resolvedModel,
                changedFileCount = captured.evidence.changedPathCount,
                verificationStatus = SwarmVerificationStatus.FAILED,
                workspaceDeltaEvidenceId = captured.id,
                toolBrokerSessionIds = completedExecution.toolBrokerSessionIds,
                toolAuditIds = completedExecution.toolAuditIds,
            )
        }
        if (verification.status != SwarmVerificationStatus.PASSED) {
            throw SwarmTaskExecutionException(
                cause = SwarmTaskVerificationFailedException(
                    taskId = task.id,
                    evidenceId = verification.evidenceId,
                    exitCode = verification.exitCode,
                    timedOut = verification.timedOut,
                    output = verification.output,
                ),
                tokenUsage = completedExecution.tokenUsage,
                experienceIds = completedExecution.experienceIds,
                experienceRoutingDecisions = completedExecution.experienceRoutingDecisions,
                resolvedAgentId = completedExecution.resolvedAgentId,
                resolvedModelConfigId = completedExecution.resolvedModelConfigId,
                resolvedProvider = completedExecution.resolvedProvider,
                resolvedModel = completedExecution.resolvedModel,
                changedFileCount = captured.evidence.changedPathCount,
                verificationStatus = SwarmVerificationStatus.FAILED,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verification.evidenceId,
                toolBrokerSessionIds = completedExecution.toolBrokerSessionIds,
                toolAuditIds = completedExecution.toolAuditIds,
            )
        }
        return completedExecution.copy(
            changedFileCount = captured.evidence.changedPathCount,
            verificationStatus = SwarmVerificationStatus.PASSED,
            workspaceDeltaEvidenceId = captured.id,
            verificationEvidenceId = verification.evidenceId,
        )
    }

    private suspend fun executeSession(
        run: SwarmRun,
        task: SwarmTask,
        workingDirectory: File?,
    ): SwarmTaskExecution {
        val experienceContext = experienceProvider(run, task)
        val experiences = experienceContext.experiences
        val experienceIds = experiences.map(SwarmExperience::id).distinct()
        val routingDecisions = experienceContext.routingDecisions.map { it.copy(attempt = task.attempt) }
        val allocation = agentResolver.resolve(task)
        val baseConfig = allocation.config
        val sessionId = "swarm:${run.id}:${task.id}"
        val session = try {
            val config = buildSwarmTaskAgentConfig(baseConfig, task.role, run.policy.taskTimeoutSeconds).let { configured ->
                workingDirectory?.let { configured.copy(workingDirectory = it.canonicalPath) } ?: configured
            }
            sessions.getOrCreateValidated(
                sessionId = sessionId,
                config = config,
                remoteSessionId = null,
                isConfigCurrent = allocation.isCurrent,
            )
        } catch (error: Throwable) {
            withContext(NonCancellable) {
                try {
                    allocation.release()
                } catch (releaseError: Throwable) {
                    error.addSuppressed(releaseError)
                }
            }
            throw error
        }
        var execution: SwarmTaskExecution? = null
        var primaryFailure: Throwable? = null
        try {
            val output = session.prompt(buildPrompt(run, task, experiences))
            execution = SwarmTaskExecution(
                output = output,
                tokenUsage = readTokenUsage(session),
                experienceIds = experienceIds,
                experienceRoutingDecisions = routingDecisions,
                resolvedAgentId = baseConfig.id,
                resolvedModelConfigId = baseConfig.modelConfigId.takeIf(String::isNotBlank),
                resolvedProvider = baseConfig.provider.takeIf(String::isNotBlank),
                resolvedModel = baseConfig.model.takeIf(String::isNotBlank),
            )
        } catch (error: TimeoutCancellationException) {
            val failure = SwarmTaskTimedOutException(
                error,
                readTokenUsageAfterCancellation(session),
                experienceIds,
                routingDecisions,
                resolvedAgentId = baseConfig.id,
                resolvedModelConfigId = baseConfig.modelConfigId.takeIf(String::isNotBlank),
                resolvedProvider = baseConfig.provider.takeIf(String::isNotBlank),
                resolvedModel = baseConfig.model.takeIf(String::isNotBlank),
            )
            primaryFailure = failure
            throw failure
        } catch (error: CancellationException) {
            primaryFailure = error
            throw error
        } catch (error: Throwable) {
            val failure = SwarmTaskExecutionException(
                error,
                readTokenUsage(session),
                experienceIds,
                routingDecisions,
                resolvedAgentId = baseConfig.id,
                resolvedModelConfigId = baseConfig.modelConfigId.takeIf(String::isNotBlank),
                resolvedProvider = baseConfig.provider.takeIf(String::isNotBlank),
                resolvedModel = baseConfig.model.takeIf(String::isNotBlank),
            )
            primaryFailure = failure
            throw failure
        } finally {
            var cleanupError: Throwable? = null
            try {
                withContext(NonCancellable) { sessions.close(sessionId) }
            } catch (error: Throwable) {
                cleanupError = error
            }
            val toolBrokerSessionIds = listOfNotNull(session.toolBrokerSessionId)
            val toolAuditIds = session.toolAuditIds.distinct()
            execution = execution?.copy(
                toolBrokerSessionIds = toolBrokerSessionIds,
                toolAuditIds = toolAuditIds,
            )
            when (val failure = primaryFailure) {
                is SwarmTaskExecutionException -> {
                    failure.toolBrokerSessionIds = toolBrokerSessionIds
                    failure.toolAuditIds = toolAuditIds
                }
                is SwarmTaskTimedOutException -> {
                    failure.toolBrokerSessionIds = toolBrokerSessionIds
                    failure.toolAuditIds = toolAuditIds
                }
            }
            try {
                withContext(NonCancellable) { allocation.release() }
            } catch (error: Throwable) {
                cleanupError?.addSuppressed(error) ?: run { cleanupError = error }
            }
            if (cleanupError != null) {
                val failure = primaryFailure
                if (failure != null) {
                    failure.addSuppressed(cleanupError)
                } else {
                    throw SwarmTaskExecutionException(
                        cleanupError,
                        execution?.tokenUsage ?: TokenUsage(),
                        execution?.experienceIds ?: experienceIds,
                        execution?.experienceRoutingDecisions ?: routingDecisions,
                        resolvedAgentId = baseConfig.id,
                        resolvedModelConfigId = baseConfig.modelConfigId.takeIf(String::isNotBlank),
                        resolvedProvider = baseConfig.provider.takeIf(String::isNotBlank),
                        resolvedModel = baseConfig.model.takeIf(String::isNotBlank),
                        changedFileCount = execution?.changedFileCount,
                        verificationStatus = execution?.verificationStatus ?: SwarmVerificationStatus.NOT_RECORDED,
                        workspaceDeltaEvidenceId = execution?.workspaceDeltaEvidenceId,
                        verificationEvidenceId = execution?.verificationEvidenceId,
                        toolBrokerSessionIds = toolBrokerSessionIds,
                        toolAuditIds = toolAuditIds,
                    )
                }
            }
        }
        return checkNotNull(execution) { "Swarm task completed without an execution result" }
    }

    private suspend fun readTokenUsage(session: com.swarmeditor.backend.pi.PiSession): TokenUsage {
        val stats = session.stats.value ?: try {
            session.refreshStats()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            null
        }
        return stats?.toTokenUsage() ?: TokenUsage()
    }

    private suspend fun readTokenUsageAfterCancellation(
        session: com.swarmeditor.backend.pi.PiSession,
    ): TokenUsage = withContext(NonCancellable) {
        session.stats.value?.toTokenUsage() ?: try {
            session.refreshStats().toTokenUsage()
        } catch (_: Throwable) {
            TokenUsage()
        }
    }

    private fun buildPrompt(
        run: SwarmRun,
        task: SwarmTask,
        experiences: List<SwarmExperience>,
    ): String {
        val graph = SwarmGraph.analyze(run.tasks)
        val metrics = graph.metrics.getValue(task.id)
        val successors = graph.dependents.getValue(task.id)
        return buildString {
            appendLine("Swarm objective: ${run.objective}")
            appendLine("Your task: ${task.title}")
            appendLine()
            appendLine("Graph position:")
            appendLine("- Depth from root: ${metrics.depth}")
            appendLine("- Upstream dependencies: ${task.dependsOn.ifEmpty { listOf("<none>") }.joinToString()}")
            appendLine("- Direct downstream tasks: ${successors.ifEmpty { listOf("<none>") }.joinToString()}")
            appendLine("- Downstream reach: ${metrics.downstreamReach} task(s)")
            appendLine("Your output is a graph artifact: downstream tasks may rely on it, so make assumptions and evidence explicit.")
            appendLine()
            appendLine(task.prompt)
            appendLine()
            appendLine("Execution protocol:")
            appendLine("1. Establish repository facts with the narrowest useful reads, search, LSP, or history inspection.")
            appendLine("2. Separate observed facts from inferences; resolve material uncertainty with tools instead of guessing.")
            appendLine("3. Make the smallest complete change inside the ownership contract, preserving cancellation and data-flow boundaries.")
            appendLine("4. Verify focused behavior first, then the integration path named by the task.")
            appendLine("5. Stop when the acceptance contract is satisfied; report blockers rather than expanding scope.")
            if (task.readPaths.isNotEmpty() || task.writePaths.isNotEmpty()) {
                appendLine()
                appendLine("Repository ownership contract:")
                appendLine("- Read paths: ${task.readPaths.ifEmpty { listOf("<none>") }.joinToString()}")
                appendLine("- Write paths: ${task.writePaths.ifEmpty { listOf("<read-only>") }.joinToString()}")
                appendLine("Do not modify files outside the declared write paths; the resulting Git delta is audited.")
            }
            if (task.verificationCommands.isNotEmpty()) {
                appendLine()
                appendLine("Runtime verification commands:")
                task.verificationCommands.forEach { command -> appendLine("- ${command.joinToString(" ")}") }
                appendLine("These commands run mechanically after your work; do not claim success without satisfying them.")
            }
            if (experiences.isNotEmpty()) {
                appendLine()
                appendLine("Relevant project experience:")
                experiences.forEach { experience ->
                    appendLine(
                        "- [${experience.kind}] ${experience.principle}: ${experience.rationale} " +
                            "(observed uses: success=${experience.successfulUses}, " +
                            "recovered=${experience.recoveredUses}, failure=${experience.failedUses})"
                    )
                }
                appendLine("Usage counts are observational, not proof of causality.")
                appendLine("Apply these lessons only where they fit the current evidence and repository constraints.")
            }
            if (task.failureHistory.isNotEmpty()) {
                appendLine()
                appendLine("Previous attempts failed:")
                task.failureHistory.forEach { failure -> appendLine("- $failure") }
                appendLine("Correct the prior failures. Do not repeat the same unsuccessful approach.")
            }
            val dependencyOutputs = run.tasks.filter {
                it.id in task.dependsOn && it.status == SwarmTaskStatus.SUCCEEDED
            }
            if (dependencyOutputs.isNotEmpty()) {
                appendLine()
                appendLine("Completed dependency outputs:")
                dependencyOutputs.forEach { dependency ->
                    appendLine("--- ${dependency.id}: ${dependency.title} ---")
                    appendLine(dependency.output)
                }
            }
            appendLine()
            appendLine("Result contract:")
            appendLine("- State the concrete outcome and changed artifacts, or explain why no change is justified.")
            appendLine("- List verification actually performed and its result; never imply checks that were not run.")
            appendLine("- Identify residual risk, unresolved uncertainty, and exact evidence needed by downstream tasks.")
            appendLine("- Do not delegate further and do not expand beyond this task's graph and ownership boundaries.")
        }
    }
}

private data class SwarmExecutionMetadata(
    val tokenUsage: TokenUsage,
    val experienceIds: List<String>,
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision>,
    val resolvedAgentId: String?,
    val resolvedModelConfigId: String?,
    val resolvedProvider: String?,
    val resolvedModel: String?,
    val toolBrokerSessionIds: List<String>,
    val toolAuditIds: List<String>,
    val verificationEvidenceId: String?,
)

private fun executionMetadata(
    execution: SwarmTaskExecution?,
    failure: Throwable?,
): SwarmExecutionMetadata = when (failure) {
    is SwarmTaskExecutionException -> SwarmExecutionMetadata(
        tokenUsage = failure.tokenUsage,
        experienceIds = failure.experienceIds,
        experienceRoutingDecisions = failure.experienceRoutingDecisions,
        resolvedAgentId = failure.resolvedAgentId,
        resolvedModelConfigId = failure.resolvedModelConfigId,
        resolvedProvider = failure.resolvedProvider,
        resolvedModel = failure.resolvedModel,
        toolBrokerSessionIds = failure.toolBrokerSessionIds,
        toolAuditIds = failure.toolAuditIds,
        verificationEvidenceId = failure.verificationEvidenceId,
    )
    is SwarmTaskTimedOutException -> SwarmExecutionMetadata(
        tokenUsage = failure.tokenUsage,
        experienceIds = failure.experienceIds,
        experienceRoutingDecisions = failure.experienceRoutingDecisions,
        resolvedAgentId = failure.resolvedAgentId,
        resolvedModelConfigId = failure.resolvedModelConfigId,
        resolvedProvider = failure.resolvedProvider,
        resolvedModel = failure.resolvedModel,
        toolBrokerSessionIds = failure.toolBrokerSessionIds,
        toolAuditIds = failure.toolAuditIds,
        verificationEvidenceId = failure.verificationEvidenceId,
    )
    else -> SwarmExecutionMetadata(
        tokenUsage = execution?.tokenUsage ?: TokenUsage(),
        experienceIds = execution?.experienceIds.orEmpty(),
        experienceRoutingDecisions = execution?.experienceRoutingDecisions.orEmpty(),
        resolvedAgentId = execution?.resolvedAgentId,
        resolvedModelConfigId = execution?.resolvedModelConfigId,
        resolvedProvider = execution?.resolvedProvider,
        resolvedModel = execution?.resolvedModel,
        toolBrokerSessionIds = execution?.toolBrokerSessionIds.orEmpty(),
        toolAuditIds = execution?.toolAuditIds.orEmpty(),
        verificationEvidenceId = execution?.verificationEvidenceId,
    )
}

private fun Throwable.attachWorkspaceEvidence(captured: StoredSwarmWorkspaceDelta) {
    when (this) {
        is SwarmTaskExecutionException -> {
            changedFileCount = captured.evidence.changedPathCount
            workspaceDeltaEvidenceId = captured.id
        }
        is SwarmTaskTimedOutException -> {
            changedFileCount = captured.evidence.changedPathCount
            workspaceDeltaEvidenceId = captured.id
        }
    }
}

internal fun buildSwarmTaskAgentConfig(
    base: AgentConfig,
    role: SwarmAgentRole,
    taskTimeoutSeconds: Int = base.timeoutSeconds,
): AgentConfig {
    require(taskTimeoutSeconds > 0) { "Swarm task timeout must be positive" }
    val identity = swarmRoleIdentity(role)
    return base.copy(
        name = "${base.name} · ${identity.name}",
        systemPrompt = listOf(base.systemPrompt.trim(), SWARM_SYSTEM_PROTOCOL, identity.systemPrompt)
            .filter(String::isNotBlank)
            .joinToString("\n\n"),
        tags = (base.tags + "pi" + "swarm" + "role:${role.name.lowercase()}").distinct(),
        timeoutSeconds = taskTimeoutSeconds,
    )
}

private data class SwarmRoleIdentity(
    val name: String,
    val systemPrompt: String,
)

private val SWARM_SYSTEM_PROTOCOL = """
You are a Pi subagent inside an evidence-driven software-engineering graph. Maximize useful model capability by
grounding decisions in repository facts and tool results, not by producing longer speculation. Keep observations,
inferences, actions, and verification claims distinguishable in the final result. Resolve consequential uncertainty
with tools when possible. Respect the assigned graph node, ownership scope, upstream artifacts, and acceptance
contract. Never fabricate files, commands, test results, or completion evidence. Prefer a minimal complete solution,
surface blockers precisely, and stop when the assigned contract is satisfied.
""".trimIndent()

private fun swarmRoleIdentity(role: SwarmAgentRole): SwarmRoleIdentity = when (role) {
    SwarmAgentRole.PLANNER -> SwarmRoleIdentity(
        name = "Planner",
        systemPrompt = "Act as the graph planner. Build the smallest dependency DAG that preserves real information " +
            "and artifact flow. Prioritize high-information localization, expose safe fan-out, define explicit " +
            "deliverables and acceptance evidence, and avoid redundant agents or edges.",
    )
    SwarmAgentRole.IMPLEMENTER -> SwarmRoleIdentity(
        name = "Implementer",
        systemPrompt = "Act as the implementer. Inspect definitions, callers, tests, and data-flow boundaries before " +
            "editing. Apply the smallest root-cause fix inside the write contract and verify focused behavior before " +
            "the integration path.",
    )
    SwarmAgentRole.REVIEWER -> SwarmRoleIdentity(
        name = "Reviewer",
        systemPrompt = "Act as an adversarial reviewer. Trace functional correctness, integration boundaries, and " +
            "end-to-end data flow; search for counterexamples, scope expansion, missing tests, and unverifiable " +
            "claims, and tie every finding to specific evidence.",
    )
    SwarmAgentRole.INTEGRATOR -> SwarmRoleIdentity(
        name = "Integrator",
        systemPrompt = "Act as the graph integrator. Reconcile upstream artifacts rather than repeating their work, " +
            "resolve semantic and ownership conflicts, and verify the composed result across module, process, " +
            "persistence, and UI boundaries.",
    )
    SwarmAgentRole.GENERAL -> SwarmRoleIdentity(
        name = "General",
        systemPrompt = "Execute the assigned graph node precisely, use tools to close material uncertainty, and " +
            "deliver an auditable result against the stated acceptance contract.",
    )
}

private fun com.swarmeditor.backend.pi.PiSessionStats.toTokenUsage() = TokenUsage(
    input = tokens.input,
    output = tokens.output,
    cacheRead = tokens.cacheRead,
    cacheWrite = tokens.cacheWrite,
    total = tokens.total,
    cost = cost,
)
