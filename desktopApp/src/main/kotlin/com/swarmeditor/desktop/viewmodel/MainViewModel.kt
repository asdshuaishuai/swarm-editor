package com.swarmeditor.desktop.viewmodel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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

    private val _currentView = MutableStateFlow("chat")
    val currentView: StateFlow<String> = _currentView

    private val _showCmdK = MutableStateFlow(false)
    val showCmdK: StateFlow<Boolean> = _showCmdK

    private val _toasts = MutableStateFlow<List<ToastData>>(emptyList())
    val toasts: StateFlow<List<ToastData>> = _toasts

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
            val newToast = ToastData(message = message, type = type)
            val updated = (_toasts.value + newToast).takeLast(3)
            _toasts.value = updated
        }
    }

    fun dismissToast(id: String) {
        _toasts.value = _toasts.value.filter { it.id != id }
    }

    fun showAgentConfigDialog(agentId: String) {
        _showAgentConfig.value = agentId
    }

    fun dismissAgentConfigDialog() {
        _showAgentConfig.value = null
    }
}
