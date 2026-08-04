package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.desktop.AgentInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

data class AgentActionEvent(val message: String, val type: ToastType)

class AgentViewModel(
    private val service: AgentService,
    private val scope: CoroutineScope,
) {
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning
    private val eventChannel = Channel<AgentActionEvent>(Channel.BUFFERED)
    val events = eventChannel.receiveAsFlow()

    val agents: StateFlow<List<AgentInfo>> = service.agents
        .map { agents -> agents.map { it.toUiAgent() } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    val selectedAgent: StateFlow<AgentInfo?> = agents
        .map { it.firstOrNull() }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), null)

    val onlineCount: StateFlow<Int> = agents
        .map { list -> list.count { it.isConnected } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), 0)

    fun load() = scan()

    fun scan() {
        scope.launch {
            _isScanning.value = true
            try {
                service.scan().fold(
                    onSuccess = {},
                    onFailure = { error ->
                        eventChannel.send(AgentActionEvent(error.message ?: "主智能体扫描失败", ToastType.ERROR))
                    }
                )
            } finally {
                _isScanning.value = false
            }
        }
    }

    fun connect(id: String) {
        scope.launch {
            service.connect(id).fold(
                onSuccess = { eventChannel.send(AgentActionEvent("主智能体已连接", ToastType.SUCCESS)) },
                onFailure = { eventChannel.send(AgentActionEvent(it.message ?: "主智能体连接失败", ToastType.ERROR)) }
            )
        }
    }

    fun disconnect(id: String) {
        scope.launch {
            service.disconnect(id).fold(
                onSuccess = { eventChannel.send(AgentActionEvent("主智能体已断开", ToastType.INFO)) },
                onFailure = { eventChannel.send(AgentActionEvent(it.message ?: "主智能体断开失败", ToastType.ERROR)) }
            )
        }
    }

}
