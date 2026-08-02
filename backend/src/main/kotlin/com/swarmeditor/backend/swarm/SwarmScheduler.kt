package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmSchedulingCandidate
import com.swarmeditor.common.model.SwarmSchedulingCandidateDisposition
import com.swarmeditor.common.model.SwarmSchedulingDecision
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskAttemptRecord
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.TokenUsage
import io.github.oshai.kotlinlogging.KotlinLogging
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

private val schedulerLog = KotlinLogging.logger {}

class SwarmScheduler(
    private val store: SwarmStore,
    private val executor: SwarmTaskExecutor,
    private val scope: CoroutineScope,
    private val schedulingPolicy: SwarmSchedulingPolicy = CriticalPathSwarmSchedulingPolicy(),
    private val learner: SwarmRunLearner = SwarmRunLearner {},
    private val now: () -> Instant = { Clock.System.now() },
) {
    private val jobs = ConcurrentHashMap<String, Job>()
    private val pendingCancellationMarks = ConcurrentHashMap.newKeySet<String>()
    private val schedulingMutex = Mutex()
    private var acceptingRuns = true

    suspend fun start(runId: String) = schedulingMutex.withLock {
        check(acceptingRuns) { "Swarm scheduler is shut down" }
        check(jobs[runId]?.isActive != true) { "Swarm run is already scheduled" }
        val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
        check(run.status == SwarmRunStatus.CREATED) {
            "Swarm run must be prepared before starting: ${run.status}"
        }
        SwarmGraph.validate(run.tasks)
        val job = scope.launch(start = CoroutineStart.LAZY) { executeRun(runId) }
        jobs[runId] = job
        job.invokeOnCompletion { jobs.remove(runId, job) }
        job.start()
    }

    suspend fun await(runId: String) {
        jobs[runId]?.join()
    }

    suspend fun cancel(runId: String) {
        val job = schedulingMutex.withLock { jobs.remove(runId) }
        pendingCancellationMarks += runId
        withContext(NonCancellable) {
            job?.cancel()
            job?.join()
            markCanceledAndForget(runId)
        }
    }

    suspend fun cancelAll() {
        val scheduled = schedulingMutex.withLock {
            jobs.toMap().also { jobs.clear() }
        }
        pendingCancellationMarks += scheduled.keys
        val runIds = (scheduled.keys + pendingCancellationMarks.toList()).distinct()
        val failures = withContext(NonCancellable) {
            scheduled.values.forEach(Job::cancel)
            scheduled.values.joinAll()
            buildList {
                runIds.forEach { runId ->
                    try {
                        markCanceledAndForget(runId)
                    } catch (error: Throwable) {
                        add(error)
                    }
                }
            }
        }
        failures.firstOrNull()?.let { firstFailure ->
            failures.drop(1).forEach(firstFailure::addSuppressed)
            throw firstFailure
        }
    }

    suspend fun shutdown() {
        schedulingMutex.withLock { acceptingRuns = false }
        cancelAll()
    }

    private suspend fun executeRun(runId: String) {
        try {
            store.update(runId) { run ->
                val startedAt = now()
                run.copy(
                    status = SwarmRunStatus.RUNNING,
                    updatedAt = startedAt,
                    tasks = run.tasks.map { task ->
                        if (task.status == SwarmTaskStatus.RUNNING) {
                            task.copy(
                                status = SwarmTaskStatus.PENDING,
                                attemptRecords = task.attemptRecords.completeLatestAttempt(
                                    completedAt = startedAt,
                                    outcome = SwarmTaskAttemptOutcome.FAILED,
                                    errorCategory = "RecoveredBeforeScheduling",
                                ),
                                startedAt = null,
                            )
                        } else {
                            task
                        }
                    },
                )
            }
            runTasks(runId)
            learnFromRun(finishRun(runId))
        } catch (error: CancellationException) {
            pendingCancellationMarks += runId
            withContext(NonCancellable) { markCanceledAndForget(runId) }
            throw error
        } catch (error: Throwable) {
            store.update(runId) { run ->
                val completedAt = now()
                run.copy(
                    status = SwarmRunStatus.FAILED,
                    updatedAt = completedAt,
                    tasks = run.tasks.map { task ->
                        if (task.status == SwarmTaskStatus.RUNNING) {
                            task.copy(
                                status = SwarmTaskStatus.FAILED,
                                errorMessage = error.message ?: "Swarm scheduler failed",
                                attemptRecords = task.attemptRecords.completeLatestAttempt(
                                    completedAt = completedAt,
                                    outcome = SwarmTaskAttemptOutcome.FAILED,
                                    errorCategory = error::class.simpleName ?: "Throwable",
                                ),
                                completedAt = completedAt,
                            )
                        } else {
                            task
                        }
                    },
                )
            }
        }
    }

    private suspend fun runTasks(runId: String) = coroutineScope {
        val outcomes = Channel<TaskOutcome>(Channel.UNLIMITED)
        val active = mutableMapOf<String, Job>()
        while (true) {
            var run = store.get(runId) ?: return@coroutineScope
            run = blockDependents(run)
            if (run.policy.failFast && run.tasks.any { it.status == SwarmTaskStatus.FAILED }) {
                active.values.forEach(Job::cancel)
                active.values.joinAll()
                store.update(runId) { current ->
                    val completedAt = now()
                    current.copy(
                        updatedAt = completedAt,
                        tasks = current.tasks.map { task ->
                            if (task.status == SwarmTaskStatus.PENDING) {
                                task.copy(
                                    status = SwarmTaskStatus.BLOCKED,
                                    errorMessage = "Blocked by fail-fast policy",
                                    completedAt = completedAt,
                                )
                            } else if (task.status == SwarmTaskStatus.RUNNING) {
                                task.copy(
                                    status = SwarmTaskStatus.CANCELED,
                                    errorMessage = "Canceled by fail-fast policy",
                                    attemptRecords = task.attemptRecords.completeLatestAttempt(
                                        completedAt = completedAt,
                                        outcome = SwarmTaskAttemptOutcome.CANCELED,
                                        errorCategory = "FailFastPolicy",
                                    ),
                                    completedAt = completedAt,
                                )
                            } else {
                                task
                            }
                        },
                    )
                }
                break
            }

            val capacity = run.policy.maxParallelism.coerceAtLeast(1) - active.size
            val readyCandidates = run.tasks.filter { task ->
                task.status == SwarmTaskStatus.PENDING &&
                    task.dependsOn.all { dependencyId ->
                        run.tasks.first { it.id == dependencyId }.status == SwarmTaskStatus.SUCCEEDED
                    }
            }
            val schedulingSelection = schedulingPolicy.select(
                run = run,
                readyCandidates = readyCandidates,
                activeTaskIds = active.keys,
                capacity = capacity,
            )
            val ready = schedulingSelection.rankedCandidates.filter { it.id in schedulingSelection.selectedTaskIds }

            if (ready.isNotEmpty()) {
                val runningRun = markRunning(
                    runId = runId,
                    selection = schedulingSelection,
                    activeTaskIds = active.keys,
                    availableCapacity = capacity,
                )
                ready.forEach { task ->
                    val runningTask = runningRun.tasks.first { it.id == task.id }
                    active[task.id] = launch {
                        val timeoutSeconds = runningRun.policy.taskTimeoutSeconds.coerceAtLeast(1)
                        val outcome = try {
                            val execution = withTimeout(timeoutSeconds * 1_000L) {
                                executor.execute(runningRun, runningTask)
                            }
                            TaskOutcome.Succeeded(task.id, execution)
                        } catch (error: SwarmTaskTimedOutException) {
                            TaskOutcome.Failed(
                                taskId = task.id,
                                message = "Task timed out after $timeoutSeconds seconds",
                                tokenUsage = error.tokenUsage,
                                experienceIds = error.experienceIds,
                                experienceRoutingDecisions = error.experienceRoutingDecisions,
                                resolvedAgentId = error.resolvedAgentId,
                                toolBrokerSessionIds = error.toolBrokerSessionIds,
                                toolAuditIds = error.toolAuditIds,
                                changedFileCount = error.changedFileCount,
                                verificationStatus = error.verificationStatus,
                                workspaceDeltaEvidenceId = error.workspaceDeltaEvidenceId,
                                verificationEvidenceId = error.verificationEvidenceId,
                                outcome = SwarmTaskAttemptOutcome.TIMED_OUT,
                                errorCategory = error::class.simpleName ?: "SwarmTaskTimedOutException",
                            )
                        } catch (_: TimeoutCancellationException) {
                            TaskOutcome.Failed(
                                taskId = task.id,
                                message = "Task timed out after $timeoutSeconds seconds",
                                tokenUsage = com.swarmeditor.common.model.TokenUsage(),
                                experienceIds = emptyList(),
                                experienceRoutingDecisions = emptyList(),
                                resolvedAgentId = null,
                                toolBrokerSessionIds = emptyList(),
                                toolAuditIds = emptyList(),
                                changedFileCount = null,
                                verificationStatus = SwarmVerificationStatus.NOT_RECORDED,
                                outcome = SwarmTaskAttemptOutcome.TIMED_OUT,
                                errorCategory = "TimeoutCancellationException",
                            )
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Throwable) {
                            TaskOutcome.Failed(
                                taskId = task.id,
                                message = error.message ?: "Swarm task failed",
                                tokenUsage = (error as? SwarmTaskExecutionException)?.tokenUsage
                                    ?: com.swarmeditor.common.model.TokenUsage(),
                                experienceIds = (error as? SwarmTaskExecutionException)?.experienceIds.orEmpty(),
                                experienceRoutingDecisions =
                                    (error as? SwarmTaskExecutionException)?.experienceRoutingDecisions.orEmpty(),
                                resolvedAgentId = (error as? SwarmTaskExecutionException)?.resolvedAgentId,
                                toolBrokerSessionIds =
                                    (error as? SwarmTaskExecutionException)?.toolBrokerSessionIds.orEmpty(),
                                toolAuditIds = (error as? SwarmTaskExecutionException)?.toolAuditIds.orEmpty(),
                                changedFileCount = (error as? SwarmTaskExecutionException)?.changedFileCount,
                                verificationStatus = (error as? SwarmTaskExecutionException)?.verificationStatus
                                    ?: SwarmVerificationStatus.NOT_RECORDED,
                                workspaceDeltaEvidenceId =
                                    (error as? SwarmTaskExecutionException)?.workspaceDeltaEvidenceId,
                                verificationEvidenceId =
                                    (error as? SwarmTaskExecutionException)?.verificationEvidenceId,
                                outcome = SwarmTaskAttemptOutcome.FAILED,
                                errorCategory = error.cause?.let { cause -> cause::class.simpleName }
                                    ?: error::class.simpleName
                                    ?: "Throwable",
                                retryable = error !is SwarmDependencyArtifactConflictException,
                            )
                        }
                        outcomes.send(outcome)
                    }
                }
            }

            run = store.get(runId) ?: return@coroutineScope
            if (active.isEmpty()) {
                if (run.tasks.all { it.status.isTerminal }) break
                error("Swarm scheduler reached an unresolved task graph")
            }

            val outcome = outcomes.receive()
            when (outcome) {
                is TaskOutcome.Succeeded -> completeTask(runId, outcome.taskId, outcome.execution, null)
                is TaskOutcome.Failed -> recordFailure(runId, outcome)
            }
            active.remove(outcome.taskId)?.join()
        }
        outcomes.close()
    }

    private suspend fun blockDependents(run: SwarmRun): SwarmRun {
        val statusById = run.tasks.associate { it.id to it.status }.toMutableMap()
        val blockedIds = mutableSetOf<String>()
        var changed: Boolean
        do {
            changed = false
            run.tasks.forEach { task ->
                if (statusById.getValue(task.id) == SwarmTaskStatus.PENDING &&
                    task.dependsOn.any { dependencyId ->
                        statusById.getValue(dependencyId) in setOf(
                            SwarmTaskStatus.FAILED,
                            SwarmTaskStatus.BLOCKED,
                            SwarmTaskStatus.CANCELED,
                        )
                    }
                ) {
                    statusById[task.id] = SwarmTaskStatus.BLOCKED
                    blockedIds += task.id
                    changed = true
                }
            }
        } while (changed)
        if (blockedIds.isEmpty()) return run
        return store.update(run.id) { current ->
            current.copy(
                updatedAt = now(),
                tasks = current.tasks.map { task ->
                    if (task.id in blockedIds) {
                        task.copy(
                            status = SwarmTaskStatus.BLOCKED,
                            errorMessage = "Blocked by failed dependency",
                            completedAt = now(),
                        )
                    } else {
                        task
                    }
                },
            )
        }
    }

    private suspend fun markRunning(
        runId: String,
        selection: SwarmSchedulingSelection,
        activeTaskIds: Set<String>,
        availableCapacity: Int,
    ): SwarmRun = store.update(runId) { run ->
        val decisionSequence = run.schedulingDecisions.size + 1
        val decisionId = "schedule-${decisionSequence.toString().padStart(4, '0')}"
        val startedAt = now()
        val taskOrder = run.tasks.mapIndexed { index, task -> task.id to index }.toMap()
        val decision = SwarmSchedulingDecision(
            id = decisionId,
            sequence = decisionSequence,
            policyId = schedulingPolicy.id,
            stateFingerprint = schedulingStateFingerprint(run, activeTaskIds, availableCapacity, schedulingPolicy.id),
            createdAt = startedAt,
            availableCapacity = availableCapacity,
            activeTaskIds = activeTaskIds.sorted(),
            candidates = selection.rankedCandidates.map { task ->
                val selected = task.id in selection.selectedTaskIds
                val score = selection.scores.getValue(task.id)
                SwarmSchedulingCandidate(
                    taskId = task.id,
                    taskOrder = taskOrder.getValue(task.id),
                    nextAttempt = task.attempt + 1,
                    requestedAgentId = task.agentId,
                    disposition = when {
                        selected -> SwarmSchedulingCandidateDisposition.SELECTED
                        task.id in selection.deferredOwnershipReasons ->
                            SwarmSchedulingCandidateDisposition.DEFERRED_OWNERSHIP_CONFLICT
                        else -> SwarmSchedulingCandidateDisposition.DEFERRED_CAPACITY
                    },
                    reason = if (selected) {
                        score.explanation("Selected by critical-path dynamic programming")
                    } else {
                        selection.deferredOwnershipReasons[task.id]
                            ?: score.explanation("Deferred because the critical-path rank exceeded available capacity")
                    },
                    estimatedUtility = score.utility,
                )
            },
        )
        run.copy(
            updatedAt = startedAt,
            schedulingDecisions = run.schedulingDecisions + decision,
            tasks = run.tasks.map { task ->
                if (task.id in selection.selectedTaskIds) {
                    val attempt = task.attempt + 1
                    task.copy(
                        status = SwarmTaskStatus.RUNNING,
                        errorMessage = null,
                        output = "",
                        attempt = attempt,
                        attemptRecords = task.attemptRecords + SwarmTaskAttemptRecord(
                            id = "${task.id}-attempt-${task.attemptRecords.size + 1}",
                            schedulingDecisionId = decisionId,
                            attempt = attempt,
                            requestedAgentId = task.agentId,
                            startedAt = startedAt,
                        ),
                        startedAt = startedAt,
                        completedAt = null,
                    )
                } else {
                    task
                }
            },
        )
    }

    private suspend fun completeTask(
        runId: String,
        taskId: String,
        execution: SwarmTaskExecution,
        error: String?,
    ) {
        store.update(runId) { run ->
            val completedAt = now()
            run.copy(
                updatedAt = completedAt,
                tasks = run.tasks.map { task ->
                    if (task.id == taskId) {
                        task.copy(
                            status = if (error == null) SwarmTaskStatus.SUCCEEDED else SwarmTaskStatus.FAILED,
                            output = execution.output,
                            tokenUsage = task.tokenUsage + execution.tokenUsage,
                            experienceIds = (task.experienceIds + execution.experienceIds).distinct(),
                            experienceRoutingDecisions = mergeRoutingDecisions(
                                task.experienceRoutingDecisions,
                                execution.experienceRoutingDecisions,
                            ),
                            toolBrokerSessionIds =
                                (task.toolBrokerSessionIds + execution.toolBrokerSessionIds).distinct(),
                            toolAuditIds = (task.toolAuditIds + execution.toolAuditIds).distinct(),
                            attemptRecords = task.attemptRecords.completeLatestAttempt(
                                completedAt = completedAt,
                                outcome = if (error == null) {
                                    SwarmTaskAttemptOutcome.SUCCEEDED
                                } else {
                                    SwarmTaskAttemptOutcome.FAILED
                                },
                                tokenUsage = execution.tokenUsage,
                                resolvedAgentId = execution.resolvedAgentId,
                                toolBrokerSessionIds = execution.toolBrokerSessionIds,
                                toolAuditIds = execution.toolAuditIds,
                                changedFileCount = execution.changedFileCount,
                                verificationStatus = execution.verificationStatus,
                                workspaceDeltaEvidenceId = execution.workspaceDeltaEvidenceId,
                                verificationEvidenceId = execution.verificationEvidenceId,
                                errorCategory = error?.let { "TaskExecutionError" },
                            ),
                            errorMessage = error,
                            completedAt = completedAt,
                        )
                    } else {
                        task
                    }
                },
            )
        }
    }

    private suspend fun recordFailure(runId: String, outcome: TaskOutcome.Failed) {
        store.update(runId) { run ->
            val completedAt = now()
            run.copy(
                updatedAt = completedAt,
                tasks = run.tasks.map { task ->
                    if (task.id != outcome.taskId) return@map task
                    val exhausted = !outcome.retryable || task.attempt >= run.policy.maxTaskAttempts
                    task.copy(
                        status = if (exhausted) SwarmTaskStatus.FAILED else SwarmTaskStatus.PENDING,
                        output = "",
                        tokenUsage = task.tokenUsage + outcome.tokenUsage,
                        experienceIds = (task.experienceIds + outcome.experienceIds).distinct(),
                        experienceRoutingDecisions = mergeRoutingDecisions(
                            task.experienceRoutingDecisions,
                            outcome.experienceRoutingDecisions,
                        ),
                        toolBrokerSessionIds =
                            (task.toolBrokerSessionIds + outcome.toolBrokerSessionIds).distinct(),
                        toolAuditIds = (task.toolAuditIds + outcome.toolAuditIds).distinct(),
                        attemptRecords = task.attemptRecords.completeLatestAttempt(
                            completedAt = completedAt,
                            outcome = outcome.outcome,
                            tokenUsage = outcome.tokenUsage,
                            resolvedAgentId = outcome.resolvedAgentId,
                            toolBrokerSessionIds = outcome.toolBrokerSessionIds,
                            toolAuditIds = outcome.toolAuditIds,
                            changedFileCount = outcome.changedFileCount,
                            verificationStatus = outcome.verificationStatus,
                            workspaceDeltaEvidenceId = outcome.workspaceDeltaEvidenceId,
                            verificationEvidenceId = outcome.verificationEvidenceId,
                            errorCategory = outcome.errorCategory,
                        ),
                        errorMessage = outcome.message.takeIf { exhausted },
                        failureHistory = task.failureHistory + "Attempt ${task.attempt}: ${outcome.message}",
                        startedAt = null,
                        completedAt = completedAt.takeIf { exhausted },
                    )
                },
            )
        }
    }

    private suspend fun finishRun(runId: String): SwarmRun = store.update(runId) { run ->
            val status = when {
                run.tasks.all { it.status == SwarmTaskStatus.SUCCEEDED } -> SwarmRunStatus.SUCCEEDED
                run.tasks.any {
                    it.status == SwarmTaskStatus.FAILED || it.status == SwarmTaskStatus.BLOCKED
                } -> SwarmRunStatus.FAILED
                run.tasks.any { it.status == SwarmTaskStatus.CANCELED } -> SwarmRunStatus.CANCELED
                else -> SwarmRunStatus.FAILED
            }
            run.copy(status = status, updatedAt = now())
        }

    private suspend fun learnFromRun(run: SwarmRun) {
        try {
            learner.learn(run)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            schedulerLog.warn { "Failed to learn from swarm run ${run.id}: ${error.message}" }
        }
    }

    private suspend fun markCanceled(runId: String) {
        val run = store.get(runId) ?: return
        if (run.status != SwarmRunStatus.CREATED && run.status != SwarmRunStatus.RUNNING) return
        store.update(runId) { current ->
            val completedAt = now()
            current.copy(
                status = SwarmRunStatus.CANCELED,
                updatedAt = completedAt,
                tasks = current.tasks.map { task ->
                    if (task.status == SwarmTaskStatus.PENDING || task.status == SwarmTaskStatus.RUNNING) {
                        task.copy(
                            status = SwarmTaskStatus.CANCELED,
                            errorMessage = "Swarm run canceled",
                            attemptRecords = if (task.status == SwarmTaskStatus.RUNNING) {
                                task.attemptRecords.completeLatestAttempt(
                                    completedAt = completedAt,
                                    outcome = SwarmTaskAttemptOutcome.CANCELED,
                                    errorCategory = "RunCancellation",
                                )
                            } else {
                                task.attemptRecords
                            },
                            completedAt = completedAt,
                        )
                    } else {
                        task
                    }
                },
            )
        }
    }

    private suspend fun markCanceledAndForget(runId: String) {
        markCanceled(runId)
        pendingCancellationMarks -= runId
    }
}

private val SwarmTaskStatus.isTerminal: Boolean
    get() = this in setOf(
        SwarmTaskStatus.SUCCEEDED,
        SwarmTaskStatus.FAILED,
        SwarmTaskStatus.BLOCKED,
        SwarmTaskStatus.CANCELED,
    )

private fun schedulingStateFingerprint(
    run: SwarmRun,
    activeTaskIds: Set<String>,
    availableCapacity: Int,
    policyId: String,
): String {
    val canonicalState = buildString {
        append(policyId)
        append('|').append(run.policy.maxParallelism)
        append('|').append(run.policy.failFast)
        append('|').append(run.policy.taskTimeoutSeconds)
        append('|').append(run.policy.maxTaskAttempts)
        append('|').append(availableCapacity)
        append('|').append(activeTaskIds.sorted().joinToString(","))
        run.tasks.forEachIndexed { index, task ->
            append('|').append(index)
            append(':').append(task.id)
            append(':').append(task.status)
            append(':').append(task.attempt)
            append(':').append(task.agentId.orEmpty())
            append(':').append(task.dependsOn.joinToString(","))
            append(':').append(task.readPaths.joinToString(","))
            append(':').append(task.writePaths.joinToString(","))
        }
    }
    return MessageDigest.getInstance("SHA-256")
        .digest(canonicalState.encodeToByteArray())
        .joinToString("") { byte -> "%02x".format(byte) }
}

private fun SwarmSchedulingScore.explanation(prefix: String): String =
    "$prefix; utility=${String.format(java.util.Locale.ROOT, "%.3f", utility)}, " +
        "criticalPath=${String.format(java.util.Locale.ROOT, "%.3f", remainingCriticalPath)}, " +
        "directUnlocks=$directUnlocks, downstreamReach=$downstreamReach, " +
        "bridgeCentrality=${String.format(java.util.Locale.ROOT, "%.3f", bridgeCentrality)}, " +
        "retries=$retryCount, " +
        "activeAgentPenalty=${String.format(java.util.Locale.ROOT, "%.2f", activeAgentPenalty)}"

private fun List<SwarmTaskAttemptRecord>.completeLatestAttempt(
    completedAt: Instant,
    outcome: SwarmTaskAttemptOutcome,
    tokenUsage: TokenUsage = TokenUsage(),
    resolvedAgentId: String? = null,
    toolBrokerSessionIds: List<String> = emptyList(),
    toolAuditIds: List<String> = emptyList(),
    changedFileCount: Int? = null,
    verificationStatus: SwarmVerificationStatus = SwarmVerificationStatus.NOT_RECORDED,
    workspaceDeltaEvidenceId: String? = null,
    verificationEvidenceId: String? = null,
    errorCategory: String? = null,
): List<SwarmTaskAttemptRecord> {
    val activeIndex = indexOfLast { record -> record.outcome == SwarmTaskAttemptOutcome.RUNNING }
    if (activeIndex < 0) return this
    val active = get(activeIndex)
    val completed = active.copy(
        resolvedAgentId = resolvedAgentId ?: active.resolvedAgentId,
        outcome = outcome,
        completedAt = completedAt,
        durationMillis = (completedAt.toEpochMilliseconds() - active.startedAt.toEpochMilliseconds()).coerceAtLeast(0),
        tokenUsage = tokenUsage,
        toolBrokerSessionIds = toolBrokerSessionIds.distinct(),
        toolAuditIds = toolAuditIds.distinct(),
        changedFileCount = changedFileCount,
        verificationStatus = verificationStatus,
        workspaceDeltaEvidenceId = workspaceDeltaEvidenceId,
        verificationEvidenceId = verificationEvidenceId,
        errorCategory = errorCategory,
    )
    return mapIndexed { index, record -> if (index == activeIndex) completed else record }
}

private sealed interface TaskOutcome {
    val taskId: String

    data class Succeeded(override val taskId: String, val execution: SwarmTaskExecution) : TaskOutcome
    data class Failed(
        override val taskId: String,
        val message: String,
        val tokenUsage: com.swarmeditor.common.model.TokenUsage,
        val experienceIds: List<String>,
        val experienceRoutingDecisions: List<com.swarmeditor.common.model.SwarmExperienceRoutingDecision>,
        val resolvedAgentId: String?,
        val toolBrokerSessionIds: List<String>,
        val toolAuditIds: List<String>,
        val changedFileCount: Int?,
        val verificationStatus: SwarmVerificationStatus,
        val outcome: SwarmTaskAttemptOutcome,
        val errorCategory: String,
        val workspaceDeltaEvidenceId: String? = null,
        val verificationEvidenceId: String? = null,
        val retryable: Boolean = true,
    ) : TaskOutcome
}

private fun mergeRoutingDecisions(
    current: List<com.swarmeditor.common.model.SwarmExperienceRoutingDecision>,
    additions: List<com.swarmeditor.common.model.SwarmExperienceRoutingDecision>,
): List<com.swarmeditor.common.model.SwarmExperienceRoutingDecision> = (current + additions).distinctBy { decision ->
    "${decision.attempt}:${decision.experienceId}:${decision.status}:${decision.queryFingerprint}"
}
