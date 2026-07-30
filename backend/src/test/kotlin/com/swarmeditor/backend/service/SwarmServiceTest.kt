package com.swarmeditor.backend.service

import com.swarmeditor.backend.swarm.SwarmExperienceEvidence
import com.swarmeditor.backend.swarm.SwarmExperienceInsight
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.backend.swarm.SwarmExperienceSelection
import com.swarmeditor.backend.swarm.SwarmExperienceSelector
import com.swarmeditor.backend.swarm.SwarmScheduler
import com.swarmeditor.backend.swarm.SwarmPlan
import com.swarmeditor.backend.swarm.SwarmPlanner
import com.swarmeditor.backend.swarm.SwarmPlanningRequest
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshot
import com.swarmeditor.backend.swarm.SwarmStore
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.TokenUsage
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest

class SwarmServiceTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `creates a run from a dynamically planned task graph`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-plan")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            experienceStore.applyInsights(
                runId = "run-history",
                insights = listOf(
                    SwarmExperienceInsight(
                        id = "structured-concurrency",
                        principle = "Use structured concurrency for swarm scheduling",
                        rationale = "Owned scopes preserve cancellation and lifecycle boundaries.",
                        kind = SwarmExperienceKind.STRATEGY,
                        role = SwarmAgentRole.PLANNER,
                        tags = listOf("coroutines"),
                        evidence = SwarmExperienceEvidence.SUCCESS,
                    )
                ),
                timestamp = Clock.System.now(),
            )
            val agentService = mockk<AgentService>()
            val profile = AgentConfig(id = "pi-default", name = "Pi")
            coEvery { agentService.getLaunchableConfigs() } returns listOf(profile)
            var capturedRequest: SwarmPlanningRequest? = null
            val planner = SwarmPlanner { request ->
                capturedRequest = request
                SwarmPlan(
                    tasks = listOf(
                        SwarmTask(id = "inspect", title = "Inspect", prompt = "Inspect constraints"),
                        SwarmTask(
                            id = "implement",
                            title = "Implement",
                            prompt = "Implement and verify",
                            role = SwarmAgentRole.IMPLEMENTER,
                            dependsOn = listOf("inspect"),
                        ),
                    ),
                    recommendedParallelism = 2,
                    failFast = true,
                    maxTaskAttempts = 3,
                )
            }
            val repositorySnapshot = SwarmRepositorySnapshot(
                revision = "1".repeat(40),
                baseRevision = "2".repeat(40),
                treeHash = "3".repeat(40),
                dirty = true,
                pinnedReference = "refs/swarm-editor/evaluation-snapshots/${"1".repeat(40)}",
            )
            val service = SwarmService(
                store = store,
                scheduler = mockk(relaxed = true),
                agentService = agentService,
                planner = planner,
                experienceStore = experienceStore,
                repositorySnapshotProvider = { repositorySnapshot },
            )

            val run = service.createPlannedRun(
                title = "Dynamic swarm",
                objective = "Strengthen coroutine scheduling",
                preferredPlannerAgentId = profile.id,
            ).getOrThrow()

            assertEquals(listOf("inspect", "implement"), run.tasks.map(SwarmTask::id))
            assertEquals(2, run.policy.maxParallelism)
            assertTrue(run.policy.failFast)
            assertEquals(3, run.policy.maxTaskAttempts)
            assertEquals(profile.id, capturedRequest?.preferredPlannerAgentId)
            assertEquals(listOf(profile), capturedRequest?.availableAgents)
            assertEquals(listOf("structured-concurrency"), capturedRequest?.experiences?.map { it.id })
            assertEquals(repositorySnapshot.revision, run.repositoryBaseline?.revision)
            assertEquals(repositorySnapshot.baseRevision, run.repositoryBaseline?.baseRevision)
            assertEquals(repositorySnapshot.treeHash, run.repositoryBaseline?.treeHash)
            assertEquals(repositorySnapshot.pinnedReference, run.repositoryBaseline?.pinnedReference)
            assertEquals(run.createdAt, run.repositoryBaseline?.capturedAt)
            assertEquals(run, store.get(run.id))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `planned runs use evidence-gated experience selection`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-selected-experience")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            experienceStore.applyInsights(
                runId = "run-history",
                insights = listOf(
                    SwarmExperienceInsight(
                        id = "selected-memory",
                        principle = "Select only validated planning memory",
                        rationale = "A selector may abstain from lexically relevant but harmful memory.",
                        kind = SwarmExperienceKind.STRATEGY,
                        role = SwarmAgentRole.PLANNER,
                        tags = listOf("planning"),
                        evidence = SwarmExperienceEvidence.SUCCESS,
                    )
                ),
                timestamp = Clock.System.now(),
            )
            val selected = experienceStore.get("selected-memory")!!
            val selector = SwarmExperienceSelector { query, role, limit ->
                assertEquals("Improve planning", query)
                assertEquals(SwarmAgentRole.PLANNER, role)
                assertEquals(8, limit)
                SwarmExperienceSelection(
                    selected = listOf(selected),
                    decisions = listOf(
                        SwarmExperienceRoutingDecision(
                            experienceId = selected.id,
                            status = SwarmExperienceRoutingStatus.SELECTED,
                            queryFingerprint = "planning-query",
                            score = 120,
                            relevanceScore = 100,
                            observedUtility = 0,
                            controlledWins = 0,
                            controlledRegressions = 0,
                            medianQualityDelta = 0.0,
                        )
                    ),
                )
            }
            val agentService = mockk<AgentService>()
            coEvery { agentService.getLaunchableConfigs() } returns listOf(AgentConfig(id = "pi", name = "Pi"))
            var capturedRequest: SwarmPlanningRequest? = null
            val planner = SwarmPlanner { request ->
                capturedRequest = request
                SwarmPlan(
                    tasks = listOf(SwarmTask(id = "plan", title = "Plan", prompt = "Plan and verify")),
                    recommendedParallelism = 1,
                    failFast = true,
                    maxTaskAttempts = 1,
                )
            }
            val service = SwarmService(
                store = store,
                scheduler = mockk(relaxed = true),
                agentService = agentService,
                planner = planner,
                experienceStore = experienceStore,
                experienceSelector = selector,
            )

            service.createPlannedRun("Selected", "Improve planning").getOrThrow()

            assertEquals(listOf("selected-memory"), capturedRequest?.experiences?.map { it.id })
            assertEquals(listOf("selected-memory"), service.runs.value.single().planningExperienceRoutingDecisions.map { it.experienceId })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `resolves an unassigned task through dynamic agent creation`() = runTest {
        val agentService = mockk<AgentService>()
        val reviewer = AgentConfig(id = "pi-default", name = "Reviewer", modelConfigId = "review-model")
        coEvery { agentService.createDynamicAgent(any()) } returns reviewer
        val service = SwarmService(
            store = mockk(relaxed = true),
            scheduler = mockk(relaxed = true),
            agentService = agentService,
        )

        val resolved = service.resolveAgent(
            SwarmTask(
                id = "review",
                title = "Review",
                prompt = "Review data flow",
                role = SwarmAgentRole.REVIEWER,
            ),
        )

        assertEquals(reviewer, resolved)
    }

    @Test
    fun `explicit task agent is forwarded to dynamic creation policy`() = runTest {
        val agentService = mockk<AgentService>()
        val explicit = AgentConfig(id = "custom", name = "Custom")
        coEvery { agentService.createDynamicAgent(match { it.agentId == "custom" }) } returns explicit
        val service = SwarmService(
            store = mockk(relaxed = true),
            scheduler = mockk(relaxed = true),
            agentService = agentService,
        )

        val resolved = service.resolveAgent(
            SwarmTask(
                id = "review",
                title = "Review",
                prompt = "Review data flow",
                role = SwarmAgentRole.REVIEWER,
                agentId = "custom",
            ),
        )

        assertEquals(explicit, resolved)
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `retry preserves successful work and resets every incomplete task`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-retry")
        try {
            val timestamp = Clock.System.now()
            val repositoryBaseline = SwarmRepositoryBaseline(
                revision = "4".repeat(40),
                baseRevision = "4".repeat(40),
                treeHash = "5".repeat(40),
                dirty = false,
                capturedAt = timestamp,
            )
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(
                SwarmRun(
                    id = "run-retry",
                    title = "Retry",
                    objective = "Retry incomplete work",
                    createdAt = timestamp,
                    updatedAt = timestamp,
                    status = SwarmRunStatus.FAILED,
                    repositoryBaseline = repositoryBaseline,
                    tasks = listOf(
                        task("completed", SwarmTaskStatus.SUCCEEDED, output = "keep"),
                        task(
                            "failed",
                            SwarmTaskStatus.FAILED,
                            error = "failure",
                            tokenUsage = TokenUsage(input = 20, output = 10, total = 30, cost = 0.002),
                        ).copy(
                            attempt = 2,
                            failureHistory = listOf("Attempt 1: compile failed", "Attempt 2: tests failed"),
                        ),
                        task("blocked", SwarmTaskStatus.BLOCKED, error = "fail-fast"),
                    ),
                )
            )
            val scheduler = mockk<SwarmScheduler>(relaxed = true)
            val service = SwarmService(
                store = store,
                scheduler = scheduler,
                agentService = mockk<AgentService>(relaxed = true),
            )

            service.retry("run-retry").getOrThrow()

            val retried = store.get("run-retry")!!
            assertEquals(SwarmRunStatus.CREATED, retried.status)
            assertEquals(SwarmTaskStatus.SUCCEEDED, retried.tasks[0].status)
            assertEquals("keep", retried.tasks[0].output)
            assertEquals(SwarmTaskStatus.PENDING, retried.tasks[1].status)
            assertEquals(SwarmTaskStatus.PENDING, retried.tasks[2].status)
            assertEquals(TokenUsage(input = 20, output = 10, total = 30, cost = 0.002), retried.tasks[1].tokenUsage)
            assertEquals(0, retried.tasks[1].attempt)
            assertEquals(
                listOf("Attempt 1: compile failed", "Attempt 2: tests failed"),
                retried.tasks[1].failureHistory,
            )
            assertEquals(null, retried.tasks[1].errorMessage)
            assertEquals(null, retried.tasks[2].errorMessage)
            assertEquals(repositoryBaseline, retried.repositoryBaseline)
            coVerify(exactly = 1) { scheduler.start("run-retry") }
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `retry restores failed snapshot when rescheduling fails`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-retry-rollback")
        try {
            val timestamp = Clock.System.now()
            val original = SwarmRun(
                id = "run-retry",
                title = "Retry",
                objective = "Retry incomplete work",
                createdAt = timestamp,
                updatedAt = timestamp,
                status = SwarmRunStatus.FAILED,
                tasks = listOf(task("failed", SwarmTaskStatus.FAILED, error = "failure")),
            )
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(original)
            val scheduler = mockk<SwarmScheduler>()
            coEvery { scheduler.await("run-retry") } returns Unit
            coEvery { scheduler.start("run-retry") } throws IllegalStateException("scheduler unavailable")
            val service = SwarmService(
                store = store,
                scheduler = scheduler,
                agentService = mockk<AgentService>(relaxed = true),
            )

            val result = service.retry("run-retry")

            assertTrue(result.isFailure)
            assertEquals("scheduler unavailable", result.exceptionOrNull()?.message)
            assertEquals(original, store.get("run-retry"))
            coVerify(exactly = 1) { scheduler.start("run-retry") }
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `retry restores failed snapshot and propagates cancellation`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-retry-cancellation")
        try {
            val timestamp = Clock.System.now()
            val original = SwarmRun(
                id = "run-retry",
                title = "Retry",
                objective = "Retry incomplete work",
                createdAt = timestamp,
                updatedAt = timestamp,
                status = SwarmRunStatus.FAILED,
                tasks = listOf(task("failed", SwarmTaskStatus.FAILED, error = "failure")),
            )
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(original)
            val scheduler = mockk<SwarmScheduler>()
            coEvery { scheduler.await("run-retry") } returns Unit
            coEvery { scheduler.start("run-retry") } throws CancellationException("retry canceled")
            val service = SwarmService(
                store = store,
                scheduler = scheduler,
                agentService = mockk<AgentService>(relaxed = true),
            )

            val cancellation = assertFailsWith<CancellationException> {
                service.retry("run-retry")
            }

            assertEquals("retry canceled", cancellation.message)
            assertEquals(original, store.get("run-retry"))
            coVerify(exactly = 1) { scheduler.start("run-retry") }
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun task(
        id: String,
        status: SwarmTaskStatus,
        output: String = "",
        error: String? = null,
        tokenUsage: TokenUsage = TokenUsage(),
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = "Execute $id",
        status = status,
        output = output,
        errorMessage = error,
        tokenUsage = tokenUsage,
    )
}
