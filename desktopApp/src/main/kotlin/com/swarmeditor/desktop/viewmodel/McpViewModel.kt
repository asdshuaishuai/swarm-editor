package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.desktop.api.McpServerDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class McpActionEvent(val message: String, val type: ToastType)

class McpViewModel(
    private val service: McpService,
    runtimeState: StateFlow<PiSessionState?>,
    scope: CoroutineScope
) {
    private val scope = scope
    private val eventChannel = Channel<McpActionEvent>(Channel.BUFFERED)
    val events = eventChannel.receiveAsFlow()

    val servers: StateFlow<List<McpServerDto>> = combine(service.servers, runtimeState) { servers, state ->
        servers.map { it.toDto(state) }
    }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun load() {
        reload(notifySuccess = false)
    }

    fun reload() {
        reload(notifySuccess = true)
    }

    fun upsert(server: McpServerDto) {
        launchAction("MCP 配置已保存；重启当前会话后生效", "MCP 配置保存失败") {
            service.upsert(server.toConfig())
        }
    }

    fun delete(id: String) {
        launchAction("MCP 配置已删除；重启当前会话后卸载工具", "MCP 配置删除失败", ToastType.INFO) {
            service.delete(id)
        }
    }

    private fun reload(notifySuccess: Boolean) {
        launchAction(
            successMessage = "MCP 配置已刷新并扫描用户配置",
            failureMessage = "MCP 配置刷新失败",
            notifySuccess = notifySuccess
        ) { service.reload() }
    }

    private fun launchAction(
        successMessage: String,
        failureMessage: String,
        successType: ToastType = ToastType.SUCCESS,
        notifySuccess: Boolean = true,
        action: suspend () -> Result<Unit>
    ) {
        scope.launch {
            try {
                action().fold(
                    onSuccess = {
                        if (notifySuccess) eventChannel.send(McpActionEvent(successMessage, successType))
                    },
                    onFailure = { error ->
                        eventChannel.send(McpActionEvent(error.message ?: failureMessage, ToastType.ERROR))
                    }
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(McpActionEvent(error.message ?: failureMessage, ToastType.ERROR))
            }
        }
    }
}
