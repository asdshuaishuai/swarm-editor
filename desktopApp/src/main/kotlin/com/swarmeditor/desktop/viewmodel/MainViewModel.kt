package com.swarmeditor.desktop.viewmodel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.util.UUID

enum class ToastType {
    INFO, SUCCESS, ERROR
}

data class ToastData(
    val id: String = UUID.randomUUID().toString(),
    val message: String,
    val type: ToastType = ToastType.INFO,
    val createdAt: Long = System.currentTimeMillis()
)

class MainViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)

    private val _currentView = MutableStateFlow(
        System.getProperty("swarm.view")?.takeIf { it.isNotBlank() } ?: "chat"
    )
    val currentView: StateFlow<String> = _currentView

    private val _showCmdK = MutableStateFlow(false)
    val showCmdK: StateFlow<Boolean> = _showCmdK

    // Toast 改为 Channel（compose-skill：one-shot 事件用 Channel 而非 StateFlow）
    private val _toastChannel = Channel<ToastData>(Channel.BUFFERED)
    val toastEvents = _toastChannel.receiveAsFlow()

    private val _showAgentConfig = MutableStateFlow<String?>(null)
    val showAgentConfig: StateFlow<String?> = _showAgentConfig

    fun switchView(view: String) {
        _currentView.value = view
    }

    fun toggleCmdK() {
        _showCmdK.value = !_showCmdK.value
    }

    fun showCmdKDialog() {
        _showCmdK.value = true
    }

    fun hideCmdKDialog() {
        _showCmdK.value = false
    }

    fun showToast(message: String, type: ToastType = ToastType.INFO) {
        scope.launch {
            _toastChannel.send(ToastData(message = message, type = type))
        }
    }

    fun dismissToast(id: String) {
        // Channel 模式下无需手动 dismiss（ToastHost 自动超时移除）
    }

    fun showAgentConfigDialog(agentId: String) {
        _showAgentConfig.value = agentId
    }

    fun dismissAgentConfigDialog() {
        _showAgentConfig.value = null
    }
}
