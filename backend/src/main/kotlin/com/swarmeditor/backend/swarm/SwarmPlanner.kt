package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmTask
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

data class SwarmPlanningRequest(
    val objective: String,
    val preferredPlannerAgentId: String? = null,
    val availableAgents: List<AgentConfig>,
    val experiences: List<SwarmExperience> = emptyList(),
    val repositoryEvidence: SwarmRepositoryEvidenceBundle? = null,
)

data class SwarmPlan(
    val tasks: List<SwarmTask>,
    val recommendedParallelism: Int,
    val failFast: Boolean,
    val maxTaskAttempts: Int,
)

fun interface SwarmPlanner {
    suspend fun plan(request: SwarmPlanningRequest): SwarmPlan
}

class PiSwarmPlanner(
    private val sessions: PiSessionProvider,
    private val isConfigCurrent: suspend (AgentConfig) -> Boolean = { true },
    private val maxAttempts: Int = 2,
) : SwarmPlanner {
    init {
        require(maxAttempts > 0) { "maxAttempts must be positive" }
    }

    override suspend fun plan(request: SwarmPlanningRequest): SwarmPlan {
        require(request.objective.isNotBlank()) { "Swarm objective cannot be blank" }
        require(request.availableAgents.isNotEmpty()) { "No connected Pi Agent Profile is available for swarm planning" }
        val baseConfig = selectPlannerConfig(request)
        val plannerConfig = buildSwarmTaskAgentConfig(baseConfig, SwarmAgentRole.PLANNER)
        val sessionId = "swarm-plan:${UUID.randomUUID().toString().take(12)}"
        val session = sessions.getOrCreateValidated(
            sessionId = sessionId,
            config = plannerConfig,
            remoteSessionId = null,
            isConfigCurrent = { isConfigCurrent(baseConfig) },
        )
        var terminalFailure: Throwable? = null
        try {
            var planningFailure: Throwable? = null
            var prompt = buildPlanningPrompt(request)
            repeat(maxAttempts) { attempt ->
                val response = session.prompt(prompt)
                try {
                    return parseSwarmPlan(response, request.availableAgents.mapTo(mutableSetOf(), AgentConfig::id))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    planningFailure = error
                    if (attempt + 1 < maxAttempts) {
                        prompt = buildRepairPrompt(error)
                    }
                }
            }
            throw checkNotNull(planningFailure) { "Swarm planner produced no result" }
        } catch (error: Throwable) {
            terminalFailure = error
            throw error
        } finally {
            try {
                withContext(NonCancellable) { sessions.close(sessionId) }
            } catch (closeError: Throwable) {
                val primary = terminalFailure
                if (primary != null) primary.addSuppressed(closeError) else throw closeError
            }
        }
    }

    private fun selectPlannerConfig(request: SwarmPlanningRequest): AgentConfig {
        request.preferredPlannerAgentId?.let { preferredId ->
            request.availableAgents.firstOrNull { it.id == preferredId }?.let { return it }
        }
        return request.availableAgents.firstOrNull { config ->
            config.tags.any { it.trim().equals("role:planner", ignoreCase = true) }
        } ?: request.availableAgents.first()
    }

    private fun buildPlanningPrompt(request: SwarmPlanningRequest): String = buildString {
        appendLine("Design an executable swarm task graph for the objective below.")
        appendLine("The graph will be executed by independent Pi subagents using structured concurrency.")
        appendLine()
        appendLine("Objective:")
        appendLine(request.objective.trim())
        appendLine()
        appendLine("Available Pi Agent Profiles:")
        request.availableAgents.forEach { agent ->
            appendLine("- ${agent.id}: ${agent.name}; tags=${agent.tags.joinToString(",")}")
        }
        if (request.experiences.isNotEmpty()) {
            appendLine()
            appendLine("Relevant project experience:")
            request.experiences.forEach { experience ->
                appendLine(
                    "- ${experience.id} [${experience.kind}/${experience.role ?: "ALL"}]: " +
                        "${experience.principle} (${experience.rationale})"
                )
                appendLine(
                    "  observed uses: success=${experience.successfulUses}, recovered=${experience.recoveredUses}, " +
                        "failure=${experience.failedUses}"
                )
            }
            appendLine("Usage counts are correlational, not causal attribution.")
            appendLine("Use these as evidence, not absolute rules; preserve explicit objective constraints.")
        }
        request.repositoryEvidence?.takeIf { it.evidence.isNotEmpty() }?.let { bundle ->
            appendLine()
            appendLine("Budgeted repository localization evidence:")
            bundle.evidence.forEach { item ->
                val location = buildString {
                    item.path?.let(::append)
                    item.line?.let { append(":$it") }
                }.ifBlank { "repository" }
                appendLine("- [${item.kind}] $location score=${"%.2f".format(item.score)}: ${item.summary}")
                item.excerpt?.takeIf(String::isNotBlank)?.let { excerpt ->
                    excerpt.lineSequence().forEach { line -> appendLine("  $line") }
                }
            }
            appendLine(
                "Evidence is bounded (${bundle.consumedCharacters}/${bundle.characterBudget} characters) and may be incomplete."
            )
            appendLine("Treat it as localization evidence, verify it before editing, and avoid redundant discovery tasks.")
        }
        appendLine()
        appendLine("Return JSON only, with this schema:")
        appendLine(
            """{"maxParallelism":3,"failFast":false,"maxTaskAttempts":2,"tasks":[{"id":"inspect","title":"Inspect","prompt":"Concrete task instructions and verification criteria","role":"PLANNER","agentId":null,"dependsOn":[],"readPaths":["backend/**"],"writePaths":[],"verificationCommands":[]}]}"""
        )
        appendLine("Rules:")
        appendLine("- Create between 1 and $MAX_PLANNED_TASKS tasks.")
        appendLine("- Use only roles: ${SwarmAgentRole.entries.joinToString { it.name }}.")
        appendLine("- Use short unique ids containing only letters, numbers, underscore, or hyphen.")
        appendLine("- Build the smallest acyclic dependency graph that preserves every real information or artifact dependency.")
        appendLine("- Identify the critical path explicitly through dependencies; avoid unnecessary serial chains.")
        appendLine("- Prefer high-information localization nodes early, then fan out independent implementation and fan in through review or integration.")
        appendLine("- Avoid redundant transitive edges: if A enables B and B enables C, make C depend on A only when C consumes A directly.")
        appendLine("- Treat each node as an auditable contract with inputs, action scope, deliverable, acceptance evidence, and stop conditions.")
        appendLine("- Use dynamic roles by task need; do not create agents or nodes merely to fill a fixed team template.")
        appendLine("- Start with repository evidence or localization tasks before implementation when scope is uncertain.")
        appendLine("- Parallel implementation tasks must have disjoint ownership boundaries or read-only scopes.")
        appendLine("- Declare repository-relative readPaths and writePaths for every task; use glob suffixes such as backend/** for directories.")
        appendLine("- Keep writePaths minimal and disjoint. Use an empty writePaths list for read-only work and ** only when broad ownership is unavoidable.")
        appendLine("- Declare verificationCommands as structured argv arrays, for example [[\"./gradlew\",\":backend:test\"]].")
        appendLine("- Code-changing tasks must include focused mechanical verification; read-only tasks may use an empty list.")
        appendLine("- Make integration and verification depend on every task whose output they validate.")
        appendLine("- Set maxTaskAttempts between 1 and $MAX_TASK_ATTEMPTS based on task uncertainty.")
        appendLine("- Assign agentId only when one listed profile is specifically suitable; otherwise use null.")
        appendLine("- Prompts must include concrete scope, available evidence, expected artifact, acceptance checks, and what uncertainty must be surfaced.")
        appendLine("- Include review and integration tasks when the objective changes code or data flow.")
        appendLine("- Do not ask downstream nodes to repeat upstream discovery; pass forward verified findings and artifact references.")
        appendLine("- If evidence cannot justify a code change, create a read-only decision node or allow a no-change conclusion.")
        appendLine("- Do not perform the work and do not wrap the JSON in Markdown.")
    }

    private fun buildRepairPrompt(error: Throwable): String = buildString {
        appendLine("The previous swarm plan was invalid: ${error.message ?: "unknown validation error"}")
        appendLine("Return a corrected JSON document only. Preserve the original objective and obey every schema rule.")
    }
}

@Serializable
private data class PlannerDocument(
    val maxParallelism: Int = 3,
    val failFast: Boolean = false,
    val maxTaskAttempts: Int = 2,
    val tasks: List<PlannerTask> = emptyList(),
)

@Serializable
private data class PlannerTask(
    val id: String,
    val title: String,
    val prompt: String,
    val role: String = SwarmAgentRole.GENERAL.name,
    val agentId: String? = null,
    val dependsOn: List<String> = emptyList(),
    val readPaths: List<String> = emptyList(),
    val writePaths: List<String> = emptyList(),
    val verificationCommands: List<List<String>> = emptyList(),
)

internal fun parseSwarmPlan(response: String, availableAgentIds: Set<String>): SwarmPlan {
    val document = plannerJson.decodeFromString<PlannerDocument>(extractJsonObject(response))
    require(document.tasks.size in 1..MAX_PLANNED_TASKS) {
        "Swarm plan must contain between 1 and $MAX_PLANNED_TASKS tasks"
    }
    val tasks = document.tasks.map { planned ->
        SwarmTask(
            id = planned.id.trim(),
            title = planned.title.trim(),
            prompt = planned.prompt.trim(),
            role = SwarmAgentRole.entries.firstOrNull { it.name.equals(planned.role.trim(), ignoreCase = true) }
                ?: error("Unsupported swarm role: ${planned.role}"),
            agentId = planned.agentId?.trim()?.takeIf(availableAgentIds::contains),
            dependsOn = planned.dependsOn.map(String::trim).distinct(),
            readPaths = planned.readPaths.map(::validateOwnershipScope).distinct(),
            writePaths = planned.writePaths.map(::validateOwnershipScope).distinct(),
            verificationCommands = planned.verificationCommands.map { command -> command.map(String::trim) },
        )
    }
    SwarmGraph.validate(tasks)
    return SwarmPlan(
        tasks = tasks,
        recommendedParallelism = document.maxParallelism.coerceIn(1, minOf(MAX_PARALLELISM, tasks.size)),
        failFast = document.failFast,
        maxTaskAttempts = document.maxTaskAttempts.coerceIn(1, MAX_TASK_ATTEMPTS),
    )
}

internal fun extractJsonObject(response: String): String {
    val trimmed = response.trim()
    val fenced = fencedJson.find(trimmed)?.groupValues?.get(1)?.trim()
    if (!fenced.isNullOrEmpty()) return fenced
    val start = trimmed.indexOf('{')
    val end = trimmed.lastIndexOf('}')
    require(start >= 0 && end > start) { "Swarm planner response does not contain a JSON object" }
    return trimmed.substring(start, end + 1)
}

private const val MAX_PLANNED_TASKS = 12
private const val MAX_PARALLELISM = 6
private const val MAX_TASK_ATTEMPTS = 3
private val plannerJson = Json { ignoreUnknownKeys = true }
private val fencedJson = Regex("""```(?:json)?\s*([\s\S]*?)```""", RegexOption.IGNORE_CASE)
