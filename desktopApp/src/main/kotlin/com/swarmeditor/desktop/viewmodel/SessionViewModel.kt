package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.ui.chat.CodeCardData
import com.swarmeditor.desktop.ui.chat.ToolCardData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class UiMessage(
    val id: String,
    val isUser: Boolean,
    val text: String,
    val activities: List<UiActivity> = emptyList(),
    val toolCards: List<ToolCardData> = emptyList(),
    val codeCards: List<CodeCardData> = emptyList(),
    val isThinking: Boolean = false,
    val role: String? = null
)

data class UiActivity(val icon: String, val label: String, val detail: String, val isOk: Boolean = false)

data class UiSession(
    val id: String,
    val agentId: String,
    val title: String,
    val isActive: Boolean,
    val createdAt: Long = System.currentTimeMillis(),
    val messageCount: Int = 0
)

class SessionViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _sessions = MutableStateFlow<List<UiSession>>(emptyList())
    val sessions: StateFlow<List<UiSession>> = _sessions
    private val _currentSessionId = MutableStateFlow<String?>(null)
    val currentSessionId: StateFlow<String?> = _currentSessionId
    private val _messages = MutableStateFlow<List<UiMessage>>(emptyList())
    val messages: StateFlow<List<UiMessage>> = _messages
    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending

    fun loadSessions() {
        scope.launch {
            val dtos = ApiClient.getSessions()
            _sessions.value = dtos.map { UiSession(it.id, it.agentId, it.id, it.status == "active") }
        }
    }

    fun createSession(agentId: String) {
        scope.launch {
            val dto = ApiClient.createSession(agentId, "新会话")
            if (dto != null) {
                _sessions.value = _sessions.value + UiSession(dto.id, dto.agentId, dto.id, true)
                selectSession(dto.id)
            }
        }
    }

    fun selectSession(id: String) {
        _currentSessionId.value = id
        scope.launch {
            val dtos = ApiClient.getSessions()
            val session = dtos.find { it.id == id }
            if (session != null) {
                _messages.value = session.messages.map { msg ->
                    UiMessage(msg.id, msg.role == "user", msg.content.firstOrNull()?.text ?: "")
                }
            }
        }
    }

    fun sendMessage(text: String, agentId: String) {
        if (text.isBlank()) return
        val sessionId = _currentSessionId.value
        _isSending.value = true
        scope.launch {
            // 确保有会话
            val sid = sessionId ?: run {
                val dto = ApiClient.createSession(agentId, text.take(20))
                if (dto != null) {
                    _sessions.value = _sessions.value + UiSession(dto.id, dto.agentId, dto.id, true)
                    _currentSessionId.value = dto.id
                    dto.id
                } else {
                    _isSending.value = false
                    return@launch
                }
            }
            // 添加用户消息到 UI
            _messages.value = _messages.value + UiMessage(System.currentTimeMillis().toString(), true, text)
            // 发送到后端
            val result = ApiClient.sendMessage(sid, text)
            if (result.error == null) {
                // 重新加载会话获取 Agent 响应
                val dtos = ApiClient.getSessions()
                val session = dtos.find { it.id == sid }
                if (session != null) {
                    _messages.value = session.messages.map { msg ->
                        UiMessage(msg.id, msg.role == "user", msg.content.firstOrNull()?.text ?: "")
                    }
                }
            } else {
                _messages.value = _messages.value + UiMessage(
                    System.currentTimeMillis().toString(), false, "错误: ${result.error}",
                    listOf(UiActivity("❌", "错误", result.error ?: "unknown"))
                )
            }
            _isSending.value = false
        }
    }
}
