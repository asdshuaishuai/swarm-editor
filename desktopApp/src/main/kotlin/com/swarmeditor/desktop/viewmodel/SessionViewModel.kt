package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.ui.chat.CodeCardData
import com.swarmeditor.desktop.ui.chat.DiffLine
import com.swarmeditor.desktop.ui.chat.DiffLineType
import com.swarmeditor.desktop.ui.chat.ToolCardData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@androidx.compose.runtime.Immutable
data class UiMessage(
    val id: String,
    val isUser: Boolean,
    val text: String,
    val activities: List<UiActivity> = emptyList(),
    val toolCards: List<ToolCardData> = emptyList(),
    val codeCards: List<CodeCardData> = emptyList(),
    val isThinking: Boolean = false,
    val role: String? = null,
    val timestamp: String = "刚刚",
    val agentId: String? = null
)

@androidx.compose.runtime.Immutable
data class UiActivity(val icon: String, val label: String, val detail: String, val isOk: Boolean = false)

@androidx.compose.runtime.Immutable
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

    val currentSessionTitle: StateFlow<String?> = combine(_sessions, _currentSessionId) { list, id ->
        list.find { it.id == id }?.title
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), null)

    fun loadSessions() {
        scope.launch {
            _sessions.value = demoSessions
            _currentSessionId.value = "sess-1"
            _messages.value = demoConversation
        }
    }

    fun createSession(agentId: String) {
        scope.launch {
            val newSession = UiSession(
                id = "sess-${System.currentTimeMillis()}",
                agentId = agentId,
                title = "New session",
                isActive = true
            )
            _sessions.value = _sessions.value + newSession
            selectSession(newSession.id)
        }
    }

    fun selectSession(id: String) {
        _currentSessionId.value = id
        scope.launch {
            _messages.value = demoConversation
        }
    }

    // W1: cancelPrevious — 快速连续发送时取消上一个未完成的回复
    private var sendJob: kotlinx.coroutines.Job? = null

    fun sendMessage(text: String, agentId: String) {
        if (text.isBlank()) return
        sendJob?.cancel()
        val sessionId = _currentSessionId.value
        _isSending.value = true
        sendJob = scope.launch {
            val sid = sessionId ?: run {
                val dto = UiSession(
                    id = "sess-${System.currentTimeMillis()}",
                    agentId = agentId,
                    title = text.take(20),
                    isActive = true
                )
                _sessions.value = _sessions.value + dto
                _currentSessionId.value = dto.id
                dto.id
            }
            _messages.value = _messages.value + UiMessage(
                id = "msg-${System.currentTimeMillis()}",
                isUser = true,
                text = text
            )
            // Simulate agent response delay
            kotlinx.coroutines.delay(1200)
            _messages.value = _messages.value + UiMessage(
                id = "msg-${System.currentTimeMillis() + 1}",
                isUser = false,
                text = "I've processed your request: \"$text\". Here's the result...",
                role = "AGENT"
            )
            _isSending.value = false
        }
    }
}
