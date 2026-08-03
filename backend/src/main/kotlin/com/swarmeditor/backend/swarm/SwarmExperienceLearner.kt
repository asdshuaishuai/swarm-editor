package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock

fun interface SwarmRunLearner {
    suspend fun learn(run: SwarmRun)
}

class PiSwarmExperienceLearner(
    private val sessions: PiSessionProvider,
    private val store: SwarmExperienceStore,
    private val availableAgents: suspend () -> List<AgentConfig>,
    private val isConfigCurrent: suspend (AgentConfig) -> Boolean = { true },
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
    private val maxInsights: Int = 6,
) : SwarmRunLearner {
    init {
        require(maxInsights > 0) { "maxInsights must be positive" }
    }

    override suspend fun learn(run: SwarmRun) {
        if (run.status != SwarmRunStatus.SUCCEEDED && run.status != SwarmRunStatus.FAILED) return
        store.recordUsage(run)
        val agents = availableAgents()
        if (agents.isEmpty()) return
        val baseConfig = selectReflectorConfig(agents)
        val config = buildSwarmTaskAgentConfig(baseConfig, SwarmAgentRole.REVIEWER)
        val existing = store.findRelevant(run.objective, limit = MAX_EXISTING_EXPERIENCES)
        val sessionId = "swarm-learn:${run.id}:${UUID.randomUUID().toString().take(8)}"
        val session = sessions.getOrCreateValidated(
            sessionId = sessionId,
            config = config,
            remoteSessionId = null,
            isConfigCurrent = { isConfigCurrent(baseConfig) },
        )
        var primaryFailure: Throwable? = null
        try {
            val response = session.prompt(buildLearningPrompt(run, existing))
            val insights = parseExperienceInsights(response, maxInsights)
            store.applyInsights(run.id, insights, now())
        } catch (error: Throwable) {
            primaryFailure = error
            throw error
        } finally {
            try {
                withContext(NonCancellable) { sessions.close(sessionId) }
            } catch (closeError: Throwable) {
                val primary = primaryFailure
                if (primary != null) primary.addSuppressed(closeError) else throw closeError
            }
        }
    }

    private fun selectReflectorConfig(agents: List<AgentConfig>): AgentConfig =
        agents.firstOrNull { config -> config.hasRoleTag(SwarmAgentRole.REVIEWER) }
            ?: agents.firstOrNull { config -> config.hasRoleTag(SwarmAgentRole.PLANNER) }
            ?: agents.first()

    private fun buildLearningPrompt(
        run: SwarmRun,
        existing: List<com.swarmeditor.common.model.SwarmExperience>,
    ): String = buildString {
        appendLine("Extract durable, reusable engineering experiences from this completed Pi swarm run.")
        appendLine("Do not summarize the run. Produce only lessons that can improve future planning or execution.")
        appendLine("Reuse an existing id when the new evidence reinforces the same lesson; otherwise create a stable id.")
        appendLine()
        appendLine("Run status: ${run.status}")
        appendLine("Objective: ${run.objective}")
        appendLine("Policy: parallelism=${run.policy.maxParallelism}, failFast=${run.policy.failFast}, " +
            "maxTaskAttempts=${run.policy.maxTaskAttempts}")
        if (existing.isNotEmpty()) {
            appendLine()
            appendLine("Existing relevant experience ids:")
            existing.forEach { experience ->
                appendLine("- ${experience.id} [${experience.kind}/${experience.role ?: "ALL"}]: ${experience.principle}")
                appendLine(
                    "  observations: success=${experience.successfulUses}, recovered=${experience.recoveredUses}, " +
                        "failure=${experience.failedUses}; these counts are correlational, not causal."
                )
            }
        }
        appendLine()
        appendLine("Task evidence:")
        run.tasks.forEach { task ->
            appendLine("--- ${task.id} | ${task.role} | ${task.status} | attempts=${task.attempt} ---")
            appendLine("Instruction: ${task.prompt.take(MAX_TASK_TEXT)}")
            if (task.failureHistory.isNotEmpty()) appendLine("Failures: ${task.failureHistory.joinToString(" | ")}")
            if (!task.errorMessage.isNullOrBlank()) appendLine("Final error: ${task.errorMessage}")
            task.handoff?.let { handoff ->
                appendLine("Handoff status: ${handoff.status}; missing=${handoff.missingSections.joinToString()}")
                if (handoff.outcome.isNotBlank()) appendLine("Outcome: ${handoff.outcome.take(MAX_TASK_TEXT)}")
                if (handoff.evidence.isNotBlank()) appendLine("Evidence: ${handoff.evidence.take(MAX_TASK_TEXT)}")
                if (handoff.verification.isNotBlank()) {
                    appendLine("Verification: ${handoff.verification.take(MAX_TASK_TEXT)}")
                }
                if (handoff.residualRisk.isNotBlank()) {
                    appendLine("Residual risk: ${handoff.residualRisk.take(MAX_TASK_TEXT)}")
                }
            } ?: task.output.takeIf(String::isNotBlank)?.let { output ->
                appendLine("Output: ${output.take(MAX_TASK_TEXT)}")
            }
        }
        appendLine()
        appendLine("Return JSON only using this schema:")
        appendLine(
            """{"insights":[{"id":"verify-data-flow","principle":"Trace UI-to-storage data flow before editing","rationale":"Why this generalizes","kind":"STRATEGY","role":"REVIEWER","tags":["integration"],"evidence":"SUCCESS"}]}"""
        )
        appendLine("Rules:")
        appendLine("- Return at most $maxInsights insights; an empty list is valid when evidence is weak.")
        appendLine("- id must use 3-64 lowercase letters, numbers, underscore, or hyphen.")
        appendLine("- kind must be STRATEGY or PITFALL; evidence must be SUCCESS or FAILURE.")
        appendLine("- role may be null or one of ${SwarmAgentRole.entries.joinToString { it.name }}.")
        appendLine("- Every insight must be supported by concrete task evidence and remain useful across runs.")
        appendLine("- Do not include transient file names, issue-specific facts, secrets, or unverified speculation.")
    }
}

@Serializable
private data class ExperienceDocument(val insights: List<ExperienceInsightDocument> = emptyList())

@Serializable
private data class ExperienceInsightDocument(
    val id: String,
    val principle: String,
    val rationale: String,
    val kind: String,
    val role: String? = null,
    val tags: List<String> = emptyList(),
    val evidence: String,
)

internal fun parseExperienceInsights(response: String, maxInsights: Int): List<SwarmExperienceInsight> {
    require(maxInsights > 0) { "maxInsights must be positive" }
    val document = experienceJson.decodeFromString<ExperienceDocument>(extractJsonObject(response))
    require(document.insights.size <= maxInsights) { "Too many swarm experience insights" }
    return document.insights.map { insight ->
        val id = insight.id.trim()
        require(id.matches(Regex("[a-z0-9][a-z0-9_-]{2,63}"))) { "Invalid swarm experience id: $id" }
        SwarmExperienceInsight(
            id = id,
            principle = insight.principle.trim().also { require(it.isNotBlank()) },
            rationale = insight.rationale.trim().also { require(it.isNotBlank()) },
            kind = SwarmExperienceKind.entries.firstOrNull { it.name.equals(insight.kind.trim(), true) }
                ?: error("Unsupported swarm experience kind: ${insight.kind}"),
            role = insight.role?.trim()?.takeIf(String::isNotBlank)?.let { role ->
                SwarmAgentRole.entries.firstOrNull { it.name.equals(role, true) }
                    ?: error("Unsupported swarm experience role: $role")
            },
            tags = insight.tags,
            evidence = SwarmExperienceEvidence.entries.firstOrNull { it.name.equals(insight.evidence.trim(), true) }
                ?: error("Unsupported swarm experience evidence: ${insight.evidence}"),
        )
    }
}

private fun AgentConfig.hasRoleTag(role: SwarmAgentRole): Boolean =
    tags.any { it.trim().equals("role:${role.name.lowercase()}", ignoreCase = true) }

private val experienceJson = Json { ignoreUnknownKeys = true }
private const val MAX_EXISTING_EXPERIENCES = 12
private const val MAX_TASK_TEXT = 4_000
