package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.SwarmService
import com.swarmeditor.common.model.SwarmRun
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

class SwarmViewModel(
    private val service: SwarmService,
    private val scope: CoroutineScope,
) {
    val runs: StateFlow<List<SwarmRun>> = service.runs
    private val eventChannel = Channel<ToastData>(Channel.BUFFERED)
    val events: Flow<ToastData> = eventChannel.receiveAsFlow()

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

}
