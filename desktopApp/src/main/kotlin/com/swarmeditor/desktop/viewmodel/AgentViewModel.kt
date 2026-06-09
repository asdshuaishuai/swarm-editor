package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AgentViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _agents = MutableStateFlow<List<AgentInfo>>(emptyList())
    val agents: StateFlow<List<AgentInfo>> = _agents
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning

    fun load() {
        scope.launch {
            val dtos = ApiClient.getAgents()
            if (dtos.isNotEmpty()) {
                _agents.value = dtos.map { dto ->
                    AgentInfo(
                        id = dto.config.id, name = dto.config.name,
                        emoji = agentEmoji(dto.config.agentType), color = agentColor(dto.config.agentType),
                        isConnected = dto.status == "connected", version = dto.version
                    )
                }
            }
        }
    }

    fun scan() {
        _isScanning.value = true
        scope.launch {
            val dtos = ApiClient.scanAgents()
            _agents.value = dtos.map { dto ->
                AgentInfo(
                    id = dto.config.id, name = dto.config.name,
                    emoji = agentEmoji(dto.config.agentType), color = agentColor(dto.config.agentType),
                    isConnected = dto.status == "connected", version = dto.version
                )
            }
            _isScanning.value = false
        }
    }

    fun connect(id: String) {
        scope.launch {
            _agents.value = _agents.value.map { if (it.id == id) it.copy(isConnected = false) else it }
            val result = ApiClient.connectAgent(id)
            if (result.error == null) {
                _agents.value = _agents.value.map { if (it.id == id) it.copy(isConnected = true) else it }
            }
            load()
        }
    }

    fun disconnect(id: String) {
        scope.launch {
            ApiClient.disconnectAgent(id)
            _agents.value = _agents.value.map { if (it.id == id) it.copy(isConnected = false) else it }
        }
    }

    fun selectAgent(id: String) {
        _agents.value = _agents.value.map { it.copy(isSelected = it.id == id) }
    }

    private fun agentEmoji(type: String) = when (type) {
        "CLAUDE_CODE" -> "🟣"; "QWEN_CODE" -> "🔵"; "GEMINI_CLI" -> "🟢"
        "KIMI_CODE" -> "🟡"; "OPEN_CODE" -> "🟠"; else -> "⚪"
    }

    private fun agentColor(type: String) = when (type) {
        "CLAUDE_CODE" -> Pr; "QWEN_CODE" -> Ac; "GEMINI_CLI" -> Gn
        "KIMI_CODE" -> Gd; "OPEN_CODE" -> Or; else -> Tx3
    }
}
