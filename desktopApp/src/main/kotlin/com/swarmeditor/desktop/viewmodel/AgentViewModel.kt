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
import kotlinx.coroutines.launch

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

    // 设计稿示例 Agents（mvp-design-mockup.html · agents）：claude 在线，qwen 离线，其余待安装
    private val mockAgents = listOf(
        AgentInfo(id = "claude-code", name = "Claude Code", emoji = "🟣", color = AgentClaude, isConnected = true, version = "v1.2.3", isSelected = true, letter = "C"),
        AgentInfo(id = "qwen-code", name = "QwenCode", emoji = "🔵", color = AgentQwen, isConnected = false, version = "v0.8.1", isSelected = false, letter = "Q"),
        AgentInfo(id = "gemini-cli", name = "Gemini CLI", emoji = "🟢", color = AgentGemini, isConnected = false, version = "", isSelected = false, letter = "G"),
        AgentInfo(id = "kimi-code", name = "Kimi Code", emoji = "🟡", color = AgentKimi, isConnected = false, version = "", isSelected = false, letter = "K"),
        AgentInfo(id = "opencode", name = "OpenCode", emoji = "🟠", color = AgentOpenCode, isConnected = false, version = "", isSelected = false, letter = "O")
    )

    fun load() {
        scope.launch { _agents.value = mockAgents }
    }

    fun scan() {
        _isScanning.value = true
        scope.launch {
            _agents.value = mockAgents
            _isScanning.value = false
        }
    }

    fun connect(id: String) {
        scope.launch {
            _agents.value = _agents.value.map { if (it.id == id) it.copy(isConnected = true) else it }
        }
    }

    fun disconnect(id: String) {
        scope.launch {
            _agents.value = _agents.value.map { if (it.id == id) it.copy(isConnected = false) else it }
        }
    }

    fun selectAgent(id: String) {
        _agents.value = _agents.value.map { it.copy(isSelected = it.id == id) }
    }
}
