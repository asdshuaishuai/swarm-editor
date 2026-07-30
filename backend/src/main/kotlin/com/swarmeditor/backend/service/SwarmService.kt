package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.swarm.SwarmGraph
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.backend.swarm.SwarmExperienceSelector
import com.swarmeditor.backend.swarm.SwarmScheduler
import com.swarmeditor.backend.swarm.SwarmPlanner
import com.swarmeditor.backend.swarm.SwarmPlanningRequest
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshot
import com.swarmeditor.backend.swarm.SwarmStore
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.TokenUsage
import java.util.UUID
import kotlin.time.Clock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class SwarmService(
    private val store: SwarmStore,
    private val scheduler: SwarmScheduler,
    private val agentService: AgentService,
    private val planner: SwarmPlanner = SwarmPlanner { error("No swarm planner configured") },
    private val experienceStore: SwarmExperienceStore? = null,
    private val experienceSelector: SwarmExperienceSelector? = null,
    private val repositorySnapshotProvider: suspend () -> SwarmRepositorySnapshot? = { null },
    private val dynamicAgentLimitProvider: suspend () -> Int = { AgentRegistry.defaultConfig().maxDynamicSubagents },
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) {
    val runs: StateFlow<List<SwarmRun>> = store.runs
    private val retryMutex = Mutex()

    suspend fun init() = store.load()

    suspend fun createRun(
        title: String,
        objective: String,
        tasks: List<SwarmTask>,
        policy: SwarmExecutionPolicy = SwarmExecutionPolicy(),
        planningExperienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
    ): Result<SwarmRun> = resultOf {
        require(title.isNotBlank()) { "Swarm run title cannot be blank" }
        require(objective.isNotBlank()) { "Swarm objective cannot be blank" }
        require(policy.maxParallelism > 0) { "maxParallelism must be positive" }
        require(policy.taskTimeoutSeconds > 0) { "taskTimeoutSeconds must be positive" }
        require(policy.maxTaskAttempts in 1..3) { "maxTaskAttempts must be between 1 and 3" }
        val dynamicAgentLimit = dynamicAgentLimitProvider().coerceAtLeast(1)
        val effectivePolicy = policy.copy(maxParallelism = minOf(policy.maxParallelism, dynamicAgentLimit))
        require(tasks.all { task ->
            task.status == SwarmTaskStatus.PENDING &&
                task.output.isBlank() &&
                task.errorMessage == null &&
                task.tokenUsage == TokenUsage() &&
                task.attempt == 0 &&
                task.failureHistory.isEmpty() &&
                task.experienceIds.isEmpty() &&
                task.experienceRoutingDecisions.isEmpty() &&
                task.startedAt == null &&
                task.completedAt == null
        }) { "New swarm tasks must use a clean pending state" }
        SwarmGraph.validate(tasks)
        val timestamp = now()
        val repositoryBaseline = repositorySnapshotProvider()?.toBaseline(timestamp)
        store.put(
            SwarmRun(
                id = "run-${UUID.randomUUID().toString().take(12)}",
                title = title.trim(),
                objective = objective.trim(),
                createdAt = timestamp,
                updatedAt = timestamp,
                policy = effectivePolicy,
                repositoryBaseline = repositoryBaseline,
                tasks = tasks,
                planningExperienceRoutingDecisions = planningExperienceRoutingDecisions,
            )
        )
    }

    suspend fun start(runId: String): Result<Unit> = resultOf { scheduler.start(runId) }

    suspend fun createPlannedRun(
        title: String,
        objective: String,
        preferredPlannerAgentId: String? = null,
        policy: SwarmExecutionPolicy? = null,
    ): Result<SwarmRun> = resultOf {
        require(title.isNotBlank()) { "Swarm run title cannot be blank" }
        require(objective.isNotBlank()) { "Swarm objective cannot be blank" }
        val availableAgents = agentService.getLaunchableConfigs()
        val selection = experienceSelector?.select(objective, SwarmAgentRole.PLANNER, 8)
        val experiences = selection?.selected ?: experienceStore?.findRelevant(
                query = objective,
                role = SwarmAgentRole.PLANNER,
                limit = 8,
            ).orEmpty()
        val plan = planner.plan(
            SwarmPlanningRequest(
                objective = objective.trim(),
                preferredPlannerAgentId = preferredPlannerAgentId,
                availableAgents = availableAgents,
                experiences = experiences,
            )
        )
        val executionPolicy = policy ?: SwarmExecutionPolicy(
            maxParallelism = plan.recommendedParallelism,
            failFast = plan.failFast,
            maxTaskAttempts = plan.maxTaskAttempts,
        )
        createRun(
            title = title,
            objective = objective,
            tasks = plan.tasks,
            policy = executionPolicy,
            planningExperienceRoutingDecisions = selection?.decisions.orEmpty(),
        ).getOrThrow()
    }

    suspend fun await(runId: String) = scheduler.await(runId)

    suspend fun cancel(runId: String): Result<Unit> = resultOf { scheduler.cancel(runId) }

    suspend fun retry(runId: String): Result<Unit> = resultOf {
        scheduler.await(runId)
        retryMutex.withLock {
            val original = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            check(original.status == SwarmRunStatus.FAILED) { "Only failed swarm runs can be retried" }
            val resetIds = original.tasks
                .filter { it.status != SwarmTaskStatus.SUCCEEDED }
                .map(SwarmTask::id)
                .toSet()
            require(resetIds.isNotEmpty()) { "Swarm run has no incomplete tasks to retry" }
            store.update(runId) { current ->
                current.copy(
                    status = SwarmRunStatus.CREATED,
                    updatedAt = now(),
                    tasks = current.tasks.map { task ->
                        if (task.id in resetIds) {
                            task.copy(
                                status = SwarmTaskStatus.PENDING,
                                output = "",
                                errorMessage = null,
                                attempt = 0,
                                startedAt = null,
                                completedAt = null,
                            )
                        } else {
                            task
                        }
                    },
                )
            }
            try {
                scheduler.start(runId)
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        store.put(original)
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
        }
    }

    suspend fun resolveAgent(task: SwarmTask): AgentConfig {
        return agentService.createDynamicAgent(task)
    }
}

private fun SwarmRepositorySnapshot.toBaseline(capturedAt: kotlin.time.Instant) = SwarmRepositoryBaseline(
    revision = revision,
    baseRevision = baseRevision,
    treeHash = treeHash,
    dirty = dirty,
    pinnedReference = pinnedReference,
    capturedAt = capturedAt,
)

private suspend fun <T> resultOf(action: suspend () -> T): Result<T> {
    return try {
        Result.success(action())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}
