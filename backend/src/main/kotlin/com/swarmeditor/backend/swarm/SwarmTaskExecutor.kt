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
    val changedFileCount: Int? = null,
    val verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    val workspaceDeltaEvidenceId: String? = null,
    val verificationEvidenceId: String? = null,
    var toolBrokerSessionIds: List<String> = emptyList(),
    var toolAuditIds: List<String> = emptyList(),
) : RuntimeException(cause.message ?: "Swarm task failed", cause)

class SwarmTaskTimedOutException(
    cause: Throwable,
    val tokenUsage: TokenUsage,
    val experienceIds: List<String> = emptyList(),
    val experienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    val resolvedAgentId: String? = null,
    val changedFileCount: Int? = null,
    val verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    val workspaceDeltaEvidenceId: String? = null,
    val verificationEvidenceId: String? = null,
    var toolBrokerSessionIds: List<String> = emptyList(),
    var toolAuditIds: List<String> = emptyList(),
) : RuntimeException(cause.message ?: "Swarm task timed out", cause)

fun interface SwarmTaskExecutor {
    suspend fun execute(run: SwarmRun, task: SwarmTask): SwarmTaskExecution
}

fun interface SwarmAgentResolver {
    suspend fun resolve(task: SwarmTask): AgentConfig
}

class PiSwarmTaskExecutor(
    private val sessions: PiSessionProvider,
    private val experienceProvider: suspend (SwarmRun, SwarmTask) -> SwarmTaskExperienceContext = { _, _ ->
        SwarmTaskExperienceContext()
    },
    private val agentResolver: SwarmAgentResolver,
) : SwarmTaskExecutor {
    override suspend fun execute(run: SwarmRun, task: SwarmTask): SwarmTaskExecution {
        val baseConfig = agentResolver.resolve(task)
        val experienceContext = experienceProvider(run, task)
        val experiences = experienceContext.experiences
        val experienceIds = experiences.map(SwarmExperience::id).distinct()
        val routingDecisions = experienceContext.routingDecisions.map { it.copy(attempt = task.attempt) }
        val config = buildSwarmTaskAgentConfig(baseConfig, task.role, run.policy.taskTimeoutSeconds)
        val sessionId = "swarm:${run.id}:${task.id}"
        val session = sessions.getOrCreateValidated(
            sessionId = sessionId,
            config = config,
            remoteSessionId = null,
            isConfigCurrent = { agentResolver.resolve(task) == baseConfig },
        )
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
            )
        } catch (error: TimeoutCancellationException) {
            val failure = SwarmTaskTimedOutException(
                error,
                readTokenUsageAfterCancellation(session),
                experienceIds,
                routingDecisions,
                resolvedAgentId = baseConfig.id,
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
            )
            primaryFailure = failure
            throw failure
        } finally {
            var closeError: Throwable? = null
            try {
                withContext(NonCancellable) { sessions.close(sessionId) }
            } catch (error: Throwable) {
                closeError = error
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
            if (closeError != null) {
                val failure = primaryFailure
                if (failure != null) {
                    failure.addSuppressed(closeError)
                } else {
                    throw SwarmTaskExecutionException(
                        closeError,
                        execution?.tokenUsage ?: TokenUsage(),
                        execution?.experienceIds ?: experienceIds,
                        execution?.experienceRoutingDecisions ?: routingDecisions,
                        resolvedAgentId = baseConfig.id,
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
    ): String = buildString {
        appendLine("Swarm objective: ${run.objective}")
        appendLine("Your task: ${task.title}")
        appendLine()
        appendLine(task.prompt)
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
        appendLine("Return a concrete result for this task. Do not delegate further.")
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
        systemPrompt = listOf(base.systemPrompt.trim(), identity.systemPrompt)
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

private fun swarmRoleIdentity(role: SwarmAgentRole): SwarmRoleIdentity = when (role) {
    SwarmAgentRole.PLANNER -> SwarmRoleIdentity(
        name = "Planner",
        systemPrompt = "Act as the swarm planner. Analyze constraints and dependencies, then produce executable " +
            "decisions with explicit verification criteria.",
    )
    SwarmAgentRole.IMPLEMENTER -> SwarmRoleIdentity(
        name = "Implementer",
        systemPrompt = "Act as the implementer. Read the relevant code before editing, make concrete changes, " +
            "and verify functional and integration behavior.",
    )
    SwarmAgentRole.REVIEWER -> SwarmRoleIdentity(
        name = "Reviewer",
        systemPrompt = "Act as a strict reviewer. Inspect functional correctness, integration boundaries, and " +
            "end-to-end data flow; report evidence instead of rubber-stamping.",
    )
    SwarmAgentRole.INTEGRATOR -> SwarmRoleIdentity(
        name = "Integrator",
        systemPrompt = "Act as the integrator. Reconcile dependency outputs, resolve conflicts, and verify the " +
            "complete result across module and data-flow boundaries.",
    )
    SwarmAgentRole.GENERAL -> SwarmRoleIdentity(
        name = "General",
        systemPrompt = "Execute the assigned swarm task precisely and verify the result against its stated objective.",
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
