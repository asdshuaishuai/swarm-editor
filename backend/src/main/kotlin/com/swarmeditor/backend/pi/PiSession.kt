package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ToolExecution
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

private val emptyPiSessionState = MutableStateFlow<PiSessionState?>(null)
private val emptyPiSessionStats = MutableStateFlow<PiSessionStats?>(null)

data class PiTokenUsage(
    val input: Long,
    val output: Long,
    val cacheRead: Long,
    val cacheWrite: Long,
    val total: Long,
)

data class PiContextUsage(
    val tokens: Long?,
    val contextWindow: Int,
    val percent: Double?,
)

data class PiSessionStats(
    val sessionId: String,
    val userMessages: Int,
    val assistantMessages: Int,
    val toolCalls: Int,
    val toolResults: Int,
    val totalMessages: Int,
    val tokens: PiTokenUsage,
    val cost: Double,
    val contextUsage: PiContextUsage? = null,
)

data class PiCompactionResult(
    val summary: String,
    val firstKeptEntryId: String,
    val tokensBefore: Long,
    val estimatedTokensAfter: Long? = null,
)

data class PiSessionState(
    val pid: Long?,
    val sessionId: String,
    val sessionName: String? = null,
    val provider: String? = null,
    val modelId: String? = null,
    val modelName: String? = null,
    val contextWindow: Int? = null,
    val maxTokens: Int? = null,
    val thinkingLevel: String,
    val isStreaming: Boolean,
    val isCompacting: Boolean,
    val autoCompactionEnabled: Boolean,
    val messageCount: Int,
    val pendingMessageCount: Int,
    val tools: List<PiToolInfo> = emptyList(),
    val isAlive: Boolean = true,
    val errorMessage: String? = null,
    val steeringMode: String = "one-at-a-time",
    val followUpMode: String = "one-at-a-time",
    val autoRetryEnabled: Boolean = true,
    val isRetrying: Boolean = false,
    val retryAttempt: Int = 0,
    val retryMaxAttempts: Int = 0,
    val retryDelayMillis: Long? = null,
    val retryErrorMessage: String? = null,
)

enum class PiQueuedMessageMode {
    STEER,
    FOLLOW_UP,
}

data class PiToolInfo(
    val name: String,
    val description: String,
    val active: Boolean,
)

data class PiCommandInfo(
    val name: String,
    val description: String,
    val source: String,
)

data class PiModelInfo(
    val provider: String,
    val id: String,
    val name: String,
    val api: String,
    val reasoning: Boolean,
    val contextWindow: Int,
    val maxTokens: Int,
    val inputModes: List<String> = emptyList(),
)

data class PiConversationMessage(
    val role: String,
    val text: String,
    val timestampMillis: Long? = null,
    val toolExecutions: List<ToolExecution> = emptyList(),
)

data class PiSessionTreeNode(
    val entryId: String,
    val parentId: String? = null,
    val type: String,
    val role: String? = null,
    val text: String = "",
    val timestamp: String? = null,
    val label: String? = null,
    val children: List<PiSessionTreeNode> = emptyList(),
)

data class PiSessionTree(
    val roots: List<PiSessionTreeNode>,
    val leafId: String? = null,
)

data class PiSessionMutationResult(
    val cancelled: Boolean,
    val selectedText: String? = null,
    val state: PiSessionState? = null,
    val messages: List<PiConversationMessage> = emptyList(),
)

data class PiSessionSnapshot(
    val state: PiSessionState,
    val messages: List<PiConversationMessage>,
)

enum class PiExtensionUiMethod {
    SELECT,
    CONFIRM,
    INPUT,
    EDITOR,
}

data class PiExtensionUiRequest(
    val id: String,
    val method: PiExtensionUiMethod,
    val title: String,
    val message: String? = null,
    val options: List<String> = emptyList(),
    val placeholder: String? = null,
    val prefill: String? = null,
    val timeoutMillis: Long? = null,
)

sealed interface PiExtensionUiResponse {
    data class Value(val value: String) : PiExtensionUiResponse
    data class Confirmation(val confirmed: Boolean) : PiExtensionUiResponse
    data object Cancelled : PiExtensionUiResponse
}

sealed interface PiSessionEvent {
    data class TextDelta(val text: String) : PiSessionEvent
    data class ThinkingDelta(val text: String) : PiSessionEvent
    data class ToolStarted(val id: String, val name: String, val arguments: String) : PiSessionEvent
    data class ToolFinished(val id: String, val name: String, val output: String, val isError: Boolean) : PiSessionEvent
    data class AgentCompleted(
        val stopReason: String?,
        val rawStopReason: String?,
        val errorMessage: String?,
    ) : PiSessionEvent
    data class ExtensionUiRequested(val request: PiExtensionUiRequest) : PiSessionEvent
    data class ExtensionNotification(val message: String, val type: String) : PiSessionEvent
    data class ExtensionStatusChanged(val key: String, val text: String?) : PiSessionEvent
    data class ExtensionWidgetChanged(
        val key: String,
        val lines: List<String>?,
        val placement: String?,
    ) : PiSessionEvent
    data class ExtensionTitleChanged(val title: String) : PiSessionEvent
    data class ExtensionEditorTextChanged(val text: String) : PiSessionEvent
}

interface PiSession {
    val pid: Long?
    val remoteSessionId: String
    val toolBrokerSessionId: String?
        get() = null
    val toolAuditIds: List<String>
        get() = emptyList()
    val state: StateFlow<PiSessionState?>
        get() = emptyPiSessionState
    val stats: StateFlow<PiSessionStats?>
        get() = emptyPiSessionStats
    suspend fun prompt(
        message: String,
        images: List<ImageData> = emptyList(),
        onEvent: suspend (PiSessionEvent) -> Unit = {}
    ): String
    suspend fun sendQueuedMessage(
        message: String,
        images: List<ImageData> = emptyList(),
        mode: PiQueuedMessageMode,
    ): Unit = error("pi queued messaging is unavailable")
    suspend fun respondToExtensionUi(requestId: String, response: PiExtensionUiResponse): Unit =
        error("pi extension UI is unavailable")
    suspend fun refreshState(): PiSessionState = checkNotNull(state.value) { "pi state is unavailable" }
    suspend fun refreshStats(): PiSessionStats = checkNotNull(stats.value) { "pi stats are unavailable" }
    suspend fun compact(customInstructions: String? = null): PiCompactionResult =
        error("pi compaction is unavailable")
    suspend fun getCommands(): List<PiCommandInfo> = emptyList()
    suspend fun getAvailableModels(): List<PiModelInfo> = emptyList()
    suspend fun getAvailableThinkingLevels(): List<String> = emptyList()
    suspend fun setModel(provider: String, modelId: String): PiSessionState =
        error("pi model switching is unavailable")
    suspend fun setThinkingLevel(level: String): PiSessionState =
        error("pi thinking-level switching is unavailable")
    suspend fun setAutoCompaction(enabled: Boolean): PiSessionState =
        error("pi auto-compaction control is unavailable")
    suspend fun setAutoRetry(enabled: Boolean): PiSessionState =
        error("pi auto-retry control is unavailable")
    suspend fun abortRetry(): Unit = error("pi retry control is unavailable")
    suspend fun setSteeringMode(mode: String): PiSessionState =
        error("pi steering-mode control is unavailable")
    suspend fun setFollowUpMode(mode: String): PiSessionState =
        error("pi follow-up-mode control is unavailable")
    suspend fun getSessionTree(): PiSessionTree = PiSessionTree(emptyList())
    suspend fun fork(entryId: String): PiSessionMutationResult =
        error("pi session forking is unavailable")
    suspend fun cloneSession(): PiSessionMutationResult =
        error("pi session cloning is unavailable")
    suspend fun snapshot(): PiSessionSnapshot =
        error("pi session synchronization is unavailable")
    suspend fun exportHtml(outputPath: String? = null): String =
        error("pi session export is unavailable")
    suspend fun abort()
    suspend fun close()
}

fun interface PiSessionFactory {
    suspend fun create(config: AgentConfig, workingDirectory: File, remoteSessionId: String?): PiSession
}

interface PiSessionProvider {
    suspend fun getOrCreate(sessionId: String, config: AgentConfig, remoteSessionId: String?): PiSession
    suspend fun getOrCreateValidated(
        sessionId: String,
        config: AgentConfig,
        remoteSessionId: String?,
        isConfigCurrent: suspend () -> Boolean,
    ): PiSession = getOrCreate(sessionId, config, remoteSessionId)
    fun state(sessionId: String): StateFlow<PiSessionState?> = emptyPiSessionState
    fun stats(sessionId: String): StateFlow<PiSessionStats?> = emptyPiSessionStats
    suspend fun refreshStats(sessionId: String): PiSessionStats =
        error("pi session is not running")
    suspend fun compact(sessionId: String, customInstructions: String? = null): PiCompactionResult =
        error("pi session is not running")
    suspend fun sendQueuedMessage(
        sessionId: String,
        message: String,
        images: List<ImageData> = emptyList(),
        mode: PiQueuedMessageMode,
    ): Unit = error("pi session is not running")
    suspend fun respondToExtensionUi(
        sessionId: String,
        requestId: String,
        response: PiExtensionUiResponse,
    ): Unit = error("pi session is not running")
    suspend fun getCommands(sessionId: String): List<PiCommandInfo> = emptyList()
    suspend fun getAvailableModels(sessionId: String): List<PiModelInfo> = emptyList()
    suspend fun getAvailableThinkingLevels(sessionId: String): List<String> = emptyList()
    suspend fun setModel(sessionId: String, provider: String, modelId: String): PiSessionState =
        error("pi session is not running")
    suspend fun setThinkingLevel(sessionId: String, level: String): PiSessionState =
        error("pi session is not running")
    suspend fun setAutoCompaction(sessionId: String, enabled: Boolean): PiSessionState =
        error("pi session is not running")
    suspend fun setAutoRetry(sessionId: String, enabled: Boolean): PiSessionState =
        error("pi session is not running")
    suspend fun abortRetry(sessionId: String): Unit = error("pi session is not running")
    suspend fun setSteeringMode(sessionId: String, mode: String): PiSessionState =
        error("pi session is not running")
    suspend fun setFollowUpMode(sessionId: String, mode: String): PiSessionState =
        error("pi session is not running")
    suspend fun getSessionTree(sessionId: String): PiSessionTree = PiSessionTree(emptyList())
    suspend fun fork(sessionId: String, entryId: String): PiSessionMutationResult =
        error("pi session is not running")
    suspend fun cloneSession(sessionId: String): PiSessionMutationResult =
        error("pi session is not running")
    suspend fun snapshot(sessionId: String): PiSessionSnapshot =
        error("pi session is not running")
    suspend fun exportHtml(sessionId: String, outputPath: String? = null): String =
        error("pi session is not running")
    suspend fun abort(sessionId: String)
    suspend fun close(sessionId: String)
}
