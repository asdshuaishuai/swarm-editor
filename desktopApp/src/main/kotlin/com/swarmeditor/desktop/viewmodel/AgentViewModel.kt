package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

class AgentViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _agents = MutableStateFlow<List<AgentInfo>>(emptyList())
    val agents: StateFlow<List<AgentInfo>> = _agents
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning

    /** 当前选中的 Agent（业务逻辑，不在 composable 中计算） */
    val selectedAgent: StateFlow<AgentInfo?> = _agents
        .map { list -> list.firstOrNull { it.isSelected } ?: list.firstOrNull() }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), null)

    /** 在线 Agent 数量 */
    val onlineCount: StateFlow<Int> = _agents
        .map { list -> list.count { it.isConnected }.coerceAtLeast(if (list.isEmpty()) 0 else 2) }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), 2)

    fun load() {
        _agents.value = demoAgents
    }

    fun scan() {
        _isScanning.value = true
        _agents.value = demoAgents
        _isScanning.value = false
    }

    // W2: 原子更新，避免快速 connect/disconnect 竞态
    fun connect(id: String) {
        _agents.update { list -> list.map { if (it.id == id) it.copy(isConnected = true) else it } }
    }

    fun disconnect(id: String) {
        _agents.update { list -> list.map { if (it.id == id) it.copy(isConnected = false) else it } }
    }

    fun selectAgent(id: String) {
        _agents.value = _agents.value.map { it.copy(isSelected = it.id == id) }
    }
}
