package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.capability.CapabilityRegistry
import com.swarmeditor.backend.delivery.DeliveryRecordStore
import com.swarmeditor.backend.swarm.SwarmGraph
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.backend.swarm.SwarmExperienceSelector
import com.swarmeditor.backend.swarm.SwarmScheduler
import com.swarmeditor.backend.swarm.SwarmPlanner
import com.swarmeditor.backend.swarm.SwarmPlanningRequest
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshot
import com.swarmeditor.backend.swarm.SwarmRepositoryLocalizer
import com.swarmeditor.backend.swarm.SwarmStore
import com.swarmeditor.backend.swarm.SwarmArtifactIntegrator
import com.swarmeditor.backend.swarm.SwarmArtifactIntegrationStaleException
import com.swarmeditor.backend.swarm.SwarmArtifactRiskAnalyzer
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.DeliveryAdmission
import com.swarmeditor.common.model.DeliveryRecord
import com.swarmeditor.common.model.DeliveryStatus
import com.swarmeditor.common.model.DeliveryTrigger
import com.swarmeditor.common.model.DeliveryTriggerKind
import com.swarmeditor.common.model.DeliveryWorkspaceReference
import com.swarmeditor.common.model.SwarmArtifactIntegrationPlan
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRejectionResolution
import com.swarmeditor.common.model.SwarmArtifactReviewAction
import com.swarmeditor.common.model.SwarmArtifactReviewEvent
import com.swarmeditor.common.model.SwarmArtifactRevisionContract
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
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
    private val repositoryLocalizer: SwarmRepositoryLocalizer? = null,
    private val repositorySnapshotProvider: suspend () -> SwarmRepositorySnapshot? = { null },
    private val artifactIntegrator: SwarmArtifactIntegrator? = null,
    private val deliveryRecordStore: DeliveryRecordStore? = null,
    private val deliveryProjectPathProvider: () -> String = { "" },
    private val capabilityRegistry: CapabilityRegistry? = null,
    private val dynamicAgentLimitProvider: suspend () -> Int = { AgentRegistry.defaultConfig().maxDynamicSubagents },
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) {
    val runs: StateFlow<List<SwarmRun>> = store.runs
    private val retryMutex = Mutex()
    private val integrationMutex = Mutex()

    suspend fun init() = store.load()

    suspend fun createRun(
        title: String,
        objective: String,
        tasks: List<SwarmTask>,
        policy: SwarmExecutionPolicy = SwarmExecutionPolicy(),
        planningExperienceRoutingDecisions: List<SwarmExperienceRoutingDecision> = emptyList(),
        planningEvidence: SwarmRepositoryEvidenceBundle? = null,
    ): Result<SwarmRun> = resultOf {
        capabilityRegistry?.check("swarm.create")?.let { decision ->
            check(decision.allowed) { decision.reason }
        }
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
        val runId = "run-${UUID.randomUUID().toString().take(12)}"
        val deliveryRecordId = deliveryRecordStore?.let { "delivery-$runId" }
        val run = SwarmRun(
            id = runId,
            title = title.trim(),
            objective = objective.trim(),
            createdAt = timestamp,
            updatedAt = timestamp,
            deliveryRecordId = deliveryRecordId,
            policy = effectivePolicy,
            repositoryBaseline = repositoryBaseline,
            planningEvidence = planningEvidence,
            tasks = tasks,
            planningExperienceRoutingDecisions = planningExperienceRoutingDecisions,
        )
        val projectPath = deliveryProjectPathProvider()
        val deliveryRecord = deliveryRecordId?.let { id ->
            DeliveryRecord(
                id = id,
                projectPath = projectPath,
                status = DeliveryStatus.CREATED,
                trigger = DeliveryTrigger(
                    kind = DeliveryTriggerKind.SWARM,
                    sourceId = runId,
                ),
                admission = DeliveryAdmission(
                    allowed = true,
                    policyId = "swarm-create",
                    policyVersion = "1",
                    capabilityIds = listOfNotNull(capabilityRegistry?.get("swarm.create")?.id),
                ),
                workspace = repositoryBaseline?.let { baseline ->
                    DeliveryWorkspaceReference(
                        projectPath = projectPath,
                        baseRevision = baseline.baseRevision,
                    )
                },
                createdAt = timestamp,
                updatedAt = timestamp,
            )
        }
        deliveryRecord?.let { record -> deliveryRecordStore.put(record) }
        try {
            store.put(run)
        } catch (error: Throwable) {
            deliveryRecord?.let { record ->
                try {
                    deliveryRecordStore.remove(record.id)
                } catch (cleanupError: Throwable) {
                    error.addSuppressed(cleanupError)
                }
            }
            throw error
        }
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
        val repositoryEvidence = repositoryLocalizer?.localize(objective.trim())
        val plan = planner.plan(
            SwarmPlanningRequest(
                objective = objective.trim(),
                preferredPlannerAgentId = preferredPlannerAgentId,
                availableAgents = availableAgents,
                experiences = experiences,
                repositoryEvidence = repositoryEvidence,
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
            planningEvidence = repositoryEvidence,
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

    suspend fun prepareArtifactIntegration(runId: String, taskId: String): Result<SwarmArtifactIntegrationPlan> = resultOf {
        scheduler.await(runId)
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val task = checkNotNull(run.tasks.firstOrNull { it.id == taskId }) { "Swarm task not found: $taskId" }
            require(task.status == SwarmTaskStatus.SUCCEEDED) { "Only successful Swarm tasks can be reviewed for integration" }
            val attempt = checkNotNull(task.attemptRecords.lastOrNull { record ->
                record.attempt == task.attempt && record.outcome == SwarmTaskAttemptOutcome.SUCCEEDED
            }) { "Successful task attempt evidence is missing" }
            require(attempt.verificationStatus == com.swarmeditor.common.model.SwarmVerificationStatus.PASSED) {
                "Only runtime-verified task artifacts can be reviewed for integration"
            }
            val workspaceEvidenceId = checkNotNull(attempt.workspaceDeltaEvidenceId) {
                "Successful task workspace evidence is missing"
            }
            val verificationEvidenceId = checkNotNull(attempt.verificationEvidenceId) {
                "Successful task verification evidence is missing"
            }
            run.artifactIntegrationPlans.lastOrNull { existing ->
                existing.taskId == taskId &&
                    existing.attempt == task.attempt &&
                    existing.status == SwarmArtifactIntegrationStatus.PREPARED
            }?.let { return@withLock it }
            val plan = integrator.prepare(
                run = run,
                task = task,
                workspaceDeltaEvidenceId = workspaceEvidenceId,
                verificationEvidenceId = verificationEvidenceId,
            )
            try {
                store.update(runId) { current ->
                    current.copy(
                        updatedAt = now(),
                        artifactIntegrationPlans = current.artifactIntegrationPlans + plan,
                    )
                }
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        integrator.releasePreparedPlan(plan)
                    } catch (cleanupError: Throwable) {
                        error.addSuppressed(cleanupError)
                    }
                }
                throw error
            }
            plan
        }
    }

    suspend fun previewArtifactIntegration(runId: String, planId: String): Result<SwarmArtifactIntegrationPreview> = resultOf {
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val plan = checkNotNull(run.artifactIntegrationPlans.firstOrNull { it.id == planId }) {
                "Artifact integration plan not found: $planId"
            }
            integrator.preview(plan)
        }
    }

    suspend fun previewArtifactSelection(
        runId: String,
        planId: String,
        selectedHunkIds: Collection<String>,
    ): Result<SwarmArtifactSelectionPreview> = resultOf {
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val plan = checkNotNull(run.artifactIntegrationPlans.firstOrNull { it.id == planId }) {
                "Artifact integration plan not found: $planId"
            }
            integrator.previewSelection(plan, selectedHunkIds)
        }
    }

    suspend fun recordArtifactReviewObservation(
        runId: String,
        planId: String,
        action: SwarmArtifactReviewAction,
        dwellMillis: Long = 0,
        diffCharacterCount: Int = 0,
        changedPathCount: Int = 0,
        firstViewportMillis: Long = 0,
        viewportDwellMillis: Long = 0,
        viewedHunkIds: List<String> = emptyList(),
    ): Result<SwarmArtifactReviewEvent> = resultOf {
        require(
            action in setOf(
                SwarmArtifactReviewAction.OPENED,
                SwarmArtifactReviewAction.COVERAGE_RECORDED,
                SwarmArtifactReviewAction.CLOSED,
            )
        ) {
            "Only UI review observations can be recorded directly"
        }
        validateReviewMetrics(
            dwellMillis = dwellMillis,
            diffCharacterCount = diffCharacterCount,
            changedPathCount = changedPathCount,
            firstViewportMillis = firstViewportMillis,
            viewportDwellMillis = viewportDwellMillis,
            viewedHunkCount = viewedHunkIds.size,
        )
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val plan = checkNotNull(run.artifactIntegrationPlans.firstOrNull { it.id == planId }) {
                "Artifact integration plan not found: $planId"
            }
            val preview = integrator.preview(plan)
            val normalizedViewedHunkIds = viewedHunkIds.distinct()
            val knownHunkIds = preview.hunks.mapTo(hashSetOf()) { it.id }
            require(normalizedViewedHunkIds.all(knownHunkIds::contains)) {
                "Review coverage references an unknown diff hunk"
            }
            val event = reviewEvent(
                run = run,
                plan = plan,
                action = action,
                dwellMillis = dwellMillis,
                diffCharacterCount = preview.unifiedDiff.length,
                changedPathCount = preview.changedPaths.size,
                firstViewportMillis = firstViewportMillis,
                viewportDwellMillis = viewportDwellMillis,
                preview = preview,
                viewedHunkIds = normalizedViewedHunkIds,
            )
            store.update(runId) { current -> current.appendReviewEvent(event, now()) }
            event
        }
    }

    suspend fun applyArtifactIntegration(
        runId: String,
        planId: String,
        reviewDwellMillis: Long = 0,
    ): Result<SwarmArtifactIntegrationPlan> = resultOf {
        validateReviewMetrics(reviewDwellMillis, 0, 0, 0, 0, 0)
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val run = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val plan = checkNotNull(run.artifactIntegrationPlans.firstOrNull { it.id == planId }) {
                "Artifact integration plan not found: $planId"
            }
            require(plan.status == SwarmArtifactIntegrationStatus.PREPARED) {
                "Only prepared artifact integration plans can be applied"
            }
            val preview = integrator.preview(plan)
            require(!preview.truncated) {
                "Artifact diff is truncated; full review is required before applying"
            }
            val viewedHunkIds = run.artifactReviewEvents
                .asSequence()
                .filter { event ->
                    event.planId == planId && event.action in setOf(
                        SwarmArtifactReviewAction.COVERAGE_RECORDED,
                        SwarmArtifactReviewAction.CLOSED,
                    )
                }
                .flatMap { it.viewedHunkIds.asSequence() }
                .toSet()
            val requiredHighRiskHunkIds = preview.hunks
                .asSequence()
                .filter { it.riskLevel == SwarmArtifactRiskLevel.HIGH }
                .map { it.id }
                .toSet()
            val missingHighRiskHunks = requiredHighRiskHunkIds - viewedHunkIds
            require(missingHighRiskHunks.isEmpty()) {
                "Review every high-risk diff hunk before applying (${missingHighRiskHunks.size} remaining)"
            }
            val requested = reviewEvent(
                run = run,
                plan = plan,
                action = SwarmArtifactReviewAction.APPLY_REQUESTED,
                dwellMillis = reviewDwellMillis,
                diffCharacterCount = preview.unifiedDiff.length,
                changedPathCount = preview.changedPaths.size,
                preview = preview,
                viewedHunkIds = viewedHunkIds.toList(),
            )
            store.update(runId) { current -> current.appendReviewEvent(requested, now()) }
            try {
                integrator.apply(plan) { applied ->
                    val appliedEvent = reviewEvent(
                        run = run,
                        plan = applied,
                        action = SwarmArtifactReviewAction.APPLIED,
                        dwellMillis = reviewDwellMillis,
                        diffCharacterCount = preview.unifiedDiff.length,
                        changedPathCount = preview.changedPaths.size,
                        preview = preview,
                        viewedHunkIds = viewedHunkIds.toList(),
                    )
                    store.update(runId) { current ->
                        require(current.artifactIntegrationPlans.any { it.id == planId && it.status == SwarmArtifactIntegrationStatus.PREPARED }) {
                            "Artifact integration plan changed while it was being applied"
                        }
                        current.copy(
                            updatedAt = now(),
                            artifactIntegrationPlans = current.artifactIntegrationPlans.map { existing ->
                                if (existing.id == planId) applied else existing
                            },
                        ).appendReviewEvent(appliedEvent, now())
                    }
                }
            } catch (error: SwarmArtifactIntegrationStaleException) {
                val staleEvent = reviewEvent(
                    run = run,
                    plan = plan,
                    action = SwarmArtifactReviewAction.STALE,
                    dwellMillis = reviewDwellMillis,
                    diffCharacterCount = preview.unifiedDiff.length,
                    changedPathCount = preview.changedPaths.size,
                    preview = preview,
                    viewedHunkIds = viewedHunkIds.toList(),
                    failureCategory = error::class.simpleName,
                )
                var discarded = false
                try {
                    store.update(runId) { current ->
                        current.copy(
                            updatedAt = now(),
                            artifactIntegrationPlans = current.artifactIntegrationPlans.map { existing ->
                                if (existing.id == planId) {
                                    existing.copy(
                                        status = SwarmArtifactIntegrationStatus.DISCARDED,
                                        discardedAt = now(),
                                    )
                                } else {
                                    existing
                                }
                            },
                        ).appendReviewEvent(staleEvent, now())
                    }
                    discarded = true
                } catch (persistenceError: Throwable) {
                    error.addSuppressed(persistenceError)
                }
                if (discarded) {
                    withContext(NonCancellable) {
                        try {
                            integrator.releasePreparedPlan(plan)
                        } catch (cleanupError: Throwable) {
                            error.addSuppressed(cleanupError)
                        }
                    }
                }
                throw error
            } catch (error: CancellationException) {
                recordApplyFailure(
                    runId,
                    run,
                    plan,
                    preview,
                    viewedHunkIds,
                    reviewDwellMillis,
                    error,
                    SwarmArtifactReviewAction.APPLY_CANCELED,
                )
                throw error
            } catch (error: Throwable) {
                recordApplyFailure(
                    runId,
                    run,
                    plan,
                    preview,
                    viewedHunkIds,
                    reviewDwellMillis,
                    error,
                    SwarmArtifactReviewAction.APPLY_FAILED,
                )
                throw error
            }
        }
    }

    suspend fun rejectArtifactIntegration(
        runId: String,
        planId: String,
        reason: SwarmArtifactRejectionReason,
        resolution: SwarmArtifactRejectionResolution,
        scopeMode: SwarmArtifactRevisionScopeMode = SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY,
        rejectedHunkIds: List<String> = emptyList(),
        reviewDwellMillis: Long = 0,
    ): Result<SwarmArtifactReviewEvent> = resultOf {
        validateReviewMetrics(reviewDwellMillis, 0, 0, 0, 0, rejectedHunkIds.size)
        integrationMutex.withLock {
            val integrator = checkNotNull(artifactIntegrator) { "Artifact integration is not configured" }
            val originalRun = checkNotNull(store.get(runId)) { "Swarm run not found: $runId" }
            val plan = checkNotNull(originalRun.artifactIntegrationPlans.firstOrNull { it.id == planId }) {
                "Artifact integration plan not found: $planId"
            }
            require(plan.status == SwarmArtifactIntegrationStatus.PREPARED) {
                "Only prepared artifact integration plans can be rejected"
            }
            val sourceTask = checkNotNull(originalRun.tasks.firstOrNull { it.id == plan.taskId }) {
                "Artifact source task not found: ${plan.taskId}"
            }
            val preview = integrator.preview(plan)
            val normalizedRejectedHunkIds = rejectedHunkIds.distinct()
            val hunksById = preview.hunks.associateBy { it.id }
            require(normalizedRejectedHunkIds.all(hunksById::containsKey)) {
                "Artifact rejection references an unknown diff hunk"
            }
            val viewedHunkIds = originalRun.artifactReviewEvents
                .asSequence()
                .filter { event ->
                    event.planId == planId && event.action in setOf(
                        SwarmArtifactReviewAction.COVERAGE_RECORDED,
                        SwarmArtifactReviewAction.CLOSED,
                    )
                }
                .flatMap { it.viewedHunkIds.asSequence() }
                .toSet()
            require(normalizedRejectedHunkIds.all(viewedHunkIds::contains)) {
                "Only viewed diff hunks can be targeted by rejection feedback"
            }

            val targetPaths = if (normalizedRejectedHunkIds.isEmpty()) {
                preview.changedPaths.map { it.path }.distinct()
            } else {
                normalizedRejectedHunkIds.mapNotNull { hunksById[it]?.path }.distinct()
            }
            val contextHunkIds = dependencyContextHunkIds(preview, normalizedRejectedHunkIds)
            val contextPaths = contextHunkIds.mapNotNull { hunksById[it]?.path }.distinct()
            val timestamp = now()
            val revisionContract = if (resolution == SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY) {
                SwarmArtifactRevisionContract(
                    id = "revision-contract-${UUID.randomUUID().toString().take(12)}",
                    sourcePlanId = plan.id,
                    sourceTaskId = sourceTask.id,
                    sourceAttempt = plan.attempt,
                    sourceArtifactRevision = plan.artifactRevision,
                    sourceArtifactTree = plan.artifactTree,
                    rejectionReason = reason,
                    scopeMode = scopeMode,
                    sourceWritePaths = sourceTask.writePaths,
                    targetHunkIds = normalizedRejectedHunkIds,
                    contextHunkIds = contextHunkIds,
                    targetPaths = targetPaths,
                    contextPaths = contextPaths,
                    createdAt = timestamp,
                )
            } else {
                null
            }
            val revisionTask = revisionContract?.let { contract ->
                buildArtifactRevisionTask(sourceTask, contract)
            }
            val event = reviewEvent(
                run = originalRun,
                plan = plan,
                action = SwarmArtifactReviewAction.REJECTED,
                dwellMillis = reviewDwellMillis,
                diffCharacterCount = preview.unifiedDiff.length,
                changedPathCount = preview.changedPaths.size,
                preview = preview,
                viewedHunkIds = viewedHunkIds.toList(),
                rejectionReason = reason,
                rejectionResolution = resolution,
                revisionScopeMode = revisionContract?.scopeMode,
                rejectedHunkIds = normalizedRejectedHunkIds,
                revisionContractId = revisionContract?.id,
                revisionTaskId = revisionTask?.id,
            )
            val discardedPlan = plan.copy(
                status = SwarmArtifactIntegrationStatus.DISCARDED,
                discardedAt = timestamp,
            )
            store.update(runId) { current ->
                require(current.artifactIntegrationPlans.any {
                    it.id == planId && it.status == SwarmArtifactIntegrationStatus.PREPARED
                }) { "Artifact integration plan changed while rejection was being recorded" }
                val updatedTasks = if (revisionTask == null) current.tasks else current.tasks + revisionTask
                SwarmGraph.validate(updatedTasks)
                current.copy(
                    status = if (revisionTask == null) current.status else SwarmRunStatus.CREATED,
                    updatedAt = timestamp,
                    tasks = updatedTasks,
                    artifactIntegrationPlans = current.artifactIntegrationPlans.map { existing ->
                        if (existing.id == planId) discardedPlan else existing
                    },
                ).appendReviewEvent(event, timestamp)
            }

            try {
                integrator.releasePreparedPlan(plan)
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        store.put(originalRun)
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }

            if (revisionTask != null) {
                try {
                    scheduler.start(runId)
                } catch (error: Throwable) {
                    withContext(NonCancellable) {
                        try {
                            store.update(runId) { current ->
                                current.copy(
                                    status = SwarmRunStatus.FAILED,
                                    updatedAt = now(),
                                    tasks = current.tasks.map { task ->
                                        if (task.id == revisionTask.id) {
                                            task.copy(
                                                status = SwarmTaskStatus.FAILED,
                                                errorMessage = error.message ?: "Revision scheduling failed",
                                                completedAt = now(),
                                            )
                                        } else {
                                            task
                                        }
                                    },
                                )
                            }
                        } catch (persistenceError: Throwable) {
                            error.addSuppressed(persistenceError)
                        }
                    }
                    throw error
                }
            }
            event
        }
    }

    suspend fun resolveAgent(task: SwarmTask): AgentConfig {
        return agentService.createDynamicAgent(task)
    }

    private suspend fun recordApplyFailure(
        runId: String,
        run: SwarmRun,
        plan: SwarmArtifactIntegrationPlan,
        preview: SwarmArtifactIntegrationPreview,
        viewedHunkIds: Set<String>,
        dwellMillis: Long,
        error: Throwable,
        action: SwarmArtifactReviewAction,
    ) {
        val event = reviewEvent(
            run = run,
            plan = plan,
            action = action,
            dwellMillis = dwellMillis,
            diffCharacterCount = preview.unifiedDiff.length,
            changedPathCount = preview.changedPaths.size,
            preview = preview,
            viewedHunkIds = viewedHunkIds.toList(),
            failureCategory = error::class.simpleName,
        )
        withContext(NonCancellable) {
            try {
                store.update(runId) { current -> current.appendReviewEvent(event, now()) }
            } catch (persistenceError: Throwable) {
                error.addSuppressed(persistenceError)
            }
        }
    }

    private fun reviewEvent(
        run: SwarmRun,
        plan: SwarmArtifactIntegrationPlan,
        action: SwarmArtifactReviewAction,
        dwellMillis: Long = 0,
        diffCharacterCount: Int = 0,
        changedPathCount: Int = 0,
        firstViewportMillis: Long = 0,
        viewportDwellMillis: Long = 0,
        preview: SwarmArtifactIntegrationPreview? = null,
        viewedHunkIds: List<String> = emptyList(),
        rejectionReason: SwarmArtifactRejectionReason? = null,
        rejectionResolution: SwarmArtifactRejectionResolution? = null,
        revisionScopeMode: SwarmArtifactRevisionScopeMode? = null,
        rejectedHunkIds: List<String> = emptyList(),
        revisionContractId: String? = null,
        revisionTaskId: String? = null,
        failureCategory: String? = null,
    ): SwarmArtifactReviewEvent {
        val knownViewedHunkIds = if (preview == null) {
            emptyList()
        } else {
            val knownIds = preview.hunks.mapTo(hashSetOf()) { it.id }
            viewedHunkIds.distinct().filter(knownIds::contains)
        }
        val highRiskHunkIds = preview?.hunks
            ?.filter { it.riskLevel == SwarmArtifactRiskLevel.HIGH }
            ?.mapTo(hashSetOf()) { it.id }
            .orEmpty()
        val totalHunkCount = preview?.hunks?.size ?: 0
        return SwarmArtifactReviewEvent(
            id = "review-${UUID.randomUUID().toString().take(12)}",
            runId = run.id,
            taskId = plan.taskId,
            planId = plan.id,
            action = action,
            occurredAt = now(),
            dwellMillis = dwellMillis,
            diffCharacterCount = diffCharacterCount,
            changedPathCount = changedPathCount,
            firstViewportMillis = firstViewportMillis,
            viewportDwellMillis = viewportDwellMillis,
            viewedHunkIds = knownViewedHunkIds,
            viewedHunkCount = knownViewedHunkIds.size,
            totalHunkCount = totalHunkCount,
            viewedHighRiskHunkCount = knownViewedHunkIds.count(highRiskHunkIds::contains),
            highRiskHunkCount = highRiskHunkIds.size,
            reviewCoveragePermille = if (totalHunkCount == 0) 1_000 else knownViewedHunkIds.size * 1_000 / totalHunkCount,
            rejectionReason = rejectionReason,
            rejectionResolution = rejectionResolution,
            revisionScopeMode = revisionScopeMode,
            rejectedHunkIds = rejectedHunkIds,
            revisionContractId = revisionContractId,
            revisionTaskId = revisionTaskId,
            failureCategory = failureCategory,
        )
    }

    private fun buildArtifactRevisionTask(
        sourceTask: SwarmTask,
        contract: SwarmArtifactRevisionContract,
    ): SwarmTask = SwarmTask(
        id = "revision-${sourceTask.id.take(32)}-${UUID.randomUUID().toString().take(8)}",
        title = "修订：${sourceTask.title}",
        prompt = buildArtifactRevisionPrompt(sourceTask, contract),
        role = SwarmAgentRole.IMPLEMENTER,
        agentId = null,
        dependsOn = listOf(sourceTask.id),
        readPaths = (
            sourceTask.readPaths + sourceTask.writePaths + contract.targetPaths + contract.contextPaths
        ).distinct(),
        writePaths = when (contract.scopeMode) {
            SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY -> contract.targetPaths
            SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE -> contract.sourceWritePaths
        },
        verificationCommands = sourceTask.verificationCommands,
        revisionContract = contract,
    )
}

private fun buildArtifactRevisionPrompt(
    sourceTask: SwarmTask,
    contract: SwarmArtifactRevisionContract,
): String = buildString {
    appendLine("Revise the rejected artifact from task ${contract.sourceTaskId}.")
    appendLine("The workspace is bound to artifact revision ${contract.sourceArtifactRevision} and tree ${contract.sourceArtifactTree}.")
    appendLine("Human review reason: ${contract.rejectionReason.name}.")
    appendLine("Revision write scope: ${contract.scopeMode.name}.")
    if (contract.targetPaths.isNotEmpty()) {
        appendLine("Review targets: ${contract.targetPaths.joinToString(", ")}.")
    }
    if (contract.targetHunkIds.isNotEmpty()) {
        appendLine("Target hunk evidence ids: ${contract.targetHunkIds.joinToString(", ")}.")
    }
    if (contract.contextHunkIds.isNotEmpty()) {
        appendLine("Dependency context hunk ids: ${contract.contextHunkIds.joinToString(", ")}.")
    }
    appendLine("Original task objective: ${sourceTask.prompt}")
    appendLine("Correct the rejected behavior at its root cause, preserve unrelated verified behavior, and do not expand scope.")
    appendLine("Run every declared verification command. A new artifact and fresh verification evidence are required.")
}

private fun dependencyContextHunkIds(
    preview: SwarmArtifactIntegrationPreview,
    targetHunkIds: List<String>,
): List<String> = SwarmArtifactRiskAnalyzer.prerequisiteClosure(preview.hunkDependencies, targetHunkIds)

private fun validateReviewMetrics(
    dwellMillis: Long,
    diffCharacterCount: Int,
    changedPathCount: Int,
    firstViewportMillis: Long,
    viewportDwellMillis: Long,
    viewedHunkCount: Int,
) {
    require(dwellMillis in 0..MAX_REVIEW_DWELL_MILLIS) { "Review dwell time is invalid" }
    require(diffCharacterCount in 0..MAX_REVIEW_DIFF_CHARACTERS) { "Review diff size is invalid" }
    require(changedPathCount in 0..MAX_REVIEW_CHANGED_PATHS) { "Review changed path count is invalid" }
    require(firstViewportMillis in 0..MAX_REVIEW_DWELL_MILLIS) { "Review first viewport time is invalid" }
    require(viewportDwellMillis in 0..MAX_REVIEW_DWELL_MILLIS) { "Review viewport dwell time is invalid" }
    require(viewedHunkCount in 0..MAX_REVIEW_HUNKS) { "Review hunk count is invalid" }
}

private fun SwarmRun.appendReviewEvent(event: SwarmArtifactReviewEvent, timestamp: kotlin.time.Instant): SwarmRun {
    require(artifactReviewEvents.size < MAX_REVIEW_EVENTS_PER_RUN) { "Swarm review evidence limit reached" }
    require(event.runId == id) { "Review evidence run does not match" }
    require(artifactIntegrationPlans.any { it.id == event.planId && it.taskId == event.taskId }) {
        "Review evidence references an unknown integration plan"
    }
    return copy(
        updatedAt = timestamp,
        artifactReviewEvents = artifactReviewEvents + event,
    )
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

private const val MAX_REVIEW_EVENTS_PER_RUN = 4_096
private const val MAX_REVIEW_DWELL_MILLIS = 24L * 60 * 60 * 1_000
private const val MAX_REVIEW_DIFF_CHARACTERS = 512 * 1024
private const val MAX_REVIEW_CHANGED_PATHS = 10_000
private const val MAX_REVIEW_HUNKS = 20_000
