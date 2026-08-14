package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ConversationGateway
import com.swarmeditor.backend.service.ConversationEvent
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.backend.pi.PiCommandInfo
import com.swarmeditor.backend.pi.PiExtensionUiRequest
import com.swarmeditor.backend.pi.PiExtensionUiResponse
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.backend.pi.PiQueuedMessageMode
import com.swarmeditor.backend.pi.PiSessionTree
import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Session
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ToolExecution
import com.swarmeditor.desktop.ui.chat.ToolCardData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.File
import java.util.Base64

@androidx.compose.runtime.Immutable
data class UiMessage(
    val id: String,
    val isUser: Boolean,
    val text: String,
    val activities: List<UiActivity> = emptyList(),
    val toolCards: List<ToolCardData> = emptyList(),
    val codeCards: List<com.swarmeditor.desktop.ui.chat.CodeCardData> = emptyList(),
    val isThinking: Boolean = false,
    val role: String? = null,
    val timestamp: String = "刚刚",
    val agentId: String? = null,
    val attachments: List<UiImageAttachment> = emptyList()
)

@androidx.compose.runtime.Immutable
data class UiImageAttachment(
    val id: String,
    val path: String,
    val name: String,
    val mimeType: String,
    val sizeBytes: Long,
    val base64: String? = null,
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

@androidx.compose.runtime.Immutable
data class UiChatPresentation(
    val title: String?,
    val messages: List<UiMessage>
)

data class SessionActionEvent(val message: String, val type: ToastType)

@androidx.compose.runtime.Immutable
data class PiExtensionWidget(
    val key: String,
    val lines: List<String>,
    val placement: String?,
)

private data class StreamingReply(
    val id: String,
    val sessionId: String,
    val agentId: String,
    val text: String = "",
    val isThinking: Boolean = true,
    val tools: Map<String, ToolCardData> = emptyMap()
) {
    fun toUiMessage() = UiMessage(
        id = id,
        isUser = false,
        text = text,
        toolCards = tools.values.toList(),
        isThinking = isThinking,
        role = "AGENT",
        agentId = agentId
    )
}

private data class PersistedChat(
    val sessionId: String? = null,
    val title: String? = null,
    val messages: List<UiMessage> = emptyList(),
)

private fun Session.toUiMessages(): List<UiMessage> = messages.map { message ->
    UiMessage(
        id = message.id,
        isUser = message.role == MessageRole.USER,
        text = message.content.filter { it.type == "text" }.joinToString("\n") { it.text },
        toolCards = message.content.mapNotNull { block -> block.toolExecution?.toToolCardData() },
        role = message.role.name,
        timestamp = message.createdAt.toString(),
        agentId = agentId,
        attachments = message.content.mapIndexedNotNull { index, block ->
            block.image?.let { image ->
                UiImageAttachment(
                    id = "${message.id}-$index",
                    path = "",
                    name = image.name,
                    mimeType = image.mimeType,
                    sizeBytes = image.base64.length * 3L / 4L,
                    base64 = image.base64,
                )
            }
        },
    )
}

@OptIn(ExperimentalCoroutinesApi::class)
class SessionViewModel(
    private val sessionService: SessionService,
    private val conversationService: ConversationGateway,
    private val scope: CoroutineScope
) {
    private val _currentSessionId = MutableStateFlow<String?>(null)
    val currentSessionId: StateFlow<String?> = _currentSessionId
    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending
    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError
    val domainSessions: StateFlow<List<Session>> = sessionService.sessions
    private val eventChannel = Channel<String>(Channel.BUFFERED)
    val errorEvents = eventChannel.receiveAsFlow()
    private val actionChannel = Channel<SessionActionEvent>(Channel.BUFFERED)
    val events = actionChannel.receiveAsFlow()
    val allActivities = conversationService.activities
    val activities = combine(conversationService.activities, _currentSessionId) { activities, sessionId ->
        if (sessionId == null) emptyList() else activities.filter { it.sessionId == sessionId }
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())
    val runtimeState = _currentSessionId
        .flatMapLatest { sessionId ->
            sessionId?.let(conversationService::runtimeState) ?: flowOf(null)
        }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), null)
    val runtimeStats = _currentSessionId
        .flatMapLatest { sessionId ->
            sessionId?.let(conversationService::runtimeStats) ?: flowOf(null)
        }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), null)
    private val _isCompactionRequested = MutableStateFlow(false)
    val isCompacting = combine(runtimeState, _isCompactionRequested) { state, requested ->
        requested || state?.isCompacting == true
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), false)
    private val streamingReply = MutableStateFlow<StreamingReply?>(null)
    private val activeSessionId = MutableStateFlow<String?>(null)
    private val _piCommands = MutableStateFlow<List<PiCommandInfo>>(emptyList())
    val piCommands: StateFlow<List<PiCommandInfo>> = _piCommands
    private val _piModels = MutableStateFlow<List<PiModelInfo>>(emptyList())
    val piModels: StateFlow<List<PiModelInfo>> = _piModels
    private val _piThinkingLevels = MutableStateFlow<List<String>>(emptyList())
    val piThinkingLevels: StateFlow<List<String>> = _piThinkingLevels
    private val _runtimeControlBusy = MutableStateFlow(false)
    val runtimeControlBusy: StateFlow<Boolean> = _runtimeControlBusy
    private val _queuedMessageBusy = MutableStateFlow(false)
    val queuedMessageBusy: StateFlow<Boolean> = _queuedMessageBusy
    private val runtimeControlMutex = Mutex()
    private val _piSessionTree = MutableStateFlow<PiSessionTree?>(null)
    val piSessionTree: StateFlow<PiSessionTree?> = _piSessionTree
    private val _sessionTreeLoading = MutableStateFlow(false)
    val sessionTreeLoading: StateFlow<Boolean> = _sessionTreeLoading
    private val composerDraftChannel = Channel<String>(Channel.BUFFERED)
    val composerDraftEvents = composerDraftChannel.receiveAsFlow()
    private val _piExtensionUiRequest = MutableStateFlow<PiExtensionUiRequest?>(null)
    val piExtensionUiRequest: StateFlow<PiExtensionUiRequest?> = _piExtensionUiRequest
    private val _piExtensionUiBusy = MutableStateFlow(false)
    val piExtensionUiBusy: StateFlow<Boolean> = _piExtensionUiBusy
    private val _piExtensionStatuses = MutableStateFlow<Map<String, String>>(emptyMap())
    val piExtensionStatuses: StateFlow<Map<String, String>> = _piExtensionStatuses
    private val _piExtensionWidgets = MutableStateFlow<Map<String, PiExtensionWidget>>(emptyMap())
    val piExtensionWidgets: StateFlow<Map<String, PiExtensionWidget>> = _piExtensionWidgets
    private val _piExtensionTitle = MutableStateFlow<String?>(null)
    val piExtensionTitle: StateFlow<String?> = _piExtensionTitle
    private var piExtensionUiSessionId: String? = null
    private var piExtensionUiTimeoutJob: Job? = null

    val sessions: StateFlow<List<UiSession>> = combine(sessionService.sessions, _currentSessionId) { sessions, currentId ->
        sessions.map { session ->
            UiSession(
                id = session.id,
                agentId = session.agentId,
                title = session.title.ifBlank { "Session ${session.id}" },
                isActive = session.id == currentId,
                createdAt = session.createdAt.toEpochMilliseconds(),
                messageCount = session.messages.size
            )
        }
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val persistedChat: StateFlow<PersistedChat> = combine(
        sessionService.sessions,
        _currentSessionId,
    ) { sessions, currentId ->
        val session = sessions.firstOrNull { it.id == currentId }
        PersistedChat(
            sessionId = session?.id,
            title = session?.title,
            messages = session?.toUiMessages().orEmpty(),
        )
    }.distinctUntilChanged()
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), PersistedChat())

    val messages: StateFlow<List<UiMessage>> = combine(persistedChat, streamingReply) { persisted, streaming ->
        streaming?.takeIf { it.sessionId == persisted.sessionId }
            ?.let { persisted.messages + it.toUiMessage() }
            ?: persisted.messages
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    val currentSessionTitle: StateFlow<String?> = persistedChat
        .map { chat -> chat.title }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), null)

    val chatPresentation: StateFlow<UiChatPresentation> = combine(currentSessionTitle, messages) { title, messages ->
        UiChatPresentation(title, messages)
    }.distinctUntilChanged()
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), UiChatPresentation(null, emptyList()))

    fun loadSessions() {
        if (_currentSessionId.value == null) {
            _currentSessionId.value = sessionService.sessions.value.firstOrNull()?.id
        }
    }

    fun createSession(agentId: String) {
        if (_isSending.value) cancelSending()
        scope.launch {
            val session = sessionService.create(agentId, "New session")
            _currentSessionId.value = session.id
        }
    }

    fun selectSession(id: String) {
        if (_currentSessionId.value != id && _isSending.value) cancelSending()
        if (_currentSessionId.value != id) {
            _piModels.value = emptyList()
            _piThinkingLevels.value = emptyList()
            _piSessionTree.value = null
            clearPiExtensionUiState()
        }
        _currentSessionId.value = id
    }

    fun resetForWorkspace() {
        if (_isSending.value) cancelSending()
        _currentSessionId.value = null
        _piCommands.value = emptyList()
        _piModels.value = emptyList()
        _piThinkingLevels.value = emptyList()
        _piSessionTree.value = null
        _sessionTreeLoading.value = false
        clearPiExtensionUiState()
    }

    fun respondToPiExtensionUi(response: PiExtensionUiResponse) {
        val request = _piExtensionUiRequest.value ?: return
        val sessionId = piExtensionUiSessionId ?: return
        if (_piExtensionUiBusy.value) return
        _piExtensionUiBusy.value = true
        _piExtensionUiRequest.value = null
        piExtensionUiTimeoutJob?.cancel()
        piExtensionUiTimeoutJob = null
        scope.launch {
            conversationService.respondToExtensionUi(sessionId, request.id, response).fold(
                onSuccess = {
                    if (piExtensionUiSessionId == sessionId) piExtensionUiSessionId = null
                },
                onFailure = { error ->
                    if (piExtensionUiSessionId == sessionId && _piExtensionUiRequest.value == null) {
                        _piExtensionUiRequest.value = request
                        schedulePiExtensionUiTimeout(sessionId, request)
                    }
                    val message = error.message ?: "Pi 扩展交互响应失败"
                    _lastError.value = message
                    actionChannel.send(SessionActionEvent(message, ToastType.ERROR))
                },
            )
            _piExtensionUiBusy.value = false
        }
    }

    fun refreshPiCommands() {
        val sessionId = _currentSessionId.value ?: run {
            _piCommands.value = emptyList()
            return
        }
        scope.launch {
            conversationService.getCommands(sessionId).fold(
                onSuccess = { _piCommands.value = it },
                onFailure = { _piCommands.value = emptyList() },
            )
        }
    }

    fun refreshPiModels() {
        val sessionId = _currentSessionId.value
        scope.launch {
            val liveModels = sessionId?.let { conversationService.getAvailableModels(it).getOrNull() }
            _piModels.value = liveModels
                ?: conversationService.getAvailableModelsForAgent(AgentRegistry.DEFAULT_AGENT_ID).getOrElse { emptyList() }
            _piThinkingLevels.value = if (sessionId == null) {
                emptyList()
            } else {
                conversationService.getAvailableThinkingLevels(sessionId).getOrElse {
                    runtimeState.value
                        ?.thinkingLevel
                        ?.takeIf(String::isNotBlank)
                        ?.let(::listOf)
                        .orEmpty()
                }
            }
        }
    }

    fun setPiModel(model: PiModelInfo): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setModel(sessionId, model.provider, model.id).getOrThrow()
        _piThinkingLevels.value = conversationService.getAvailableThinkingLevels(sessionId)
            .getOrDefault(_piThinkingLevels.value)
        actionChannel.send(SessionActionEvent("已切换到 ${model.name}", ToastType.SUCCESS))
    }

    fun setPiThinkingLevel(level: String): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setThinkingLevel(sessionId, level).getOrThrow()
        actionChannel.send(SessionActionEvent("思考级别已调整为 $level", ToastType.SUCCESS))
    }

    fun setPiAutoCompaction(enabled: Boolean): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setAutoCompaction(sessionId, enabled).getOrThrow()
        actionChannel.send(SessionActionEvent("自动压缩已${if (enabled) "开启" else "关闭"}", ToastType.SUCCESS))
    }

    fun setPiAutoRetry(enabled: Boolean): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setAutoRetry(sessionId, enabled).getOrThrow()
        actionChannel.send(SessionActionEvent("自动重试已${if (enabled) "开启" else "关闭"}", ToastType.SUCCESS))
    }

    fun abortPiRetry(): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.abortRetry(sessionId).getOrThrow()
        actionChannel.send(SessionActionEvent("已取消当前自动重试", ToastType.INFO))
    }

    fun setPiSteeringMode(mode: String): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setSteeringMode(sessionId, mode).getOrThrow()
        actionChannel.send(SessionActionEvent("实时引导改为 ${mode.queueModeLabel()}", ToastType.SUCCESS))
    }

    fun setPiFollowUpMode(mode: String): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.setFollowUpMode(sessionId, mode).getOrThrow()
        actionChannel.send(SessionActionEvent("后续队列改为 ${mode.queueModeLabel()}", ToastType.SUCCESS))
    }

    fun refreshPiSessionTree() {
        val sessionId = _currentSessionId.value ?: run {
            _piSessionTree.value = null
            return
        }
        if (_sessionTreeLoading.value) return
        scope.launch {
            _sessionTreeLoading.value = true
            try {
                conversationService.getSessionTree(sessionId).fold(
                    onSuccess = { _piSessionTree.value = it },
                    onFailure = { error ->
                        _piSessionTree.value = null
                        actionChannel.send(
                            SessionActionEvent(error.message ?: "读取 Pi 会话树失败", ToastType.ERROR)
                        )
                    },
                )
            } finally {
                _sessionTreeLoading.value = false
            }
        }
    }

    fun forkPiSession(entryId: String): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        val result = conversationService.forkSession(sessionId, entryId).getOrThrow()
        if (result.cancelled) {
            actionChannel.send(SessionActionEvent("Pi 扩展取消了分叉", ToastType.INFO))
        } else {
            result.selectedText?.takeIf(String::isNotBlank)?.let { composerDraftChannel.send(it) }
            _piSessionTree.value = conversationService.getSessionTree(sessionId).getOrNull()
            actionChannel.send(SessionActionEvent("已创建新分支，原分支保留在会话列表", ToastType.SUCCESS))
        }
    }

    fun clonePiSession(): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        val result = conversationService.cloneSession(sessionId).getOrThrow()
        if (result.cancelled) {
            actionChannel.send(SessionActionEvent("Pi 扩展取消了克隆", ToastType.INFO))
        } else {
            _piSessionTree.value = conversationService.getSessionTree(sessionId).getOrNull()
            actionChannel.send(SessionActionEvent("当前分支已克隆，原分支保留在会话列表", ToastType.SUCCESS))
        }
    }

    fun synchronizePiSession(): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        conversationService.synchronizeSession(sessionId).getOrThrow()
        _piSessionTree.value = conversationService.getSessionTree(sessionId).getOrNull()
        actionChannel.send(SessionActionEvent("已从活动 Pi 运行时同步当前会话", ToastType.SUCCESS))
    }

    fun exportPiSessionHtml(): Boolean = launchRuntimeControl {
        val sessionId = checkNotNull(_currentSessionId.value) { "当前没有会话" }
        val path = conversationService.exportSessionHtml(sessionId).getOrThrow()
        actionChannel.send(SessionActionEvent("会话已导出：$path", ToastType.SUCCESS))
    }

    private fun launchRuntimeControl(action: suspend () -> Unit): Boolean {
        if (_currentSessionId.value == null || _runtimeControlBusy.value) return false
        scope.launch {
            runtimeControlMutex.withLock {
                _runtimeControlBusy.value = true
                try {
                    action()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    actionChannel.send(
                        SessionActionEvent(error.message ?: "Pi 会话设置失败", ToastType.ERROR)
                    )
                } finally {
                    _runtimeControlBusy.value = false
                }
            }
        }
        return true
    }

    private var sendJob: Job? = null

    fun prepareImageAttachments(paths: List<String>): Result<List<UiImageAttachment>> {
        val prepared = runCatching {
            val files = paths.map(::File).distinctBy { it.canonicalPath }
            files.map { file ->
                require(file.isFile) { "图片不存在：${file.name}" }
                val mimeType = imageMimeType(file) ?: error("不支持的图片格式：${file.name}")
                require(file.length() <= MAX_IMAGE_BYTES) { "图片过大：${file.name}，单张不能超过 8 MB" }
                UiImageAttachment(
                    id = file.canonicalPath,
                    path = file.canonicalPath,
                    name = file.name,
                    mimeType = mimeType,
                    sizeBytes = file.length(),
                )
            }
        }
        return prepared.fold(
            onSuccess = { attachments -> mergeImageAttachments(emptyList(), attachments) },
            onFailure = { error -> Result.failure(error) },
        )
    }

    fun mergeImageAttachments(
        existing: List<UiImageAttachment>,
        added: List<UiImageAttachment>,
    ): Result<List<UiImageAttachment>> = runCatching {
        val attachments = (existing + added).distinctBy(UiImageAttachment::id)
        require(attachments.size <= MAX_IMAGE_COUNT) { "最多选择 $MAX_IMAGE_COUNT 张图片" }
        attachments.forEach { attachment ->
            require(attachment.mimeType in SUPPORTED_IMAGE_MIME_TYPES) { "不支持的图片格式：${attachment.name}" }
            require(attachment.sizeBytes >= 0) { "图片大小无效：${attachment.name}" }
            require(attachment.sizeBytes <= MAX_IMAGE_BYTES) { "图片过大：${attachment.name}，单张不能超过 8 MB" }
            require(attachment.path.isNotBlank() || !attachment.base64.isNullOrBlank()) {
                "图片数据不可用：${attachment.name}"
            }
        }
        require(attachments.sumOf(UiImageAttachment::sizeBytes) <= MAX_TOTAL_IMAGE_BYTES) {
            "图片总大小不能超过 16 MB"
        }
        attachments
    }

    fun sendMessage(
        text: String,
        agentId: String,
        attachments: List<UiImageAttachment> = emptyList()
    ): Boolean {
        val validatedAttachments = mergeImageAttachments(emptyList(), attachments).getOrElse { error ->
            val message = error.message ?: "附件校验失败"
            _lastError.value = message
            scope.launch { eventChannel.send(message) }
            return false
        }
        val currentSessionId = _currentSessionId.value
        val runtimeIsCompacting = currentSessionId
            ?.let(conversationService::runtimeState)
            ?.value
            ?.isCompacting == true
        if (
            (text.isBlank() && validatedAttachments.isEmpty()) || agentId.isBlank() || _isSending.value ||
            _isCompactionRequested.value || runtimeIsCompacting
        ) return false
        val sessionIdAtStart = currentSessionId
        _isSending.value = true
        sendJob = scope.launch {
            _lastError.value = null
            val pendingText = StringBuilder()
            val pendingTextMutex = Mutex()
            var flushJob: Job? = null

            suspend fun flushPendingText(sessionId: String) {
                val text = pendingTextMutex.withLock {
                    pendingText.toString().also { pendingText.clear() }
                }
                if (text.isNotEmpty()) {
                    updateStreaming(sessionId) { copy(text = this.text + text, isThinking = true) }
                }
            }

            suspend fun flushNow(sessionId: String) {
                flushJob?.cancelAndJoin()
                flushJob = null
                flushPendingText(sessionId)
            }

            try {
                val images = loadImages(validatedAttachments)
                val sessionId = sessionIdAtStart ?: sessionService
                    .create(agentId, text.take(40).ifBlank { validatedAttachments.joinToString { it.name }.take(40) })
                    .also { _currentSessionId.value = it.id }
                    .id
                activeSessionId.value = sessionId
                streamingReply.value = StreamingReply(
                    id = "stream-$sessionId-${System.nanoTime()}",
                    sessionId = sessionId,
                    agentId = agentId
                )
                conversationService.streamMessage(sessionId, text, images).collect { event ->
                    when (event) {
                        is ConversationEvent.Started -> Unit
                        is ConversationEvent.TextDelta -> {
                            pendingTextMutex.withLock { pendingText.append(event.text) }
                            if (flushJob?.isActive != true) {
                                flushJob = launch {
                                    delay(STREAM_UPDATE_INTERVAL_MS)
                                    flushPendingText(sessionId)
                                }
                            }
                        }
                        is ConversationEvent.ThinkingDelta -> updateStreaming(sessionId) {
                            copy(isThinking = true)
                        }
                        is ConversationEvent.ToolStarted -> {
                            flushNow(sessionId)
                            updateStreaming(sessionId) {
                                copy(
                                    tools = tools + (
                                        event.id to runningToolCard(event.name, event.arguments)
                                    )
                                )
                            }
                        }
                        is ConversationEvent.ToolFinished -> {
                            flushNow(sessionId)
                            updateStreaming(sessionId) {
                                val previous = tools[event.id]
                                copy(
                                    tools = tools + (
                                        event.id to completedToolCard(
                                            name = event.name,
                                            output = event.output,
                                            isError = event.isError,
                                            previous = previous,
                                        )
                                    )
                                )
                            }
                        }
                        is ConversationEvent.ExtensionUiRequested -> {
                            piExtensionUiSessionId = sessionId
                            _piExtensionUiRequest.value = event.request
                            schedulePiExtensionUiTimeout(sessionId, event.request)
                        }
                        is ConversationEvent.ExtensionNotification -> actionChannel.send(
                            SessionActionEvent(
                                event.message,
                                if (event.type == "error") ToastType.ERROR else ToastType.INFO,
                            )
                        )
                        is ConversationEvent.ExtensionStatusChanged -> _piExtensionStatuses.update { statuses ->
                            event.text?.let { statuses + (event.key to it) } ?: (statuses - event.key)
                        }
                        is ConversationEvent.ExtensionWidgetChanged -> _piExtensionWidgets.update { widgets ->
                            event.lines?.let { lines ->
                                widgets + (event.key to PiExtensionWidget(event.key, lines, event.placement))
                            } ?: (widgets - event.key)
                        }
                        is ConversationEvent.ExtensionTitleChanged -> {
                            _piExtensionTitle.value = event.title.takeIf(String::isNotBlank)
                        }
                        is ConversationEvent.ExtensionEditorTextChanged -> composerDraftChannel.send(event.text)
                        is ConversationEvent.Completed -> {
                            flushNow(sessionId)
                            streamingReply.value = null
                        }
                        is ConversationEvent.Failed -> {
                            flushNow(sessionId)
                            streamingReply.value = null
                            _lastError.value = event.message
                            eventChannel.send(event.message)
                        }
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val message = error.message ?: "图片读取失败"
                _lastError.value = message
                eventChannel.send(message)
            } finally {
                flushJob?.cancel()
                if (piExtensionUiSessionId == activeSessionId.value) {
                    piExtensionUiTimeoutJob?.cancel()
                    piExtensionUiTimeoutJob = null
                    piExtensionUiSessionId = null
                    _piExtensionUiRequest.value = null
                    _piExtensionUiBusy.value = false
                }
                streamingReply.value = null
                activeSessionId.value = null
                _isSending.value = false
                sendJob = null
            }
        }
        return true
    }

    fun sendQueuedMessage(
        text: String,
        attachments: List<UiImageAttachment> = emptyList(),
        mode: PiQueuedMessageMode,
    ): Boolean {
        val validatedAttachments = mergeImageAttachments(emptyList(), attachments).getOrElse { error ->
            val message = error.message ?: "附件校验失败"
            _lastError.value = message
            scope.launch { eventChannel.send(message) }
            return false
        }
        val sessionId = _currentSessionId.value ?: return false
        val state = conversationService.runtimeState(sessionId).value
        if (
            (text.isBlank() && validatedAttachments.isEmpty()) || !_isSending.value ||
            state?.isStreaming != true || state.isCompacting || _queuedMessageBusy.value
        ) return false

        _queuedMessageBusy.value = true
        scope.launch {
            try {
                val images = loadImages(validatedAttachments)
                conversationService.sendQueuedMessage(sessionId, text, images, mode).fold(
                    onSuccess = {
                        actionChannel.send(
                            SessionActionEvent(
                                message = when (mode) {
                                    PiQueuedMessageMode.STEER -> "实时引导已送达 Pi"
                                    PiQueuedMessageMode.FOLLOW_UP -> "后续任务已加入 Pi 队列"
                                },
                                type = ToastType.SUCCESS,
                            )
                        )
                    },
                    onFailure = { error ->
                        val message = error.message ?: "Pi 消息投递失败"
                        _lastError.value = message
                        if (text.isNotBlank()) composerDraftChannel.send(text)
                        eventChannel.send(message)
                    },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val message = error.message ?: "图片读取失败"
                _lastError.value = message
                if (text.isNotBlank()) composerDraftChannel.send(text)
                eventChannel.send(message)
            } finally {
                _queuedMessageBusy.value = false
            }
        }
        return true
    }

    fun cancelSending() {
        val sessionId = activeSessionId.value
        streamingReply.value = null
        scope.launch {
            stopSending(sessionId)
        }
    }

    fun compactCurrentSession(customInstructions: String? = null): Boolean {
        val sessionId = _currentSessionId.value ?: return false
        val state = conversationService.runtimeState(sessionId).value ?: return false
        if (_isSending.value || _isCompactionRequested.value || !state.isAlive || state.isStreaming || state.isCompacting) {
            return false
        }
        _isCompactionRequested.value = true
        val normalizedInstructions = customInstructions
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?.take(MAX_COMPACTION_INSTRUCTIONS_LENGTH)
        scope.launch {
            try {
                conversationService.compactSession(sessionId, normalizedInstructions).fold(
                    onSuccess = { result ->
                        val reduction = result.estimatedTokensAfter
                            ?.let { after -> "${result.tokensBefore} → $after tokens" }
                            ?: "压缩前 ${result.tokensBefore} tokens"
                        actionChannel.send(SessionActionEvent("上下文压缩完成：$reduction", ToastType.SUCCESS))
                    },
                    onFailure = { error ->
                        val message = error.message ?: "上下文压缩失败"
                        _lastError.value = message
                        eventChannel.send(message)
                    }
                )
            } finally {
                _isCompactionRequested.value = false
            }
        }
        return true
    }

    fun closeSession(id: String) {
        scope.launch {
            if (activeSessionId.value == id) stopSending(id)
            conversationService.closeSession(id).fold(
                onSuccess = {
                    if (_currentSessionId.value == id) {
                        _currentSessionId.value = sessionService.sessions.value.firstOrNull { it.id != id }?.id
                    }
                },
                onFailure = { error ->
                    val message = error.message ?: "关闭会话失败"
                    _lastError.value = message
                    eventChannel.send(message)
                }
            )
        }
    }

    private suspend fun stopSending(sessionId: String?) {
        val activeJob = sendJob
        val abortSucceeded = if (sessionId == null) {
            false
        } else {
            conversationService.cancelSession(sessionId).fold(
                onSuccess = { true },
                onFailure = { error ->
                    val message = error.message ?: "停止主智能体失败"
                    _lastError.value = message
                    eventChannel.send(message)
                    false
                },
            )
        }
        val completedAfterAbort = abortSucceeded && activeJob != null &&
            withTimeoutOrNull(STOP_STREAM_GRACE_MILLIS) {
                activeJob.join()
                true
            } == true
        if (!completedAfterAbort) activeJob?.cancelAndJoin()
        streamingReply.value = null
    }

    private inline fun updateStreaming(sessionId: String, transform: StreamingReply.() -> StreamingReply) {
        streamingReply.update { reply ->
            reply?.takeIf { it.sessionId == sessionId }?.transform()
        }
    }

    private fun schedulePiExtensionUiTimeout(sessionId: String, request: PiExtensionUiRequest) {
        piExtensionUiTimeoutJob?.cancel()
        val timeoutMillis = request.timeoutMillis?.takeIf { it > 0 } ?: return
        piExtensionUiTimeoutJob = scope.launch {
            delay(timeoutMillis)
            if (piExtensionUiSessionId == sessionId && _piExtensionUiRequest.value?.id == request.id) {
                piExtensionUiSessionId = null
                _piExtensionUiRequest.value = null
                _piExtensionUiBusy.value = false
                actionChannel.send(SessionActionEvent("Pi 扩展交互已超时", ToastType.INFO))
            }
        }
    }

    private fun clearPiExtensionUiState() {
        piExtensionUiTimeoutJob?.cancel()
        piExtensionUiTimeoutJob = null
        piExtensionUiSessionId = null
        _piExtensionUiRequest.value = null
        _piExtensionUiBusy.value = false
        _piExtensionStatuses.value = emptyMap()
        _piExtensionWidgets.value = emptyMap()
        _piExtensionTitle.value = null
    }

    private suspend fun loadImages(attachments: List<UiImageAttachment>): List<ImageData> =
        withContext(Dispatchers.IO) {
            var totalDecodedBytes = 0L
            attachments.map { attachment ->
                val encoded = attachment.base64
                val base64: String
                val decodedSize: Long
                if (encoded != null) {
                    require(encoded.length <= MAX_IMAGE_BASE64_CHARS) {
                        "图片过大：${attachment.name}，单张不能超过 8 MB"
                    }
                    val decoded = try {
                        Base64.getDecoder().decode(encoded)
                    } catch (_: IllegalArgumentException) {
                        error("图片数据损坏：${attachment.name}")
                    }
                    base64 = encoded
                    decodedSize = decoded.size.toLong()
                } else {
                    val file = File(attachment.path)
                    require(file.isFile) { "图片不存在：${attachment.name}" }
                    val bytes = file.inputStream().use { input ->
                        input.readNBytes((MAX_IMAGE_BYTES + 1).toInt())
                    }
                    require(bytes.size.toLong() <= MAX_IMAGE_BYTES) { "图片过大：${attachment.name}" }
                    base64 = Base64.getEncoder().encodeToString(bytes)
                    decodedSize = bytes.size.toLong()
                }
                require(decodedSize <= MAX_IMAGE_BYTES) { "图片过大：${attachment.name}，单张不能超过 8 MB" }
                totalDecodedBytes += decodedSize
                require(totalDecodedBytes <= MAX_TOTAL_IMAGE_BYTES) { "图片总大小不能超过 16 MB" }
                ImageData(
                    base64 = base64,
                    mimeType = attachment.mimeType,
                    name = attachment.name
                )
            }
        }
}

private const val STREAM_UPDATE_INTERVAL_MS = 24L
private const val STOP_STREAM_GRACE_MILLIS = 1_500L
private const val MAX_IMAGE_COUNT = 4
private const val MAX_IMAGE_BYTES = 8L * 1024L * 1024L
private const val MAX_TOTAL_IMAGE_BYTES = 16L * 1024L * 1024L
private const val MAX_IMAGE_BASE64_CHARS = (((MAX_IMAGE_BYTES + 2L) / 3L) * 4L).toInt()
private const val MAX_COMPACTION_INSTRUCTIONS_LENGTH = 2_000
private val SUPPORTED_IMAGE_MIME_TYPES = setOf("image/png", "image/jpeg", "image/webp")
private val TOOL_ARGUMENTS_JSON = Json { prettyPrint = true }

private fun String.queueModeLabel(): String = when (this) {
    "all" -> "批量处理"
    "one-at-a-time" -> "逐条处理"
    else -> this
}

internal fun ToolExecution.toToolCardData() = ToolCardData(
    title = name,
    iconType = toolIconType(name),
    command = formatToolArguments(arguments),
    output = output,
    resultOk = !isError,
    showResult = true,
)

internal fun runningToolCard(name: String, arguments: String) = ToolCardData(
    title = name,
    iconType = toolIconType(name),
    duration = "运行中",
    command = formatToolArguments(arguments),
    showResult = false,
)

internal fun completedToolCard(
    name: String,
    output: String,
    isError: Boolean,
    previous: ToolCardData?,
) = ToolCardData(
    title = name.ifBlank { previous?.title.orEmpty() },
    iconType = previous?.iconType ?: toolIconType(name),
    command = previous?.command.orEmpty(),
    output = output,
    resultOk = !isError,
    showResult = true,
)

internal fun formatToolArguments(arguments: String): String {
    if (arguments.isBlank()) return ""
    return runCatching {
        TOOL_ARGUMENTS_JSON.encodeToString(JsonElement.serializer(), Json.parseToJsonElement(arguments))
    }.getOrElse { arguments }
}

internal fun toolIconType(name: String): String = when {
    name.contains("bash", true) || name.contains("shell", true) || name.contains("terminal", true) -> "terminal"
    name.contains("read", true) || name.contains("write", true) || name.contains("edit", true) || name.contains("file", true) -> "file"
    name.contains("search", true) || name.contains("grep", true) || name.contains("find", true) -> "search"
    name.startsWith("mcp_", true) -> "settings"
    else -> "code"
}

private fun imageMimeType(file: File): String? = when (file.extension.lowercase()) {
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    else -> null
}
