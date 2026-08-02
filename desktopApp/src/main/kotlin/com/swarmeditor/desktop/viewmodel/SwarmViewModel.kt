package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.SwarmService
import com.swarmeditor.backend.swarm.SwarmArtifactIntegrationStaleException
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRejectionResolution
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmArtifactReviewAction
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.common.model.SwarmRun
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

class SwarmViewModel(
    private val service: SwarmService,
    private val scope: CoroutineScope,
) {
    val runs: StateFlow<List<SwarmRun>> = service.runs
    private val _artifactReview = MutableStateFlow<SwarmArtifactIntegrationPreview?>(null)
    val artifactReview: StateFlow<SwarmArtifactIntegrationPreview?> = _artifactReview.asStateFlow()
    private val _artifactSelectionPreview = MutableStateFlow<SwarmArtifactSelectionPreview?>(null)
    val artifactSelectionPreview: StateFlow<SwarmArtifactSelectionPreview?> = _artifactSelectionPreview.asStateFlow()
    private val _artifactActionRunning = MutableStateFlow(false)
    val artifactActionRunning: StateFlow<Boolean> = _artifactActionRunning.asStateFlow()
    private val eventChannel = Channel<ToastData>(Channel.BUFFERED)
    val events: Flow<ToastData> = eventChannel.receiveAsFlow()
    private val artifactAppliedChannel = Channel<Unit>(Channel.BUFFERED)
    val artifactApplied: Flow<Unit> = artifactAppliedChannel.receiveAsFlow()
    private var reviewSession: ArtifactReviewSession? = null

    fun createAndStart(objective: String, agentId: String?) {
        scope.launch {
            val normalized = objective.trim()
            if (normalized.isEmpty()) {
                eventChannel.send(ToastData(message = "请输入蜂群目标", type = ToastType.ERROR))
                return@launch
            }
            eventChannel.send(ToastData(message = "Pi 正在规划蜂群兵团", type = ToastType.INFO))
            service.createPlannedRun(
                title = normalized.take(48),
                objective = normalized,
                preferredPlannerAgentId = agentId,
            ).fold(
                onSuccess = { run ->
                    service.start(run.id).fold(
                        onSuccess = { eventChannel.send(ToastData(message = "蜂群已启动", type = ToastType.SUCCESS)) },
                        onFailure = { eventChannel.send(ToastData(message = it.message ?: "蜂群启动失败", type = ToastType.ERROR)) },
                    )
                },
                onFailure = { eventChannel.send(ToastData(message = it.message ?: "蜂群创建失败", type = ToastType.ERROR)) },
            )
        }
    }

    fun cancel(runId: String) {
        scope.launch {
            service.cancel(runId).fold(
                onSuccess = { eventChannel.send(ToastData(message = "蜂群已取消", type = ToastType.INFO)) },
                onFailure = { eventChannel.send(ToastData(message = it.message ?: "蜂群取消失败", type = ToastType.ERROR)) },
            )
        }
    }

    fun retry(runId: String) {
        scope.launch {
            service.retry(runId).fold(
                onSuccess = { eventChannel.send(ToastData(message = "失败任务已重新调度", type = ToastType.SUCCESS)) },
                onFailure = { eventChannel.send(ToastData(message = it.message ?: "蜂群重试失败", type = ToastType.ERROR)) },
            )
        }
    }

    fun reviewArtifact(runId: String, taskId: String, preparedPlanId: String? = null) {
        scope.launch {
            if (_artifactActionRunning.value) return@launch
            _artifactActionRunning.value = true
            try {
                closeReviewSessionIfPresent()
                _artifactSelectionPreview.value = null
                val planId = preparedPlanId ?: service.prepareArtifactIntegration(runId, taskId).getOrThrow().id
                val preview = service.previewArtifactIntegration(runId, planId).getOrThrow()
                service.recordArtifactReviewObservation(
                    runId = runId,
                    planId = planId,
                    action = SwarmArtifactReviewAction.OPENED,
                    diffCharacterCount = preview.unifiedDiff.length,
                    changedPathCount = preview.changedPaths.size,
                ).getOrThrow()
                reviewSession = ArtifactReviewSession(runId, planId, System.nanoTime())
                _artifactReview.value = preview
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(ToastData(message = error.message ?: "无法生成变更审查", type = ToastType.ERROR))
            } finally {
                _artifactActionRunning.value = false
            }
        }
    }

    fun applyArtifact(runId: String, planId: String) {
        scope.launch {
            if (_artifactActionRunning.value) return@launch
            _artifactActionRunning.value = true
            try {
                val session = reviewSession
                    ?.takeIf { it.runId == runId && it.planId == planId }
                val coverage = session?.coverage() ?: ArtifactReviewCoverage()
                service.recordArtifactReviewObservation(
                    runId = runId,
                    planId = planId,
                    action = SwarmArtifactReviewAction.COVERAGE_RECORDED,
                    dwellMillis = coverage.dwellMillis,
                    firstViewportMillis = coverage.firstViewportMillis,
                    viewportDwellMillis = coverage.viewportDwellMillis,
                    viewedHunkIds = coverage.viewedHunkIds,
                ).getOrThrow()
                service.applyArtifactIntegration(runId, planId, coverage.dwellMillis).getOrThrow()
                _artifactReview.value = service.previewArtifactIntegration(runId, planId).getOrThrow()
                _artifactSelectionPreview.value = null
                reviewSession = ArtifactReviewSession(runId, planId, System.nanoTime())
                artifactAppliedChannel.send(Unit)
                eventChannel.send(ToastData(message = "已将验证通过的变更应用到工作区", type = ToastType.SUCCESS))
            } catch (error: CancellationException) {
                throw error
            } catch (error: SwarmArtifactIntegrationStaleException) {
                _artifactReview.value = null
                _artifactSelectionPreview.value = null
                reviewSession = null
                eventChannel.send(
                    ToastData(
                        message = "工作区已变化，旧审查计划已废弃；请重新生成审查",
                        type = ToastType.INFO,
                    )
                )
            } catch (error: Throwable) {
                eventChannel.send(ToastData(message = error.message ?: "应用变更失败", type = ToastType.ERROR))
            } finally {
                _artifactActionRunning.value = false
            }
        }
    }

    fun observeArtifactReviewViewport(runId: String, planId: String, visibleHunkIds: Set<String>) {
        reviewSession
            ?.takeIf { it.runId == runId && it.planId == planId }
            ?.observe(visibleHunkIds)
    }

    fun rejectArtifact(
        runId: String,
        planId: String,
        reason: SwarmArtifactRejectionReason,
        resolution: SwarmArtifactRejectionResolution,
        scopeMode: SwarmArtifactRevisionScopeMode,
        rejectedHunkIds: Set<String>,
    ) {
        scope.launch {
            if (_artifactActionRunning.value) return@launch
            _artifactActionRunning.value = true
            try {
                val session = reviewSession
                    ?.takeIf { it.runId == runId && it.planId == planId }
                val coverage = session?.coverage() ?: ArtifactReviewCoverage()
                service.recordArtifactReviewObservation(
                    runId = runId,
                    planId = planId,
                    action = SwarmArtifactReviewAction.COVERAGE_RECORDED,
                    dwellMillis = coverage.dwellMillis,
                    firstViewportMillis = coverage.firstViewportMillis,
                    viewportDwellMillis = coverage.viewportDwellMillis,
                    viewedHunkIds = coverage.viewedHunkIds,
                ).getOrThrow()
                val event = service.rejectArtifactIntegration(
                    runId = runId,
                    planId = planId,
                    reason = reason,
                    resolution = resolution,
                    scopeMode = scopeMode,
                    rejectedHunkIds = rejectedHunkIds.toList(),
                    reviewDwellMillis = coverage.dwellMillis,
                ).getOrThrow()
                _artifactReview.value = null
                _artifactSelectionPreview.value = null
                reviewSession = null
                eventChannel.send(
                    ToastData(
                        message = if (event.revisionTaskId != null) {
                            "已退回变更，Pi 正从被拒绝的 artifact 启动修订与重新验证"
                        } else {
                            "已放弃该变更计划"
                        },
                        type = ToastType.INFO,
                    )
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(ToastData(message = error.message ?: "拒绝变更失败", type = ToastType.ERROR))
            } finally {
                _artifactActionRunning.value = false
            }
        }
    }

    fun previewArtifactSelection(runId: String, planId: String, selectedHunkIds: Set<String>) {
        scope.launch {
            if (_artifactActionRunning.value || selectedHunkIds.isEmpty()) return@launch
            _artifactActionRunning.value = true
            try {
                val selection = service.previewArtifactSelection(
                    runId = runId,
                    planId = planId,
                    selectedHunkIds = selectedHunkIds,
                ).getOrThrow()
                if (_artifactReview.value?.planId == planId) {
                    _artifactSelectionPreview.value = selection
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(
                    ToastData(message = error.message ?: "无法检查所选修订范围", type = ToastType.ERROR)
                )
            } finally {
                _artifactActionRunning.value = false
            }
        }
    }

    fun closeArtifactReview() {
        val session = reviewSession
        reviewSession = null
        _artifactReview.value = null
        _artifactSelectionPreview.value = null
        if (session != null) {
            scope.launch {
                val coverage = session.coverage()
                service.recordArtifactReviewObservation(
                    runId = session.runId,
                    planId = session.planId,
                    action = SwarmArtifactReviewAction.CLOSED,
                    dwellMillis = coverage.dwellMillis,
                    firstViewportMillis = coverage.firstViewportMillis,
                    viewportDwellMillis = coverage.viewportDwellMillis,
                    viewedHunkIds = coverage.viewedHunkIds,
                ).onFailure { error ->
                    eventChannel.send(
                        ToastData(
                            message = error.message ?: "审查证据保存失败",
                            type = ToastType.ERROR,
                        )
                    )
                }
            }
        }
    }

    private suspend fun closeReviewSessionIfPresent() {
        val session = reviewSession ?: return
        val coverage = session.coverage()
        service.recordArtifactReviewObservation(
            runId = session.runId,
            planId = session.planId,
            action = SwarmArtifactReviewAction.CLOSED,
            dwellMillis = coverage.dwellMillis,
            firstViewportMillis = coverage.firstViewportMillis,
            viewportDwellMillis = coverage.viewportDwellMillis,
            viewedHunkIds = coverage.viewedHunkIds,
        ).getOrThrow()
        reviewSession = null
        _artifactReview.value = null
    }

}

private class ArtifactReviewSession(
    val runId: String,
    val planId: String,
    private val openedAtNanos: Long,
) {
    private val viewedHunkIds = linkedSetOf<String>()
    private var visibleHunkIds = emptySet<String>()
    private var firstViewportAtNanos: Long? = null
    private var lastVisibilityUpdateNanos = openedAtNanos
    private var viewportDwellNanos = 0L

    fun observe(hunkIds: Set<String>, nowNanos: Long = System.nanoTime()) {
        accumulateViewportDwell(nowNanos)
        val normalized = hunkIds.filterTo(linkedSetOf()) { it.isNotBlank() }
        if (normalized.isNotEmpty() && firstViewportAtNanos == null) firstViewportAtNanos = nowNanos
        viewedHunkIds += normalized
        visibleHunkIds = normalized
        lastVisibilityUpdateNanos = nowNanos
    }

    fun coverage(nowNanos: Long = System.nanoTime()): ArtifactReviewCoverage {
        accumulateViewportDwell(nowNanos)
        lastVisibilityUpdateNanos = nowNanos
        return ArtifactReviewCoverage(
            dwellMillis = elapsedMillis(nowNanos),
            firstViewportMillis = firstViewportAtNanos
                ?.let { elapsedMillis(it) }
                ?: 0,
            viewportDwellMillis = nanosToBoundedMillis(viewportDwellNanos),
            viewedHunkIds = viewedHunkIds.toList(),
        )
    }

    private fun accumulateViewportDwell(nowNanos: Long) {
        if (visibleHunkIds.isNotEmpty()) {
            viewportDwellNanos += (nowNanos - lastVisibilityUpdateNanos).coerceAtLeast(0L)
        }
    }

    private fun elapsedMillis(nowNanos: Long): Long =
        nanosToBoundedMillis((nowNanos - openedAtNanos).coerceAtLeast(0L))
}

private data class ArtifactReviewCoverage(
    val dwellMillis: Long = 0,
    val firstViewportMillis: Long = 0,
    val viewportDwellMillis: Long = 0,
    val viewedHunkIds: List<String> = emptyList(),
)

private fun nanosToBoundedMillis(nanos: Long): Long =
    (nanos / 1_000_000L).coerceIn(0, MAX_REVIEW_SESSION_MILLIS)

private const val MAX_REVIEW_SESSION_MILLIS = 24L * 60 * 60 * 1_000
