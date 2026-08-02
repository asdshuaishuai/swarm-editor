package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmOwnershipViolation
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmSchedulingCandidateDisposition
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.TokenUsage
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest

class SwarmSchedulerTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `runs ready tasks in parallel and waits for dependencies`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-order")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val active = AtomicInteger()
            val maximumActive = AtomicInteger()
            val readyStarted = AtomicInteger()
            val allReadyStarted = CompletableDeferred<Unit>()
            val releaseReady = CompletableDeferred<Unit>()
            val events = mutableListOf<String>()
            val executor = SwarmTaskExecutor { _, task ->
                val running = active.incrementAndGet()
                maximumActive.updateAndGet { maxOf(it, running) }
                synchronized(events) { events += "start:${task.id}" }
                if (task.id != "integrate") {
                    if (readyStarted.incrementAndGet() == 2) allReadyStarted.complete(Unit)
                    allReadyStarted.await()
                    releaseReady.await()
                }
                synchronized(events) { events += "end:${task.id}" }
                active.decrementAndGet()
                SwarmTaskExecution("result:${task.id}")
            }
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxParallelism = 2),
                    tasks = listOf(
                        task("plan"),
                        task("research"),
                        task("integrate", dependsOn = listOf("plan", "research")),
                    ),
                )
            )
            val scheduler = SwarmScheduler(store, executor, backgroundScope)

            scheduler.start("run-test")
            allReadyStarted.await()
            assertEquals(2, maximumActive.get())
            releaseReady.complete(Unit)
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            assertEquals(SwarmRunStatus.SUCCEEDED, completed.status)
            assertTrue(events.indexOf("start:integrate") > events.indexOf("end:plan"))
            assertTrue(events.indexOf("start:integrate") > events.indexOf("end:research"))
            assertTrue(completed.tasks.all { it.status == SwarmTaskStatus.SUCCEEDED })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists every ready candidate and capacity decision`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-decisions")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val started = AtomicInteger()
            val firstWaveStarted = CompletableDeferred<Unit>()
            val releaseFirstWave = CompletableDeferred<Unit>()
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxParallelism = 2),
                    tasks = listOf(task("first"), task("second"), task("deferred")),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    if (task.id != "deferred") {
                        if (started.incrementAndGet() == 2) firstWaveStarted.complete(Unit)
                        firstWaveStarted.await()
                        releaseFirstWave.await()
                    }
                    SwarmTaskExecution("done:${task.id}", resolvedAgentId = "agent-${task.id}")
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            firstWaveStarted.await()

            val running = store.get("run-test")!!
            val firstDecision = running.schedulingDecisions.single()
            assertEquals("critical-path-graph-leverage-ownership-v3", firstDecision.policyId)
            assertEquals(2, firstDecision.availableCapacity)
            assertTrue(firstDecision.stateFingerprint.matches(Regex("[0-9a-f]{64}")))
            assertEquals(listOf("first", "second", "deferred"), firstDecision.candidates.map { it.taskId })
            assertEquals(
                listOf(
                    SwarmSchedulingCandidateDisposition.SELECTED,
                    SwarmSchedulingCandidateDisposition.SELECTED,
                    SwarmSchedulingCandidateDisposition.DEFERRED_CAPACITY,
                ),
                firstDecision.candidates.map { it.disposition },
            )
            assertTrue(firstDecision.candidates.last().reason.contains("capacity"))
            assertTrue(firstDecision.candidates.all { it.estimatedUtility != null })
            assertEquals(
                listOf("schedule-0001", "schedule-0001"),
                running.tasks.take(2).map { it.attemptRecords.single().schedulingDecisionId },
            )

            releaseFirstWave.complete(Unit)
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            assertEquals(2, completed.schedulingDecisions.size)
            assertEquals("deferred", completed.schedulingDecisions.last().candidates.single().taskId)
            assertTrue(completed.tasks.all { task ->
                task.attemptRecords.single().outcome == SwarmTaskAttemptOutcome.SUCCEEDED
            })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `ownership conflicts are serialized and persisted as scheduling evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-ownership")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val active = AtomicInteger()
            val maximumActive = AtomicInteger()
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxParallelism = 2),
                    tasks = listOf(
                        task("backend-root").copy(writePaths = listOf("backend/**")),
                        task("backend-service").copy(writePaths = listOf("backend/src/**")),
                    ),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    val running = active.incrementAndGet()
                    maximumActive.updateAndGet { current -> maxOf(current, running) }
                    delay(10)
                    active.decrementAndGet()
                    SwarmTaskExecution("done:${task.id}")
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            assertEquals(1, maximumActive.get())
            assertEquals(2, completed.schedulingDecisions.size)
            assertEquals(
                listOf(
                    SwarmSchedulingCandidateDisposition.SELECTED,
                    SwarmSchedulingCandidateDisposition.DEFERRED_OWNERSHIP_CONFLICT,
                ),
                completed.schedulingDecisions.first().candidates.map { it.disposition },
            )
            assertTrue(completed.schedulingDecisions.first().candidates.last().reason.contains("write/write"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `ownership audit failures persist their root cause and workspace evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-ownership-audit")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val evidenceId = "e".repeat(64)
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    throw SwarmTaskExecutionException(
                        cause = SwarmOwnershipViolationException(
                            task.id,
                            listOf(
                                SwarmOwnershipViolation(
                                    status = "A",
                                    path = "forbidden.txt",
                                    reason = "Changed path is outside declared write ownership",
                                )
                            ),
                        ),
                        tokenUsage = TokenUsage(total = 3),
                        changedFileCount = 1,
                        verificationStatus = SwarmVerificationStatus.FAILED,
                        workspaceDeltaEvidenceId = evidenceId,
                    )
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val failed = store.get("run-test")!!.tasks.single()
            assertEquals(SwarmTaskStatus.FAILED, failed.status)
            assertEquals("SwarmOwnershipViolationException", failed.attemptRecords.single().errorCategory)
            assertEquals(evidenceId, failed.attemptRecords.single().workspaceDeltaEvidenceId)
            assertEquals(SwarmVerificationStatus.FAILED, failed.attemptRecords.single().verificationStatus)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `dependency artifact conflicts fail without retrying downstream execution`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-dependency-conflict")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val executions = AtomicInteger()
            store.put(
                run(
                    tasks = listOf(task("integrate")),
                    policy = SwarmExecutionPolicy(maxTaskAttempts = 3),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    executions.incrementAndGet()
                    throw SwarmDependencyArtifactConflictException(
                        runId = "run-test",
                        taskId = task.id,
                        dependencyTaskIds = listOf("first", "second"),
                        details = "content conflict",
                    )
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val failed = store.get("run-test")!!.tasks.single()
            assertEquals(1, executions.get())
            assertEquals(1, failed.attempt)
            assertEquals(SwarmTaskStatus.FAILED, failed.status)
            assertEquals("SwarmDependencyArtifactConflictException", failed.attemptRecords.single().errorCategory)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists actual attempt metrics across retry and reload`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-attempt-metrics")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val executions = AtomicInteger()
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxTaskAttempts = 2),
                    tasks = listOf(task("implement").copy(agentId = "requested-agent")),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    if (executions.incrementAndGet() == 1) {
                        throw SwarmTaskExecutionException(
                            cause = IllegalStateException("verification failed"),
                            tokenUsage = TokenUsage(input = 4, output = 2, total = 6, cost = 0.001),
                            resolvedAgentId = "resolved-agent",
                            changedFileCount = 1,
                            verificationStatus = SwarmVerificationStatus.FAILED,
                            workspaceDeltaEvidenceId = "a".repeat(64),
                            verificationEvidenceId = "b".repeat(64),
                            toolBrokerSessionIds = listOf("broker-first"),
                            toolAuditIds = listOf("audit-first"),
                        )
                    }
                    SwarmTaskExecution(
                        output = "implemented",
                        tokenUsage = TokenUsage(input = 8, output = 3, total = 11, cost = 0.002),
                        resolvedAgentId = "resolved-agent",
                        toolBrokerSessionIds = listOf("broker-second"),
                        toolAuditIds = listOf("audit-second"),
                        changedFileCount = 2,
                        verificationStatus = SwarmVerificationStatus.PASSED,
                        workspaceDeltaEvidenceId = "c".repeat(64),
                        verificationEvidenceId = "d".repeat(64),
                    )
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completedTask = store.get("run-test")!!.tasks.single()
            assertEquals(2, completedTask.attemptRecords.size)
            val failedAttempt = completedTask.attemptRecords[0]
            val successfulAttempt = completedTask.attemptRecords[1]
            assertEquals(SwarmTaskAttemptOutcome.FAILED, failedAttempt.outcome)
            assertEquals(SwarmVerificationStatus.FAILED, failedAttempt.verificationStatus)
            assertEquals(1, failedAttempt.changedFileCount)
            assertEquals("resolved-agent", failedAttempt.resolvedAgentId)
            assertEquals(listOf("broker-first"), failedAttempt.toolBrokerSessionIds)
            assertEquals("a".repeat(64), failedAttempt.workspaceDeltaEvidenceId)
            assertEquals("b".repeat(64), failedAttempt.verificationEvidenceId)
            assertEquals(SwarmTaskAttemptOutcome.SUCCEEDED, successfulAttempt.outcome)
            assertEquals(SwarmVerificationStatus.PASSED, successfulAttempt.verificationStatus)
            assertEquals(2, successfulAttempt.changedFileCount)
            assertEquals("c".repeat(64), successfulAttempt.workspaceDeltaEvidenceId)
            assertEquals("d".repeat(64), successfulAttempt.verificationEvidenceId)
            assertEquals(TokenUsage(input = 8, output = 3, total = 11, cost = 0.002), successfulAttempt.tokenUsage)
            assertTrue(
                completedTask.attemptRecords.all { attempt ->
                    attempt.durationMillis?.let { duration -> duration >= 0 } == true
                }
            )

            val reloaded = SwarmStore(directory.toFile()).also { it.load() }.get("run-test")!!
            assertEquals(store.get("run-test")!!.schedulingDecisions, reloaded.schedulingDecisions)
            assertEquals(completedTask.attemptRecords, reloaded.tasks.single().attemptRecords)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists token usage returned by task executor`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-token-usage")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(
                run(
                    tasks = listOf(
                        task("task").copy(
                            tokenUsage = TokenUsage(input = 3, output = 2, total = 5, cost = 0.0005)
                        )
                    )
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    SwarmTaskExecution(
                        output = "done",
                        tokenUsage = TokenUsage(input = 10, output = 5, total = 15, cost = 0.001),
                        experienceIds = listOf("efficient-edit"),
                        experienceRoutingDecisions = listOf(routingDecision("efficient-edit", attempt = 1)),
                        toolBrokerSessionIds = listOf("broker-11111111111111111111111111111111"),
                        toolAuditIds = listOf("audit-11111111111111111111111111111111"),
                    )
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            assertEquals(
                TokenUsage(input = 13, output = 7, total = 20, cost = 0.0015),
                store.get("run-test")!!.tasks.single().tokenUsage,
            )
            assertEquals(listOf("efficient-edit"), store.get("run-test")!!.tasks.single().experienceIds)
            assertEquals(
                listOf(routingDecision("efficient-edit", attempt = 1)),
                store.get("run-test")!!.tasks.single().experienceRoutingDecisions,
            )
            assertEquals(
                listOf("broker-11111111111111111111111111111111"),
                store.get("run-test")!!.tasks.single().toolBrokerSessionIds,
            )
            assertEquals(
                listOf("audit-11111111111111111111111111111111"),
                store.get("run-test")!!.tasks.single().toolAuditIds,
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `retries failed task before releasing dependents and accumulates usage`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-retry-success")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val events = mutableListOf<String>()
            val firstUsage = TokenUsage(input = 4, output = 1, total = 5, cost = 0.001)
            val secondUsage = TokenUsage(input = 6, output = 2, total = 8, cost = 0.002)
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxTaskAttempts = 2),
                    tasks = listOf(
                        task("implement"),
                        task("review", dependsOn = listOf("implement")),
                    ),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    events += "${task.id}:${task.attempt}"
                    when {
                        task.id == "implement" && task.attempt == 1 -> {
                            throw SwarmTaskExecutionException(IllegalStateException("compile failed"), firstUsage)
                        }
                        task.id == "implement" -> SwarmTaskExecution("implemented", secondUsage)
                        else -> SwarmTaskExecution("reviewed")
                    }
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            val implementation = completed.tasks[0]
            assertEquals(SwarmRunStatus.SUCCEEDED, completed.status)
            assertEquals(2, implementation.attempt)
            assertEquals(listOf("Attempt 1: compile failed"), implementation.failureHistory)
            assertEquals(firstUsage + secondUsage, implementation.tokenUsage)
            assertEquals(listOf("implement:1", "implement:2", "review:1"), events)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `learns from final run without letting learning failure change success`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-learning")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val learned = CompletableDeferred<SwarmRun>()
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store = store,
                executor = SwarmTaskExecutor { _, _ -> SwarmTaskExecution("done") },
                scope = backgroundScope,
                learner = SwarmRunLearner { completed ->
                    learned.complete(completed)
                    error("learning unavailable")
                },
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            assertEquals(SwarmRunStatus.SUCCEEDED, learned.await().status)
            assertEquals(SwarmRunStatus.SUCCEEDED, store.get("run-test")?.status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `exhausts retries before fail fast cancels sibling work`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-retry-fail-fast")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val siblingStarted = CompletableDeferred<Unit>()
            val failingAttempts = AtomicInteger()
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxParallelism = 2, failFast = true, maxTaskAttempts = 2),
                    tasks = listOf(task("failing"), task("sibling")),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    if (task.id == "sibling") {
                        siblingStarted.complete(Unit)
                        delay(Long.MAX_VALUE)
                        SwarmTaskExecution("unexpected")
                    } else {
                        siblingStarted.await()
                        val attempt = failingAttempts.incrementAndGet()
                        error("failure-$attempt")
                    }
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            val failed = completed.tasks[0]
            assertEquals(SwarmRunStatus.FAILED, completed.status)
            assertEquals(2, failingAttempts.get())
            assertEquals(SwarmTaskStatus.FAILED, failed.status)
            assertEquals(listOf("Attempt 1: failure-1", "Attempt 2: failure-2"), failed.failureHistory)
            assertEquals("failure-2", failed.errorMessage)
            assertEquals(SwarmTaskStatus.CANCELED, completed.tasks[1].status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists token usage consumed before task failure`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-failed-token-usage")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val consumed = TokenUsage(input = 12, output = 3, total = 15, cost = 0.004)
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    throw SwarmTaskExecutionException(
                        IllegalStateException("model failed"),
                        consumed,
                        experienceIds = listOf("preserve-cancellation"),
                        experienceRoutingDecisions = listOf(routingDecision("preserve-cancellation", attempt = 1)),
                    )
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val failed = store.get("run-test")!!.tasks.single()
            assertEquals(SwarmTaskStatus.FAILED, failed.status)
            assertEquals(consumed, failed.tokenUsage)
            assertEquals(listOf("preserve-cancellation"), failed.experienceIds)
            assertEquals(
                listOf(routingDecision("preserve-cancellation", attempt = 1)),
                failed.experienceRoutingDecisions,
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `task timeout fails the task and blocks dependents without hanging`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-timeout")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(
                run(
                    policy = SwarmExecutionPolicy(taskTimeoutSeconds = 1),
                    tasks = listOf(
                        task("slow"),
                        task("dependent", dependsOn = listOf("slow")),
                    ),
                ),
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    delay(Long.MAX_VALUE)
                    SwarmTaskExecution("unexpected")
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            assertEquals(SwarmRunStatus.FAILED, completed.status)
            assertEquals(SwarmTaskStatus.FAILED, completed.tasks[0].status)
            assertEquals("Task timed out after 1 seconds", completed.tasks[0].errorMessage)
            assertEquals(SwarmTaskStatus.BLOCKED, completed.tasks[1].status)
            assertEquals("Blocked by failed dependency", completed.tasks[1].errorMessage)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists token usage captured when a pi task times out`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-timeout-token-usage")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(
                run(
                    policy = SwarmExecutionPolicy(taskTimeoutSeconds = 1, maxTaskAttempts = 1),
                    tasks = listOf(task("slow")),
                )
            )
            val consumed = TokenUsage(input = 8, output = 5, total = 13, cost = 0.003)
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    throw SwarmTaskTimedOutException(CancellationException("timed out"), consumed)
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val failed = store.get("run-test")!!.tasks.single()
            assertEquals(SwarmTaskStatus.FAILED, failed.status)
            assertEquals("Task timed out after 1 seconds", failed.errorMessage)
            assertEquals(consumed, failed.tokenUsage)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `blocks every downstream task after dependency failure`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-failure")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(
                run(
                    tasks = listOf(
                        task("implementation"),
                        task("review", dependsOn = listOf("implementation")),
                        task("integration", dependsOn = listOf("review")),
                    ),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, task ->
                    if (task.id == "implementation") error("compile failed")
                    SwarmTaskExecution("unexpected")
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.await("run-test")

            val completed = store.get("run-test")!!
            assertEquals(SwarmRunStatus.FAILED, completed.status)
            assertEquals(SwarmTaskStatus.FAILED, completed.tasks[0].status)
            assertEquals(SwarmTaskStatus.BLOCKED, completed.tasks[1].status)
            assertEquals(SwarmTaskStatus.BLOCKED, completed.tasks[2].status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `allows only one concurrent start for the same run`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-start-race")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    delay(1_000)
                    SwarmTaskExecution("done")
                },
                backgroundScope,
            )

            val results = listOf(
                async { runCatching { scheduler.start("run-test") } },
                async { runCatching { scheduler.start("run-test") } },
            ).awaitAll()

            assertEquals(1, results.count { it.isSuccess })
            assertEquals(1, results.count { it.isFailure })
            scheduler.cancel("run-test")
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancel before scheduler dispatch marks created run canceled`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-immediate-cancel")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ -> SwarmTaskExecution("unexpected") },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.cancel("run-test")

            val canceled = store.get("run-test")!!
            assertEquals(SwarmRunStatus.CANCELED, canceled.status)
            assertEquals(SwarmTaskStatus.CANCELED, canceled.tasks.single().status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancellation does not retry an active task`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-no-retry-on-cancel")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val started = CompletableDeferred<Unit>()
            val executions = AtomicInteger()
            store.put(
                run(
                    policy = SwarmExecutionPolicy(maxTaskAttempts = 3),
                    tasks = listOf(task("task")),
                )
            )
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ ->
                    executions.incrementAndGet()
                    started.complete(Unit)
                    delay(Long.MAX_VALUE)
                    SwarmTaskExecution("unexpected")
                },
                backgroundScope,
            )

            scheduler.start("run-test")
            started.await()
            scheduler.cancel("run-test")

            val canceled = store.get("run-test")!!.tasks.single()
            assertEquals(1, executions.get())
            assertEquals(1, canceled.attempt)
            assertTrue(canceled.failureHistory.isEmpty())
            assertEquals(SwarmTaskStatus.CANCELED, canceled.status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancel all closes scheduled runs before they dispatch`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-cancel-all")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ -> SwarmTaskExecution("unexpected") },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.cancelAll()

            assertEquals(SwarmRunStatus.CANCELED, store.get("run-test")?.status)
            assertEquals(SwarmTaskStatus.CANCELED, store.get("run-test")?.tasks?.single()?.status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `shutdown cancels scheduled runs and rejects new work`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-shutdown")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ -> SwarmTaskExecution("unexpected") },
                backgroundScope,
            )

            scheduler.start("run-test")
            scheduler.shutdown()

            assertEquals(SwarmRunStatus.CANCELED, store.get("run-test")?.status)
            val error = kotlin.test.assertFailsWith<IllegalStateException> {
                scheduler.start("run-test")
            }
            assertEquals("Swarm scheduler is shut down", error.message)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancel all retries a cancellation that previously failed to persist`() = runTest {
        val directory = Files.createTempDirectory("swarm-scheduler-cancel-retry")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(run(tasks = listOf(task("task"))))
            val scheduler = SwarmScheduler(
                store,
                SwarmTaskExecutor { _, _ -> SwarmTaskExecution("unexpected") },
                backgroundScope,
            )
            val runFile = directory.resolve("run-test.json")
            Files.delete(runFile)
            Files.createDirectory(runFile)

            kotlin.test.assertFails { scheduler.cancel("run-test") }
            assertEquals(SwarmRunStatus.CREATED, store.get("run-test")?.status)

            Files.delete(runFile)
            scheduler.cancelAll()

            assertEquals(SwarmRunStatus.CANCELED, store.get("run-test")?.status)
            assertEquals(SwarmTaskStatus.CANCELED, store.get("run-test")?.tasks?.single()?.status)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun run(
        tasks: List<SwarmTask>,
        policy: SwarmExecutionPolicy = SwarmExecutionPolicy(maxTaskAttempts = 1),
    ): SwarmRun {
        val timestamp = Clock.System.now()
        return SwarmRun(
            id = "run-test",
            title = "Test swarm",
            objective = "Verify orchestration",
            createdAt = timestamp,
            updatedAt = timestamp,
            tasks = tasks,
            policy = policy,
        )
    }

    private fun task(id: String, dependsOn: List<String> = emptyList()) = SwarmTask(
        id = id,
        title = id,
        prompt = "Execute $id",
        dependsOn = dependsOn,
    )

    private fun routingDecision(experienceId: String, attempt: Int) = SwarmExperienceRoutingDecision(
        experienceId = experienceId,
        status = SwarmExperienceRoutingStatus.SELECTED,
        queryFingerprint = "query-$experienceId",
        score = 120,
        relevanceScore = 100,
        observedUtility = 1,
        controlledWins = 0,
        controlledRegressions = 0,
        medianQualityDelta = 0.0,
        attempt = attempt,
    )
}
