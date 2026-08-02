package com.swarmeditor.backend.service

import com.swarmeditor.backend.activity.ActivityStore
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.pi.PiSessionStats
import com.swarmeditor.backend.pi.PiCompactionResult
import com.swarmeditor.backend.pi.PiCommandInfo
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.backend.pi.PiSessionTree
import com.swarmeditor.backend.pi.PiSessionMutationResult
import com.swarmeditor.backend.pi.PiSessionSnapshot
import com.swarmeditor.backend.pi.PiConversationMessage
import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Message
import com.swarmeditor.common.model.TokenUsage
import com.swarmeditor.common.model.ToolExecution
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import java.util.concurrent.ConcurrentHashMap
import java.util.UUID

private val log = KotlinLogging.logger {}

private val emptyActivities = MutableStateFlow<List<ActivityEvent>>(emptyList())
private val emptyRuntimeState = MutableStateFlow<PiSessionState?>(null)
private val emptyRuntimeStats = MutableStateFlow<PiSessionStats?>(null)

sealed interface ConversationEvent {
    data class Started(val remoteSessionId: String) : ConversationEvent
    data class TextDelta(val text: String) : ConversationEvent
    data class ThinkingDelta(val text: String) : ConversationEvent
    data class ToolStarted(val id: String, val name: String, val arguments: String) : ConversationEvent
    data class ToolFinished(val id: String, val name: String, val output: String, val isError: Boolean) : ConversationEvent
    data class Completed(val text: String) : ConversationEvent
    data class Failed(val message: String) : ConversationEvent
}

interface ConversationGateway {
    val activities: StateFlow<List<ActivityEvent>>
        get() = emptyActivities

    fun runtimeState(sessionId: String): StateFlow<PiSessionState?> = emptyRuntimeState
    fun runtimeStats(sessionId: String): StateFlow<PiSessionStats?> = emptyRuntimeStats
    suspend fun compactSession(sessionId: String, customInstructions: String? = null): Result<PiCompactionResult> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun getCommands(sessionId: String): Result<List<PiCommandInfo>> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun getAvailableModels(sessionId: String): Result<List<PiModelInfo>> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun setModel(sessionId: String, provider: String, modelId: String): Result<PiSessionState> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun setThinkingLevel(sessionId: String, level: String): Result<PiSessionState> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun getSessionTree(sessionId: String): Result<PiSessionTree> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun forkSession(sessionId: String, entryId: String): Result<PiSessionMutationResult> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun cloneSession(sessionId: String): Result<PiSessionMutationResult> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun synchronizeSession(sessionId: String): Result<PiSessionSnapshot> =
        Result.failure(IllegalStateException("pi session is not running"))
    suspend fun exportSessionHtml(sessionId: String): Result<String> =
        Result.failure(IllegalStateException("pi session is not running"))

    suspend fun sendMessage(
        sessionId: String,
        content: String,
        images: List<ImageData> = emptyList()
    ): Result<String>

    fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData> = emptyList()
    ): Flow<ConversationEvent> = flow {
        sendMessage(sessionId, content, images).fold(
            onSuccess = { emit(ConversationEvent.Completed(it)) },
            onFailure = { emit(ConversationEvent.Failed(it.message ?: "消息发送失败")) }
        )
    }

    suspend fun cancelSession(sessionId: String): Result<Unit> = Result.success(Unit)
    suspend fun closeSession(sessionId: String): Result<Unit>
}

@OptIn(ExperimentalTime::class)
class ConversationService(
    private val sessionService: SessionService,
    private val agentService: AgentService,
    private val runtimeManager: PiSessionProvider,
    private val activityStore: ActivityStore,
    private val clock: Clock = Clock.System
) : ConversationGateway {
    private val sessionOperationLocks = ConcurrentHashMap<String, Mutex>()
    override val activities: StateFlow<List<ActivityEvent>> = activityStore.events
    override fun runtimeState(sessionId: String): StateFlow<PiSessionState?> = runtimeManager.state(sessionId)
    override fun runtimeStats(sessionId: String): StateFlow<PiSessionStats?> = runtimeManager.stats(sessionId)

    override suspend fun compactSession(
        sessionId: String,
        customInstructions: String?
    ): Result<PiCompactionResult> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.compact(sessionId, customInstructions).also { result ->
                val after = result.estimatedTokensAfter?.let { " → $it" }.orEmpty()
                val instructionNote = customInstructions
                    ?.trim()
                    ?.takeIf(String::isNotEmpty)
                    ?.let { " · 指令：${it.take(100)}" }
                    .orEmpty()
                recordActivity(
                    sessionId,
                    "Pi",
                    "压缩上下文",
                    "${result.tokensBefore}$after tokens$instructionNote",
                    ActivityType.SESSION
                )
            }
        }
    }

    override suspend fun getCommands(sessionId: String): Result<List<PiCommandInfo>> = resultOf {
        runtimeManager.getCommands(sessionId)
    }

    override suspend fun getAvailableModels(sessionId: String): Result<List<PiModelInfo>> = resultOf {
        runtimeManager.getAvailableModels(sessionId)
    }

    override suspend fun setModel(sessionId: String, provider: String, modelId: String): Result<PiSessionState> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.setModel(sessionId, provider, modelId).also { state ->
                recordActivity(sessionId, "Pi", "切换模型", "${state.provider}/${state.modelId}", ActivityType.SESSION)
            }
        }
    }

    override suspend fun setThinkingLevel(sessionId: String, level: String): Result<PiSessionState> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.setThinkingLevel(sessionId, level).also { state ->
                recordActivity(sessionId, "Pi", "调整思考级别", state.thinkingLevel, ActivityType.SESSION)
            }
        }
    }

    override suspend fun getSessionTree(sessionId: String): Result<PiSessionTree> = resultOf {
        runtimeManager.getSessionTree(sessionId)
    }

    override suspend fun forkSession(sessionId: String, entryId: String): Result<PiSessionMutationResult> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.fork(sessionId, entryId).also { result ->
                if (!result.cancelled) {
                    persistRemoteMutation(sessionId, result)
                    recordActivity(
                        sessionId,
                        "Pi",
                        "创建会话分支",
                        result.selectedText?.take(120).orEmpty(),
                        ActivityType.SESSION,
                    )
                }
            }
        }
    }

    override suspend fun cloneSession(sessionId: String): Result<PiSessionMutationResult> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.cloneSession(sessionId).also { result ->
                if (!result.cancelled) {
                    persistRemoteMutation(sessionId, result)
                    recordActivity(sessionId, "Pi", "克隆当前分支", "已保留原分支", ActivityType.SESSION)
                }
            }
        }
    }

    override suspend fun synchronizeSession(sessionId: String): Result<PiSessionSnapshot> = resultOf {
        withSessionOperation(sessionId) {
            runtimeManager.snapshot(sessionId).also { snapshot ->
                val (_, backup) = sessionService.reconcileRemoteSession(
                    sessionId = sessionId,
                    remoteSessionId = snapshot.state.sessionId,
                    messages = snapshot.messages.toDomainMessages(),
                )
                recordActivity(
                    sessionId,
                    "Pi",
                    "同步会话",
                    if (backup == null) "已对齐当前分支" else "远端分支已恢复，原分支已保留",
                    ActivityType.SESSION,
                )
            }
        }
    }

    override suspend fun exportSessionHtml(sessionId: String): Result<String> = resultOf {
        runtimeManager.exportHtml(sessionId).also { path ->
            recordActivity(sessionId, "Pi", "导出会话", path, ActivityType.FILE)
        }
    }

    override suspend fun sendMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Result<String> {
        var result: Result<String>? = null
        streamMessage(sessionId, content, images).collect { event ->
            when (event) {
                is ConversationEvent.Completed -> result = Result.success(event.text)
                is ConversationEvent.Failed -> result = Result.failure(IllegalStateException(event.message))
                else -> Unit
            }
        }
        return result ?: Result.failure(IllegalStateException("pi 会话未返回完成事件"))
    }

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Flow<ConversationEvent> = channelFlow {
        withSessionOperation(sessionId) {
            try {
                require(content.isNotBlank() || images.isNotEmpty()) { "Message cannot be blank" }
                val session = sessionService.get(sessionId) ?: error("Session not found")
                val agent = agentService.requireLaunchConfig(session.agentId)

                val activityDetail = buildString {
                    append(content.take(100))
                    if (images.isNotEmpty()) {
                        if (isNotEmpty()) append(" · ")
                        append("${images.size} 张图片")
                    }
                }
                val userContent = buildList {
                    if (content.isNotBlank()) add(ContentBlock(type = "text", text = content))
                    images.forEach { image -> add(ContentBlock(type = "image", image = image)) }
                }
                sessionService.addMessage(sessionId, MessageRole.USER, userContent)
                recordActivity(sessionId, "用户", "发送", activityDetail, ActivityType.MESSAGE)
                val piSession = runtimeManager.getOrCreateValidated(
                    sessionId = sessionId,
                    config = agent,
                    remoteSessionId = session.remoteSessionId,
                    isConfigCurrent = { agentService.isLaunchConfigCurrent(agent) },
                )
                if (session.remoteSessionId != piSession.remoteSessionId) {
                    sessionService.associateRemoteSession(sessionId, piSession.remoteSessionId)
                }
                send(ConversationEvent.Started(piSession.remoteSessionId))
                val toolExecutions = linkedMapOf<String, ToolExecution>()

                val response = piSession.prompt(content, images) { event ->
                    when (event) {
                        is PiSessionEvent.ToolStarted -> {
                            toolExecutions[event.id] = ToolExecution(
                                id = event.id,
                                name = event.name,
                                arguments = event.arguments,
                            )
                            recordActivity(
                                sessionId = sessionId,
                                actor = "Pi",
                                action = "运行 ${event.name}",
                                detail = event.arguments.take(120),
                                type = event.name.toActivityType()
                            )
                        }
                        is PiSessionEvent.ToolFinished -> {
                            val started = toolExecutions[event.id]
                            toolExecutions[event.id] = ToolExecution(
                                id = event.id,
                                name = event.name.ifBlank { started?.name.orEmpty() },
                                arguments = started?.arguments.orEmpty(),
                                output = event.output,
                                isError = event.isError,
                            )
                            recordActivity(
                                sessionId = sessionId,
                                actor = "Pi",
                                action = if (event.isError) "工具失败" else "工具完成",
                                detail = event.name,
                                type = event.name.toActivityType()
                            )
                        }
                        else -> Unit
                    }
                    send(event.toConversationEvent())
                }
                persistAssistantResponse(sessionId, response, toolExecutions.values)
                persistTokenUsage(sessionId)
                recordActivity(sessionId, "Pi", "完成", "${response.length} 字符", ActivityType.SESSION)
                send(ConversationEvent.Completed(response))
            } catch (error: CancellationException) {
                withContext(NonCancellable) {
                    persistTokenUsage(sessionId)
                    recordActivity(sessionId, "Pi", "停止", "用户取消了本次运行", ActivityType.SESSION)
                }
                throw error
            } catch (error: Throwable) {
                persistTokenUsage(sessionId)
                recordActivity(sessionId, "Pi", "失败", error.message ?: "pi 会话执行失败", ActivityType.ERROR)
                send(ConversationEvent.Failed(error.message ?: "pi 会话执行失败"))
            }
        }
    }

    private suspend fun persistAssistantResponse(
        sessionId: String,
        response: String,
        toolExecutions: Collection<ToolExecution>,
    ) {
        try {
            if (toolExecutions.isNotEmpty()) {
                val assistantContent = buildList {
                    if (response.isNotBlank()) add(ContentBlock(type = "text", text = response))
                    toolExecutions.forEach { execution ->
                        add(ContentBlock(type = "tool", toolExecution = execution))
                    }
                }
                sessionService.addMessage(sessionId, MessageRole.ASSISTANT, assistantContent)
            } else if (response.isNotBlank()) {
                sessionService.addMessage(sessionId, MessageRole.ASSISTANT, response)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw IllegalStateException(
                "Pi 已完成回复，但本地保存失败。请点击“同步会话”恢复。",
                error,
            )
        }
    }

    private suspend fun <T> withSessionOperation(sessionId: String, action: suspend () -> T): T =
        sessionOperationLocks.computeIfAbsent(sessionId) { Mutex() }.withLock { action() }

    private suspend fun persistRemoteMutation(sessionId: String, result: PiSessionMutationResult) {
        val state = checkNotNull(result.state) { "pi 分支操作后未返回会话状态" }
        try {
            sessionService.applyRemoteBranch(
                sessionId = sessionId,
                remoteSessionId = state.sessionId,
                messages = result.messages.toDomainMessages(),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw IllegalStateException(
                "Pi 已完成分支切换，但本地保存失败。请在分支面板点击“同步会话”恢复。",
                error,
            )
        }
    }

    private fun List<PiConversationMessage>.toDomainMessages(): List<Message> = mapIndexed { index, message ->
        val createdAt = message.timestampMillis?.let(kotlin.time.Instant::fromEpochMilliseconds) ?: clock.now()
        Message(
            id = "pi-${message.timestampMillis ?: createdAt.toEpochMilliseconds()}-$index",
            role = if (message.role == "user") MessageRole.USER else MessageRole.ASSISTANT,
            content = buildList {
                if (message.text.isNotBlank()) add(ContentBlock(type = "text", text = message.text))
                message.toolExecutions.forEach { execution ->
                    add(ContentBlock(type = "tool", toolExecution = execution))
                }
            },
            createdAt = createdAt,
        )
    }

    private suspend fun persistTokenUsage(sessionId: String) {
        val stats = try {
            runtimeManager.refreshStats(sessionId)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            runtimeManager.stats(sessionId).value ?: return
        }
        try {
            sessionService.updateTokenUsage(sessionId, stats.toTokenUsage())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "Failed to persist token usage for $sessionId: ${error.message}" }
        }
    }

    override suspend fun cancelSession(sessionId: String): Result<Unit> = resultOf {
        runtimeManager.abort(sessionId)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = resultOf {
        withSessionOperation(sessionId) {
            checkNotNull(sessionService.get(sessionId)) { "Session not found" }
            runtimeManager.close(sessionId)
            sessionService.close(sessionId)
        }
    }

    private suspend fun recordActivity(
        sessionId: String,
        actor: String,
        action: String,
        detail: String,
        type: ActivityType,
    ) {
        val activity = ActivityEvent(
            id = UUID.randomUUID().toString(),
            sessionId = sessionId,
            timestamp = clock.now(),
            actor = actor,
            action = action,
            detail = detail,
            type = type
        )
        try {
            activityStore.append(activity)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "Failed to persist activity for $sessionId: ${error.message}" }
        }
    }
}

private fun PiSessionStats.toTokenUsage() = TokenUsage(
    input = tokens.input,
    output = tokens.output,
    cacheRead = tokens.cacheRead,
    cacheWrite = tokens.cacheWrite,
    total = tokens.total,
    cost = cost,
)

private fun String.toActivityType(): ActivityType {
    val normalized = lowercase()
    return when {
        normalized.contains("mcp") -> ActivityType.MCP
        normalized.contains("skill") -> ActivityType.SKILL
        normalized in setOf("read", "write", "edit", "patch", "apply_patch") -> ActivityType.FILE
        normalized in setOf("bash", "shell", "exec", "command", "terminal") -> ActivityType.COMMAND
        else -> ActivityType.TOOL
    }
}

private fun PiSessionEvent.toConversationEvent(): ConversationEvent = when (this) {
    is PiSessionEvent.TextDelta -> ConversationEvent.TextDelta(text)
    is PiSessionEvent.ThinkingDelta -> ConversationEvent.ThinkingDelta(text)
    is PiSessionEvent.ToolStarted -> ConversationEvent.ToolStarted(id, name, arguments)
    is PiSessionEvent.ToolFinished -> ConversationEvent.ToolFinished(id, name, output, isError)
}

private suspend fun <T> resultOf(action: suspend () -> T): Result<T> {
    return try {
        Result.success(action())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}
