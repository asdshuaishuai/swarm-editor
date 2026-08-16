package com.swarmeditor.backend.service

import com.swarmeditor.backend.swarm.SwarmExperienceEvidence
import com.swarmeditor.backend.delivery.DeliveryRecordStore
import com.swarmeditor.backend.capability.CapabilityRegistry
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
import com.swarmeditor.backend.swarm.SwarmArtifactIntegrator
import com.swarmeditor.backend.swarm.SwarmArtifactIntegrationStaleException
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.DeliveryAdmission
import com.swarmeditor.common.model.DeliveryRecord
import com.swarmeditor.common.model.DeliveryStatus
import com.swarmeditor.common.model.DeliveryTrigger
import com.swarmeditor.common.model.DeliveryTriggerKind
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmArtifactIntegrationPlan
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmArtifactDiffHunk
import com.swarmeditor.common.model.SwarmArtifactHunkDependency
import com.swarmeditor.common.model.SwarmArtifactHunkDependencyKind
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRejectionResolution
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmArtifactReviewAction
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactRiskReason
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskAttemptRecord
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.SwarmVerificationStatus
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
    fun `creating a swarm run creates a linked delivery record`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-delivery")
        try {
            val store = SwarmStore(directory.resolve("runs").toFile()).also { it.load() }
            val deliveryStore = DeliveryRecordStore(directory.resolve("delivery.json").toFile()).also { it.load() }
            val service = SwarmService(
                store = store,
                scheduler = mockk(relaxed = true),
                agentService = mockk(),
                deliveryRecordStore = deliveryStore,
                deliveryProjectPathProvider = { "/tmp/project" },
                capabilityRegistry = CapabilityRegistry(),
            )

            val run = service.createRun(
                title = "Delivery run",
                objective = "Record the delivery envelope",
                tasks = listOf(SwarmTask(id = "task", title = "Task", prompt = "Execute")),
            ).getOrThrow()

            val delivery = deliveryStore.get(checkNotNull(run.deliveryRecordId))
            assertEquals(run.id, delivery?.trigger?.sourceId)
            assertEquals("/tmp/project", delivery?.projectPath)
            assertEquals(listOf("swarm.create"), delivery?.admission?.capabilityIds)
            assertEquals(emptySet(), delivery?.admission?.requestedPermissions)
            assertEquals(emptySet(), delivery?.admission?.grantedPermissions)
            assertEquals("Capability admitted", delivery?.admission?.reason)
            assertEquals(run.createdAt, delivery?.createdAt)
        } finally {
            directory.deleteRecursively()
        }
    }

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
            val repositoryEvidence = SwarmRepositoryEvidenceBundle(
                queryFingerprint = "planning-evidence",
                generatedAt = Clock.System.now(),
                scannedFileCount = 10,
                candidateFileCount = 1,
                characterBudget = 1_000,
                consumedCharacters = 90,
                truncated = false,
                evidence = listOf(
                    SwarmRepositoryEvidence(
                        id = "repo-evidence",
                        kind = SwarmRepositoryEvidenceKind.FILE_MATCH,
                        path = "backend/Scheduler.kt",
                        line = 12,
                        score = 25.0,
                        summary = "Matched scheduler",
                    )
                ),
            )
            val service = SwarmService(
                store = store,
                scheduler = mockk(relaxed = true),
                agentService = agentService,
                planner = planner,
                experienceStore = experienceStore,
                repositoryLocalizer = { repositoryEvidence },
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
            assertEquals(repositoryEvidence, capturedRequest?.repositoryEvidence)
            assertEquals(repositoryEvidence, run.planningEvidence)
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

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists explicit artifact review plan before applying it`() = runTest {
        val directory = Files.createTempDirectory("swarm-service-artifact-plan")
        try {
            val timestamp = Clock.System.now()
            val workspaceEvidenceId = "a".repeat(64)
            val verificationEvidenceId = "b".repeat(64)
            val successfulTask = SwarmTask(
                id = "implement",
                title = "Implement",
                prompt = "Implement verified change",
                readPaths = listOf("backend/**"),
                writePaths = listOf("backend/**"),
                verificationCommands = listOf(listOf("./gradlew", ":backend:test")),
                status = SwarmTaskStatus.SUCCEEDED,
                attempt = 1,
                attemptRecords = listOf(
                    SwarmTaskAttemptRecord(
                        id = "attempt-1",
                        schedulingDecisionId = "decision-1",
                        attempt = 1,
                        outcome = SwarmTaskAttemptOutcome.SUCCEEDED,
                        startedAt = timestamp,
                        completedAt = timestamp,
                        verificationStatus = SwarmVerificationStatus.PASSED,
                        workspaceDeltaEvidenceId = workspaceEvidenceId,
                        verificationEvidenceId = verificationEvidenceId,
                    )
                ),
            )
            val swarmRun = SwarmRun(
                id = "run-artifact",
                title = "Artifact",
                objective = "Review before applying",
                createdAt = timestamp,
                updatedAt = timestamp,
                status = SwarmRunStatus.SUCCEEDED,
                deliveryRecordId = "delivery-run-artifact",
                repositoryBaseline = SwarmRepositoryBaseline(
                    revision = "1".repeat(40),
                    baseRevision = "1".repeat(40),
                    treeHash = "2".repeat(40),
                    dirty = false,
                    capturedAt = timestamp,
                ),
                tasks = listOf(successfulTask),
            )
            val plan = SwarmArtifactIntegrationPlan(
                id = "integration-test",
                runId = swarmRun.id,
                taskId = successfulTask.id,
                attempt = 1,
                workspaceDeltaEvidenceId = workspaceEvidenceId,
                verificationEvidenceId = verificationEvidenceId,
                baselineRevision = "1".repeat(40),
                baselineTree = "2".repeat(40),
                currentRevision = "3".repeat(40),
                currentTree = "4".repeat(40),
                artifactRevision = "5".repeat(40),
                artifactTree = "6".repeat(40),
                integratedRevision = "7".repeat(40),
                integratedTree = "8".repeat(40),
                pinnedReference = "refs/swarm-editor/integration-plans/${"7".repeat(40)}",
                createdAt = timestamp,
            )
            var prepareCount = 0
            var stalePlanId: String? = null
            var releasedPlans = 0
            val previewHunksByPlan = mutableMapOf<String, List<SwarmArtifactDiffHunk>>()
            val previewDependenciesByPlan = mutableMapOf<String, List<SwarmArtifactHunkDependency>>()
            val integrator = object : SwarmArtifactIntegrator {
                override suspend fun prepare(
                    run: SwarmRun,
                    task: SwarmTask,
                    workspaceDeltaEvidenceId: String,
                    verificationEvidenceId: String,
                ): SwarmArtifactIntegrationPlan {
                    prepareCount += 1
                    assertEquals(swarmRun.id, run.id)
                    assertEquals(successfulTask.id, task.id)
                    assertEquals(plan.workspaceDeltaEvidenceId, workspaceDeltaEvidenceId)
                    assertEquals(plan.verificationEvidenceId, verificationEvidenceId)
                    return plan
                }

                override suspend fun apply(
                    plan: SwarmArtifactIntegrationPlan,
                    persist: suspend (SwarmArtifactIntegrationPlan) -> Unit,
                ): SwarmArtifactIntegrationPlan {
                    if (plan.id == stalePlanId) throw SwarmArtifactIntegrationStaleException(plan.id)
                    return plan.copy(
                        status = SwarmArtifactIntegrationStatus.APPLIED,
                        appliedAt = timestamp,
                    ).also { persist(it) }
                }

                override suspend fun preview(plan: SwarmArtifactIntegrationPlan) = SwarmArtifactIntegrationPreview(
                    planId = plan.id,
                    runId = plan.runId,
                    taskId = plan.taskId,
                    status = plan.status,
                    verificationEvidenceId = plan.verificationEvidenceId,
                    currentRevision = plan.currentRevision,
                    integratedRevision = plan.integratedRevision,
                    changedPaths = emptyList(),
                    unifiedDiff = "",
                    truncated = false,
                    hunks = previewHunksByPlan[plan.id].orEmpty(),
                    hunkDependencies = previewDependenciesByPlan[plan.id].orEmpty(),
                )

                override suspend fun previewSelection(
                    plan: SwarmArtifactIntegrationPlan,
                    selectedHunkIds: Collection<String>,
                ): SwarmArtifactSelectionPreview {
                    assertEquals(listOf("hunk-${"a".repeat(20)}"), selectedHunkIds.toList())
                    return SwarmArtifactSelectionPreview(
                        planId = plan.id,
                        requestedHunkIds = selectedHunkIds.toList(),
                        prerequisiteHunkIds = emptyList(),
                        effectiveHunkIds = selectedHunkIds.toList(),
                        changedPaths = listOf("backend/src/Main.kt"),
                        unifiedDiff = "@@ -1 +1 @@\n-old\n+new\n",
                        applicabilityStatus = SwarmArtifactSelectionApplicabilityStatus.APPLICABLE,
                        checkedAgainstTree = plan.currentTree,
                    )
                }

                override suspend fun releasePreparedPlan(plan: SwarmArtifactIntegrationPlan) {
                    releasedPlans += 1
                }
            }
            val store = SwarmStore(directory.toFile()).also { it.load(); it.put(swarmRun) }
            val deliveryStore = DeliveryRecordStore(directory.resolve("delivery.json").toFile()).also { delivery ->
                delivery.put(
                    DeliveryRecord(
                        id = "delivery-run-artifact",
                        projectPath = "/tmp/project",
                        trigger = DeliveryTrigger(DeliveryTriggerKind.SWARM, sourceId = swarmRun.id),
                        admission = DeliveryAdmission(true, "swarm-create", "1"),
                        createdAt = timestamp,
                        updatedAt = timestamp,
                    ),
                )
            }
            val scheduler = mockk<SwarmScheduler>(relaxed = true)
            val service = SwarmService(
                store = store,
                scheduler = scheduler,
                agentService = mockk(relaxed = true),
                artifactIntegrator = integrator,
                deliveryRecordStore = deliveryStore,
            )

            val prepared = service.prepareArtifactIntegration(swarmRun.id, successfulTask.id).getOrThrow()
            assertEquals(plan, prepared)
            assertEquals(listOf(plan), store.get(swarmRun.id)?.artifactIntegrationPlans)
            assertEquals(plan, service.prepareArtifactIntegration(swarmRun.id, successfulTask.id).getOrThrow())
            assertEquals(1, prepareCount)

            val preview = service.previewArtifactIntegration(swarmRun.id, plan.id).getOrThrow()
            assertEquals(plan.id, preview.planId)
            val selection = service.previewArtifactSelection(
                runId = swarmRun.id,
                planId = plan.id,
                selectedHunkIds = listOf("hunk-${"a".repeat(20)}"),
            ).getOrThrow()
            assertEquals(SwarmArtifactSelectionApplicabilityStatus.APPLICABLE, selection.applicabilityStatus)
            assertEquals(plan.currentTree, selection.checkedAgainstTree)
            service.recordArtifactReviewObservation(
                runId = swarmRun.id,
                planId = plan.id,
                action = SwarmArtifactReviewAction.OPENED,
                diffCharacterCount = 120,
                changedPathCount = 2,
            ).getOrThrow()
            service.recordArtifactReviewObservation(
                runId = swarmRun.id,
                planId = plan.id,
                action = SwarmArtifactReviewAction.CLOSED,
                dwellMillis = 1_500,
            ).getOrThrow()

            val applied = service.applyArtifactIntegration(swarmRun.id, plan.id, reviewDwellMillis = 1_250).getOrThrow()
            assertEquals(SwarmArtifactIntegrationStatus.APPLIED, applied.status)
            assertEquals(SwarmArtifactIntegrationStatus.APPLIED, store.get(swarmRun.id)?.artifactIntegrationPlans?.single()?.status)
            assertEquals(plan.integratedRevision, deliveryStore.get("delivery-run-artifact")?.artifact?.commitHash)
            assertEquals(plan.artifactRevision, deliveryStore.get("delivery-run-artifact")?.artifact?.artifactRevision)
            assertEquals(
                listOf(
                    SwarmArtifactReviewAction.OPENED,
                    SwarmArtifactReviewAction.CLOSED,
                    SwarmArtifactReviewAction.APPLY_REQUESTED,
                    SwarmArtifactReviewAction.APPLIED,
                ),
                store.get(swarmRun.id)?.artifactReviewEvents?.map { it.action },
            )
            assertEquals(1_250, store.get(swarmRun.id)?.artifactReviewEvents?.last()?.dwellMillis)

            val highRiskHunk = SwarmArtifactDiffHunk(
                id = "hunk-${"a".repeat(20)}",
                path = "backend/src/main/kotlin/Contract.kt",
                header = "@@ -1 +1 @@",
                diff = "-data class Contract(val old: String)\n+data class Contract(val next: String)\n",
                addedLineCount = 1,
                removedLineCount = 1,
                riskLevel = SwarmArtifactRiskLevel.HIGH,
                riskReasons = listOf(SwarmArtifactRiskReason.PUBLIC_CONTRACT),
            )
            val riskPlan = plan.copy(id = "integration-risk", status = SwarmArtifactIntegrationStatus.PREPARED, appliedAt = null)
            previewHunksByPlan[riskPlan.id] = listOf(highRiskHunk)
            store.update(swarmRun.id) { current ->
                current.copy(artifactIntegrationPlans = current.artifactIntegrationPlans + riskPlan)
            }

            val unreviewedRisk = service.applyArtifactIntegration(swarmRun.id, riskPlan.id)
            assertTrue(unreviewedRisk.exceptionOrNull()?.message?.contains("high-risk") == true)
            val coverage = service.recordArtifactReviewObservation(
                runId = swarmRun.id,
                planId = riskPlan.id,
                action = SwarmArtifactReviewAction.COVERAGE_RECORDED,
                dwellMillis = 2_000,
                firstViewportMillis = 120,
                viewportDwellMillis = 1_500,
                viewedHunkIds = listOf(highRiskHunk.id),
            ).getOrThrow()
            assertEquals(1_000, coverage.reviewCoveragePermille)
            assertEquals(1, coverage.viewedHighRiskHunkCount)
            assertEquals(SwarmArtifactIntegrationStatus.APPLIED, service.applyArtifactIntegration(swarmRun.id, riskPlan.id).getOrThrow().status)

            val rejectionPlan = plan.copy(id = "integration-reject")
            val prerequisiteHunk = highRiskHunk.copy(
                id = "hunk-${"b".repeat(20)}",
                path = "backend/src/main/kotlin/ContractBase.kt",
                header = "@@ -1 +1 @@",
                diff = "-fun contractBase() = 1\n+fun contractBase() = 2\n",
                riskLevel = SwarmArtifactRiskLevel.LOW,
                riskReasons = emptyList(),
            )
            previewHunksByPlan[rejectionPlan.id] = listOf(prerequisiteHunk, highRiskHunk)
            previewDependenciesByPlan[rejectionPlan.id] = listOf(
                SwarmArtifactHunkDependency(
                    id = "hdep-${"c".repeat(20)}",
                    prerequisiteHunkId = prerequisiteHunk.id,
                    dependentHunkId = highRiskHunk.id,
                    kind = SwarmArtifactHunkDependencyKind.SYMBOL_REFERENCE,
                    symbol = "Contract",
                )
            )
            store.update(swarmRun.id) { current ->
                current.copy(artifactIntegrationPlans = current.artifactIntegrationPlans + rejectionPlan)
            }
            service.recordArtifactReviewObservation(
                runId = swarmRun.id,
                planId = rejectionPlan.id,
                action = SwarmArtifactReviewAction.COVERAGE_RECORDED,
                dwellMillis = 2_500,
                viewedHunkIds = listOf(highRiskHunk.id),
            ).getOrThrow()

            val rejected = service.rejectArtifactIntegration(
                runId = swarmRun.id,
                planId = rejectionPlan.id,
                reason = SwarmArtifactRejectionReason.ROOT_CAUSE_NOT_FIXED,
                resolution = SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY,
                rejectedHunkIds = listOf(highRiskHunk.id),
                reviewDwellMillis = 2_500,
            ).getOrThrow()

            assertEquals(SwarmArtifactReviewAction.REJECTED, rejected.action)
            assertEquals(SwarmArtifactRejectionReason.ROOT_CAUSE_NOT_FIXED, rejected.rejectionReason)
            assertEquals(listOf(highRiskHunk.id), rejected.rejectedHunkIds)
            assertTrue(rejected.revisionContractId != null)
            assertTrue(rejected.revisionTaskId != null)
            val revisedRun = store.get(swarmRun.id) ?: error("run missing")
            assertEquals(SwarmRunStatus.CREATED, revisedRun.status)
            assertEquals(DeliveryStatus.CREATED, deliveryStore.get("delivery-run-artifact")?.status)
            assertEquals(
                SwarmArtifactIntegrationStatus.DISCARDED,
                revisedRun.artifactIntegrationPlans.single { it.id == rejectionPlan.id }.status,
            )
            val revisionTask = revisedRun.tasks.single { it.id == rejected.revisionTaskId }
            assertEquals(listOf(successfulTask.id), revisionTask.dependsOn)
            assertEquals(successfulTask.verificationCommands, revisionTask.verificationCommands)
            assertEquals(listOf(highRiskHunk.path), revisionTask.writePaths)
            assertEquals(rejectionPlan.artifactRevision, revisionTask.revisionContract?.sourceArtifactRevision)
            assertEquals(listOf(highRiskHunk.path), revisionTask.revisionContract?.targetPaths)
            assertEquals(successfulTask.writePaths, revisionTask.revisionContract?.sourceWritePaths)
            assertEquals(SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY, revisionTask.revisionContract?.scopeMode)
            assertEquals(listOf(prerequisiteHunk.id), revisionTask.revisionContract?.contextHunkIds)
            assertEquals(listOf(prerequisiteHunk.path), revisionTask.revisionContract?.contextPaths)
            assertTrue(prerequisiteHunk.path in revisionTask.readPaths)
            coVerify(exactly = 1) { scheduler.start(swarmRun.id) }

            val stalePlan = plan.copy(id = "integration-stale")
            stalePlanId = stalePlan.id
            store.update(swarmRun.id) { current ->
                current.copy(artifactIntegrationPlans = current.artifactIntegrationPlans + stalePlan)
            }
            val staleResult = service.applyArtifactIntegration(swarmRun.id, stalePlan.id)
            assertTrue(staleResult.exceptionOrNull() is SwarmArtifactIntegrationStaleException)
            assertEquals(
                SwarmArtifactIntegrationStatus.DISCARDED,
                store.get(swarmRun.id)?.artifactIntegrationPlans?.single { it.id == stalePlan.id }?.status,
            )
            assertEquals(
                listOf(SwarmArtifactReviewAction.APPLY_REQUESTED, SwarmArtifactReviewAction.STALE),
                store.get(swarmRun.id)?.artifactReviewEvents?.takeLast(2)?.map { it.action },
            )
            assertEquals(2, releasedPlans)
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
