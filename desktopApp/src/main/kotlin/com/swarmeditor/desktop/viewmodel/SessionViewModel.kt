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

    /** 当前会话标题（业务逻辑，不在 composable 中 find） */
    val currentSessionTitle: StateFlow<String?> = combine(_sessions, _currentSessionId) { list, id ->
        list.find { it.id == id }?.title
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), null)

    private val now = System.currentTimeMillis()

    // 设计稿示例会话（mvp-design-mockup.html · chats，按 今天/昨天/本周 分组）
    private val mockSessions = listOf(
        UiSession("sess-1", "claude-code", "重构 ACP 协议层", true, createdAt = now - 2 * 60_000L, messageCount = 4),
        UiSession("sess-2", "claude-code", "修复 MCP 配置同步", false, createdAt = now - 3_600_000L, messageCount = 2),
        UiSession("sess-3", "qwen-code", "分析项目架构", false, createdAt = now - 3 * 3_600_000L, messageCount = 1),
        UiSession("sess-4", "claude-code", "创建 Gradle 项目骨架", false, createdAt = now - 86_400_000L, messageCount = 6),
        UiSession("sess-5", "qwen-code", "配置 QwenCode 环境", false, createdAt = now - 90_000_000L, messageCount = 3),
        UiSession("sess-6", "claude-code", "设计 Swarm 协议", false, createdAt = now - 3L * 86_400_000L, messageCount = 8)
    )

    // 设计稿示例对话（mvp-design-mockup.html · view-chat：用户提问 + Claude Code 带 工具卡/代码卡 + QwenCode 审查中）
    private val sampleConversation = listOf(
        UiMessage(
            id = "m1", isUser = true,
            text = "帮我重构 ACP 协议层，使用官方 SDK 封装连接管理。重点关注连接池、断线重连和并发安全。",
            timestamp = "17:08"
        ),
        UiMessage(
            id = "m2", isUser = false,
            text = "我已经分析了当前 ACP 实现。现有代码缺少连接生命周期管理，建议拆分为 `AcpConnectionManager` + `AcpSession` 两层。\n\n我建议创建以下类结构，先写 `ConnectionManager`：",
            role = "AGENT",
            timestamp = "17:09",
            agentId = "claude-code",
            toolCards = listOf(
                ToolCardData(
                    title = "探索项目", iconType = "search",
                    duration = "1 search, 1 file · 420ms",
                    output = "\$ grep \"class AcpConnection\" src/\n→ src/main/kotlin/AcpClient.kt:24\n→ src/main/kotlin/legacy/OldAcp.kt:8",
                    resultOk = true, resultDuration = "",
                    showResult = false
                ),
                ToolCardData(
                    title = "编译验证", iconType = "terminal",
                    duration = "./gradlew :backend:compileKotlin",
                    output = "BUILD SUCCESSFUL in 2.3s\n3 actionable tasks: 3 executed",
                    resultOk = true, resultDuration = "2.3s · 0 warnings"
                )
            ),
            codeCards = listOf(
                CodeCardData(
                    filename = "AcpConnectionManager.kt", extension = "kt",
                    additions = 45, deletions = 12,
                    diffLines = listOf(
                        DiffLine(DiffLineType.ADD, null, 1, "class AcpConnectionManager {"),
                        DiffLine(DiffLineType.ADD, null, 2, "    private val connections = mutableMapOf<String, AcpConnection>()"),
                        DiffLine(DiffLineType.ADD, null, 3, "    private val mutex = Mutex()"),
                        DiffLine(DiffLineType.ADD, null, 4, ""),
                        DiffLine(DiffLineType.ADD, null, 5, "    suspend fun connect(config: AgentConfig): AcpConnection {"),
                        DiffLine(DiffLineType.ADD, null, 6, "        return mutex.withLock {"),
                        DiffLine(DiffLineType.ADD, null, 7, "            connections.getOrPut(config.id) {"),
                        DiffLine(DiffLineType.ADD, null, 8, "                val adapter = AgentAdapterFactory.create(config.agentType)"),
                        DiffLine(DiffLineType.ADD, null, 9, "                AcpConnection(config.id, adapter.spawn())"),
                        DiffLine(DiffLineType.ADD, null, 10, "            }"),
                        DiffLine(DiffLineType.ADD, null, 11, "        }"),
                        DiffLine(DiffLineType.ADD, null, 12, "    }"),
                        DiffLine(DiffLineType.ADD, null, 13, "}")
                    )
                )
            )
        ),
        UiMessage(
            id = "m3", isUser = false,
            text = "正在审查变更",
            role = "REVIEWING",
            timestamp = "现在",
            isThinking = true,
            agentId = "qwen-code"
        )
    )

    fun loadSessions() {
        scope.launch {
            _sessions.value = mockSessions
            // 默认选中并展示示例会话，使打开即与设计稿一致
            _currentSessionId.value = "sess-1"
            _messages.value = sampleConversation
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
            _messages.value = sampleConversation
        }
    }

    fun sendMessage(text: String, agentId: String) {
        if (text.isBlank()) return
        val sessionId = _currentSessionId.value
        _isSending.value = true
        scope.launch {
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
