package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ToolExecution
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.backend.process.readTruncatedUtf8Lines
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.addJsonObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.UUID

private val log = KotlinLogging.logger {}
private const val MAX_TOOL_OUTPUT_CHARS = 32_000
private const val MAX_PI_RPC_LINE_BYTES = 64 * 1024 * 1024
private const val MAX_COMPLETED_TOOL_BROKER_REQUESTS = 4_096
private const val MAX_TOOL_BROKER_ERROR_CHARS = 2_000
private const val CLOSE_ABORT_GRACE_MILLIS = 250L
private const val PROCESS_TERMINATION_TIMEOUT_SECONDS = 2L
private val MANAGED_PI_ENVIRONMENT_VARIABLES = setOf(
    "PI_CODING_AGENT_DIR",
    "SWARM_PI_AGENT_ID",
    "SWARM_EDITOR_MCP_CONFIG",
    "SWARM_PI_TOOL_BROKER",
    "SWARM_PI_TOOL_BROKER_NONCE",
    "SWARM_PI_TOOL_BROKER_CORE_TOOLS",
    SWARM_PI_MODEL_CATALOG_ENV,
)

class PiRpcSession(
    distribution: PiRuntimeDistribution,
    private val config: AgentConfig,
    workingDirectory: File,
    remoteSessionId: String?,
    private val toolBroker: PiToolBroker? = null,
) : PiSession {
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val toolBrokerNonce = toolBroker?.let { UUID.randomUUID().toString().replace("-", "") }
    private val process = ProcessBuilder(distribution.command(config, remoteSessionId))
        .directory(workingDirectory)
        .apply {
            environment().putAll(
                piProcessEnvironment(
                    config = config,
                    toolBrokerNonce = toolBrokerNonce,
                    brokerCoreTools = toolBroker?.brokersCoreTools ?: true,
                )
            )
        }
        .start()
    private val writer = process.outputStream.bufferedWriter(Charsets.UTF_8)
    private val requestIds = AtomicLong()
    private val lastToolBrokerRequestSequence = AtomicLong()
    private val pendingResponses = ConcurrentHashMap<String, CompletableDeferred<JsonObject>>()
    private val toolBrokerJobs = ConcurrentHashMap<String, kotlinx.coroutines.Job>()
    private val completedToolBrokerRequests = ConcurrentHashMap.newKeySet<String>()
    private val canceledToolBrokerRequests = ConcurrentHashMap.newKeySet<String>()
    private val activeRun = AtomicReference<CompletableDeferred<Unit>?>(null)
    private val abortedRun = AtomicReference<CompletableDeferred<Unit>?>(null)
    private val activeEventSink = AtomicReference<(suspend (PiSessionEvent) -> Unit)?>(null)
    private val terminalError = AtomicReference<Throwable?>()
    private val operationMutex = Mutex()
    private val writerMutex = Mutex()
    private val toolBrokerCloseMutex = Mutex()
    private var toolBrokerClosed = false
    private val _state = MutableStateFlow<PiSessionState?>(null)
    private val _stats = MutableStateFlow<PiSessionStats?>(null)

    override val pid: Long = process.pid()
    override lateinit var remoteSessionId: String
        private set
    override val toolBrokerSessionId: String?
        get() = toolBroker?.brokerSessionId
    override val toolAuditIds: List<String>
        get() = toolBroker?.auditIds().orEmpty()
    override val state: StateFlow<PiSessionState?> = _state
    override val stats: StateFlow<PiSessionStats?> = _stats

    init {
        scope.launch {
            try {
                readJsonLines(process.inputStream, ::handleLine)
                if (process.isAlive) {
                    failSession(IllegalStateException("pi RPC 输出流已关闭"))
                    process.destroy()
                    closeToolBrokerBestEffort()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                failSession(IllegalStateException("pi RPC 输出读取失败", error))
                if (process.isAlive) process.destroy()
                closeToolBrokerBestEffort()
            }
        }
        scope.launch {
            readTruncatedUtf8Lines(process.errorStream) { line -> log.warn { "pi[$pid]: $line" } }
        }
        scope.launch {
            val exitCode = process.waitFor()
            failSession(IllegalStateException("pi 进程已退出，exitCode=$exitCode"))
            closeToolBrokerBestEffort()
        }
    }

    suspend fun validate(timeoutSeconds: Int) {
        updateState(request("get_state", timeoutSeconds))
    }

    override suspend fun refreshState(): PiSessionState {
        return updateState(request("get_state", configTimeout()))
    }

    override suspend fun refreshStats(): PiSessionStats {
        val response = request("get_session_stats", configTimeout())
        val data = response["data"]?.jsonObject ?: error("pi 未返回 session stats")
        return parsePiSessionStats(data).also { _stats.value = it }
    }

    override suspend fun compact(customInstructions: String?): PiCompactionResult = operationMutex.withLock {
        _state.update { it?.copy(isCompacting = true) }
        try {
            val response = request("compact", configTimeout()) {
                customInstructions?.takeIf(String::isNotBlank)?.let { put("customInstructions", it) }
            }
            val data = response["data"]?.jsonObject ?: error("pi 未返回 compaction result")
            return parsePiCompactionResult(data)
        } finally {
            _state.update { it?.copy(isCompacting = false) }
            refreshStateBestEffort()
            refreshStatsBestEffort()
        }
    }

    override suspend fun getCommands(): List<PiCommandInfo> = parsePiCommands(
        request("get_commands", configTimeout())
    )

    override suspend fun getAvailableModels(): List<PiModelInfo> = parsePiAvailableModels(
        request("get_available_models", configTimeout())
    )

    override suspend fun getAvailableThinkingLevels(): List<String> {
        val response = request("get_available_thinking_levels", configTimeout())
        return response["data"]?.jsonObject?.get("levels")?.jsonArray
            ?.mapNotNull { it.jsonPrimitive.contentOrNull }
            .orEmpty()
    }

    override suspend fun setModel(provider: String, modelId: String): PiSessionState = operationMutex.withLock {
        request("set_model", configTimeout()) {
            put("provider", provider)
            put("modelId", modelId)
        }
        refreshState()
    }

    override suspend fun setThinkingLevel(level: String): PiSessionState = operationMutex.withLock {
        request("set_thinking_level", configTimeout()) { put("level", level) }
        refreshState()
    }

    override suspend fun setAutoCompaction(enabled: Boolean): PiSessionState {
        request("set_auto_compaction", configTimeout()) { put("enabled", enabled) }
        return refreshState()
    }

    override suspend fun setAutoRetry(enabled: Boolean): PiSessionState {
        request("set_auto_retry", configTimeout()) { put("enabled", enabled) }
        return refreshState()
    }

    override suspend fun abortRetry() {
        request("abort_retry", configTimeout())
    }

    override suspend fun setSteeringMode(mode: String): PiSessionState {
        requireQueueMode(mode)
        request("set_steering_mode", configTimeout()) { put("mode", mode) }
        return refreshState()
    }

    override suspend fun setFollowUpMode(mode: String): PiSessionState {
        requireQueueMode(mode)
        request("set_follow_up_mode", configTimeout()) { put("mode", mode) }
        return refreshState()
    }

    override suspend fun getSessionTree(): PiSessionTree = parsePiSessionTree(
        request("get_tree", configTimeout())
    )

    override suspend fun fork(entryId: String): PiSessionMutationResult = operationMutex.withLock {
        val response = request("fork", configTimeout()) { put("entryId", entryId) }
        val data = response["data"]?.jsonObject ?: error("pi 未返回 fork result")
        val cancelled = data["cancelled"]?.jsonPrimitive?.booleanOrNull ?: false
        if (cancelled) {
            PiSessionMutationResult(cancelled = true, selectedText = data["text"]?.jsonPrimitive?.contentOrNull)
        } else {
            val state = refreshState()
            refreshStatsBestEffort()
            PiSessionMutationResult(
                cancelled = false,
                selectedText = data["text"]?.jsonPrimitive?.contentOrNull,
                state = state,
                messages = fetchConversationMessages(),
            )
        }
    }

    override suspend fun cloneSession(): PiSessionMutationResult = operationMutex.withLock {
        val response = request("clone", configTimeout())
        val data = response["data"]?.jsonObject ?: error("pi 未返回 clone result")
        val cancelled = data["cancelled"]?.jsonPrimitive?.booleanOrNull ?: false
        if (cancelled) {
            PiSessionMutationResult(cancelled = true)
        } else {
            val state = refreshState()
            refreshStatsBestEffort()
            PiSessionMutationResult(
                cancelled = false,
                state = state,
                messages = fetchConversationMessages(),
            )
        }
    }

    override suspend fun snapshot(): PiSessionSnapshot = operationMutex.withLock {
        val state = refreshState()
        refreshStatsBestEffort()
        PiSessionSnapshot(
            state = state,
            messages = fetchConversationMessages(),
        )
    }

    override suspend fun exportHtml(outputPath: String?): String = operationMutex.withLock {
        val response = request("export_html", configTimeout()) {
            outputPath?.takeIf(String::isNotBlank)?.let { put("outputPath", it) }
        }
        response["data"]?.jsonObject?.get("path")?.jsonPrimitive?.contentOrNull
            ?: error("pi 未返回导出路径")
    }

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit
    ): String = operationMutex.withLock {
        check(process.isAlive) { "pi 进程未运行" }
        val completed = CompletableDeferred<Unit>()
        check(activeRun.compareAndSet(null, completed)) { "pi 会话已有运行中的请求" }
        activeEventSink.set(onEvent)
        try {
            request("prompt", configTimeout()) {
                putPiPromptPayload(message, images)
            }
            _state.update { it?.copy(isStreaming = true) }
            withTimeout(configTimeout() * 1000L) { completed.await() }
            val response = request("get_last_assistant_text", configTimeout())
            refreshStateBestEffort()
            refreshStatsBestEffort()
            response["data"]?.jsonObject?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty()
        } catch (error: CancellationException) {
            withContext(NonCancellable) { runCatching { abort() } }
            _state.update { it?.copy(isStreaming = false) }
            throw error
        } finally {
            activeEventSink.set(null)
            abortedRun.compareAndSet(completed, null)
            activeRun.compareAndSet(completed, null)
        }
    }

    override suspend fun sendQueuedMessage(
        message: String,
        images: List<ImageData>,
        mode: PiQueuedMessageMode,
    ) {
        require(message.isNotBlank() || images.isNotEmpty()) { "Queued message cannot be blank" }
        check(process.isAlive) { "pi 进程未运行" }
        check(activeRun.get() != null) { "pi 会话当前没有运行中的请求" }
        request(
            type = when (mode) {
                PiQueuedMessageMode.STEER -> "steer"
                PiQueuedMessageMode.FOLLOW_UP -> "follow_up"
            },
            timeoutSeconds = configTimeout(),
        ) {
            putPiPromptPayload(message, images)
        }
        refreshStateBestEffort()
    }

    override suspend fun respondToExtensionUi(requestId: String, response: PiExtensionUiResponse) {
        require(requestId.isNotBlank()) { "Extension UI request id cannot be blank" }
        check(process.isAlive) { "pi 进程未运行" }
        sendJson(buildJsonObject {
            put("type", "extension_ui_response")
            put("id", requestId)
            when (response) {
                is PiExtensionUiResponse.Value -> put("value", response.value)
                is PiExtensionUiResponse.Confirmation -> put("confirmed", response.confirmed)
                PiExtensionUiResponse.Cancelled -> put("cancelled", true)
            }
        })
    }

    override suspend fun abort() {
        val run = activeRun.get() ?: return
        if (!process.isAlive || !abortedRun.compareAndSet(null, run)) return
        try {
            request("abort", 5)
        } catch (error: Throwable) {
            abortedRun.compareAndSet(run, null)
            throw error
        }
    }

    override suspend fun close() {
        withContext(NonCancellable + Dispatchers.IO) {
            val abortJob = scope.launch {
                runCatching {
                    if (process.isAlive) abort()
                }
            }
            var failure: Throwable? = null
            try {
                withTimeoutOrNull(CLOSE_ABORT_GRACE_MILLIS) { abortJob.join() }
                val brokerJobs = toolBrokerJobs.values.toList()
                failSession(IllegalStateException("pi 会话已关闭"))
                brokerJobs.joinAll()
                if (process.isAlive) {
                    process.destroy()
                    if (!process.waitFor(PROCESS_TERMINATION_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)) {
                        process.destroyForcibly()
                        check(
                            process.waitFor(
                                PROCESS_TERMINATION_TIMEOUT_SECONDS,
                                java.util.concurrent.TimeUnit.SECONDS,
                            ),
                        ) { "pi process ${process.pid()} did not terminate" }
                    }
                }
            } catch (error: Throwable) {
                failure = error
            } finally {
                abortJob.cancelAndJoin()
                try {
                    closeToolBroker()
                } catch (error: Throwable) {
                    failure?.addSuppressed(error) ?: run { failure = error }
                }
                writerMutex.withLock { runCatching { writer.close() } }
                scope.cancel()
            }
            failure?.let { throw it }
        }
    }

    private suspend fun closeToolBroker() = toolBrokerCloseMutex.withLock {
        if (toolBrokerClosed) return@withLock
        toolBroker?.close()
        toolBrokerClosed = true
    }

    private suspend fun closeToolBrokerBestEffort() {
        try {
            withContext(NonCancellable) { closeToolBroker() }
        } catch (error: Throwable) {
            log.warn(error) { "Failed to close pi tool broker for process $pid" }
        }
    }

    private fun configTimeout(): Int = config.timeoutSeconds

    private suspend fun request(
        type: String,
        timeoutSeconds: Int,
        fields: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}
    ): JsonObject {
        terminalError.get()?.let { throw it }
        val id = requestIds.incrementAndGet().toString()
        val response = CompletableDeferred<JsonObject>()
        pendingResponses[id] = response
        terminalError.get()?.let(response::completeExceptionally)
        try {
            val command = buildJsonObject {
                put("id", id)
                put("type", type)
                fields()
            }
            try {
                writerMutex.withLock {
                    terminalError.get()?.let { throw it }
                    withContext(Dispatchers.IO) {
                        writer.write(json.encodeToString(command))
                        writer.newLine()
                        writer.flush()
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                terminalError.get()?.let { throw it }
                val failure = IllegalStateException("pi RPC 写入失败: $type", error)
                failSession(failure)
                if (process.isAlive) process.destroy()
                throw terminalError.get() ?: failure
            }
            val payload = withTimeout(timeoutSeconds * 1000L) { response.await() }
            if (payload["success"]?.jsonPrimitive?.content == "false") {
                error(payload["error"]?.jsonPrimitive?.contentOrNull ?: "pi RPC 请求失败: $type")
            }
            return payload
        } finally {
            pendingResponses.remove(id)
        }
    }

    private fun failSession(error: Throwable) {
        if (!terminalError.compareAndSet(null, error)) return
        _state.update {
            it?.copy(
                isStreaming = false,
                isAlive = false,
                errorMessage = error.message,
            )
        }
        pendingResponses.values.forEach { response -> response.completeExceptionally(error) }
        pendingResponses.clear()
        activeRun.getAndSet(null)?.completeExceptionally(error)
        abortedRun.set(null)
        activeEventSink.set(null)
        toolBrokerJobs.entries.toList().forEach { (requestId, job) ->
            canceledToolBrokerRequests += requestId
            rememberCompletedToolBrokerRequest(requestId)
            if (toolBrokerJobs.remove(requestId, job)) job.cancel()
        }
    }

    private suspend fun handleLine(line: String) {
        if (line.isBlank()) return
        val payload = runCatching { json.parseToJsonElement(line).jsonObject }
            .getOrElse {
                log.warn { "忽略无法解析的 pi RPC 输出: ${it.message}" }
                return
            }
        when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "response" -> payload["id"]?.jsonPrimitive?.contentOrNull
                ?.let(pendingResponses::remove)
                ?.complete(payload)
            "tool_request" -> handleToolBrokerRequest(payload)
            "tool_cancel" -> handleToolBrokerCancel(payload)
            "extension_ui_request" -> handleExtensionUiRequest(payload)
            "agent_start" -> _state.update { it?.copy(isStreaming = true) }
            "compaction_start" -> _state.update { it?.copy(isCompacting = true) }
            "compaction_end" -> _state.update { it?.copy(isCompacting = false) }
            "auto_retry_start" -> _state.update {
                it?.copy(
                    isRetrying = true,
                    retryAttempt = payload["attempt"]?.jsonPrimitive?.intOrNull ?: 0,
                    retryMaxAttempts = payload["maxAttempts"]?.jsonPrimitive?.intOrNull ?: 0,
                    retryDelayMillis = payload["delayMs"]?.jsonPrimitive?.longOrNull,
                    retryErrorMessage = payload["errorMessage"]?.jsonPrimitive?.contentOrNull,
                )
            }
            "auto_retry_end" -> _state.update {
                it?.copy(
                    isRetrying = false,
                    retryErrorMessage = payload["finalError"]?.jsonPrimitive?.contentOrNull,
                )
            }
            "agent_end" -> if (payload["willRetry"]?.jsonPrimitive?.contentOrNull != "true") {
                emitEvent(parsePiAgentCompletion(payload))
                _state.update { it?.copy(isStreaming = false) }
                activeRun.get()?.complete(Unit)
            }
            "message_update" -> handleMessageUpdate(payload)
            "tool_execution_start" -> emitEvent(
                PiSessionEvent.ToolStarted(
                    id = payload["toolCallId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    name = payload["toolName"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    arguments = payload["args"]?.toString().orEmpty()
                )
            )
            "tool_execution_end" -> emitEvent(
                PiSessionEvent.ToolFinished(
                    id = payload["toolCallId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    name = payload["toolName"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    output = extractPiToolOutput(payload["result"]),
                    isError = payload["isError"]?.jsonPrimitive?.contentOrNull == "true"
                )
            )
        }
    }

    private suspend fun handleExtensionUiRequest(payload: JsonObject) {
        val id = payload["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
        if (id.isBlank()) {
            log.warn { "pi[$pid] ignored extension UI request without id" }
            return
        }
        when (val method = payload["method"]?.jsonPrimitive?.contentOrNull) {
            "select", "confirm", "input", "editor" -> emitEvent(
                PiSessionEvent.ExtensionUiRequested(
                    PiExtensionUiRequest(
                        id = id,
                        method = when (method) {
                            "select" -> PiExtensionUiMethod.SELECT
                            "confirm" -> PiExtensionUiMethod.CONFIRM
                            "input" -> PiExtensionUiMethod.INPUT
                            else -> PiExtensionUiMethod.EDITOR
                        },
                        title = payload["title"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        message = payload["message"]?.jsonPrimitive?.contentOrNull,
                        options = payload["options"]?.jsonArray
                            ?.mapNotNull { it.jsonPrimitive.contentOrNull }
                            .orEmpty(),
                        placeholder = payload["placeholder"]?.jsonPrimitive?.contentOrNull,
                        prefill = payload["prefill"]?.jsonPrimitive?.contentOrNull,
                        timeoutMillis = payload["timeout"]?.jsonPrimitive?.longOrNull,
                    )
                )
            )
            "notify" -> emitEvent(
                PiSessionEvent.ExtensionNotification(
                    message = payload["message"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    type = payload["notifyType"]?.jsonPrimitive?.contentOrNull ?: "info",
                )
            )
            "setStatus" -> emitEvent(
                PiSessionEvent.ExtensionStatusChanged(
                    key = payload["statusKey"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    text = payload["statusText"]?.jsonPrimitive?.contentOrNull,
                )
            )
            "setWidget" -> emitEvent(
                PiSessionEvent.ExtensionWidgetChanged(
                    key = payload["widgetKey"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    lines = payload["widgetLines"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull },
                    placement = payload["widgetPlacement"]?.jsonPrimitive?.contentOrNull,
                )
            )
            "setTitle" -> emitEvent(
                PiSessionEvent.ExtensionTitleChanged(
                    payload["title"]?.jsonPrimitive?.contentOrNull.orEmpty()
                )
            )
            "set_editor_text" -> emitEvent(
                PiSessionEvent.ExtensionEditorTextChanged(
                    payload["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                )
            )
            else -> log.warn { "pi[$pid] ignored unsupported extension UI method: $method" }
        }
    }

    private suspend fun handleToolBrokerRequest(payload: JsonObject) {
        val broker = toolBroker
        val nonce = toolBrokerNonce
        if (broker == null || nonce == null) {
            sendToolBrokerFailure(payload["requestId"]?.jsonPrimitive?.contentOrNull, "Tool broker is not configured")
            return
        }
        val request = try {
            parsePiToolBrokerRequest(payload, nonce)
        } catch (error: Throwable) {
            sendToolBrokerFailure(payload["requestId"]?.jsonPrimitive?.contentOrNull, error.message ?: "Invalid request")
            return
        }
        val requestSequence = request.requestId.substringAfter("tr-").toLong()
        if (!claimToolBrokerRequestSequence(requestSequence)) {
            val duplicateJob = toolBrokerJobs.remove(request.requestId)
            if (duplicateJob != null) {
                canceledToolBrokerRequests += request.requestId
                duplicateJob.cancel()
                rememberCompletedToolBrokerRequest(request.requestId)
            }
            sendToolBrokerFailure(request.requestId, "Duplicate or non-monotonic tool broker request")
            return
        }
        val duplicateJob = toolBrokerJobs.remove(request.requestId)
        if (request.requestId in completedToolBrokerRequests || duplicateJob != null) {
            if (duplicateJob != null) {
                canceledToolBrokerRequests += request.requestId
                duplicateJob.cancel()
                rememberCompletedToolBrokerRequest(request.requestId)
            }
            sendToolBrokerFailure(request.requestId, "Duplicate tool broker request")
            return
        }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val remainingMillis = request.deadlineMillis - System.currentTimeMillis()
                require(remainingMillis > 0) { "Tool broker request deadline expired" }
                val result = withTimeout(remainingMillis) { broker.execute(request) }
                require(result.auditId.isNotBlank()) { "Tool broker audit id is required" }
                if (request.requestId in canceledToolBrokerRequests) return@launch
                val response = buildJsonObject {
                    put("type", "tool_response")
                    put("requestId", request.requestId)
                    put("sessionNonce", nonce)
                    put("success", true)
                    put("result", result.result)
                    put("auditId", result.auditId)
                }
                require(json.encodeToString(response).encodeToByteArray().size <= MAX_PI_TOOL_BROKER_RESPONSE_BYTES) {
                    "Tool broker response exceeds ${MAX_PI_TOOL_BROKER_RESPONSE_BYTES}B limit"
                }
                sendJson(response)
            } catch (error: TimeoutCancellationException) {
                if (request.requestId !in canceledToolBrokerRequests) {
                    sendToolBrokerFailure(request.requestId, "Tool broker request deadline expired")
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (request.requestId !in canceledToolBrokerRequests) {
                    sendToolBrokerFailure(request.requestId, error.message ?: "Tool broker execution failed")
                }
            } finally {
                toolBrokerJobs.remove(request.requestId)
                rememberCompletedToolBrokerRequest(request.requestId)
                canceledToolBrokerRequests.remove(request.requestId)
            }
        }
        val existingJob = toolBrokerJobs.putIfAbsent(request.requestId, job)
        if (existingJob == null) {
            job.start()
        } else {
            canceledToolBrokerRequests += request.requestId
            if (toolBrokerJobs.remove(request.requestId, existingJob)) existingJob.cancel()
            rememberCompletedToolBrokerRequest(request.requestId)
            job.cancel()
            sendToolBrokerFailure(request.requestId, "Duplicate tool broker request")
        }
    }

    private fun handleToolBrokerCancel(payload: JsonObject) {
        val requestId = payload["requestId"]?.jsonPrimitive?.contentOrNull ?: return
        val nonce = payload["sessionNonce"]?.jsonPrimitive?.contentOrNull ?: return
        if (nonce != toolBrokerNonce) return
        val job = toolBrokerJobs.remove(requestId) ?: return
        canceledToolBrokerRequests += requestId
        rememberCompletedToolBrokerRequest(requestId)
        job.cancel()
    }

    private fun claimToolBrokerRequestSequence(sequence: Long): Boolean {
        while (true) {
            val current = lastToolBrokerRequestSequence.get()
            if (sequence <= current) return false
            if (lastToolBrokerRequestSequence.compareAndSet(current, sequence)) return true
        }
    }

    private fun rememberCompletedToolBrokerRequest(requestId: String) {
        synchronized(completedToolBrokerRequests) {
            completedToolBrokerRequests += requestId
            while (completedToolBrokerRequests.size > MAX_COMPLETED_TOOL_BROKER_REQUESTS) {
                completedToolBrokerRequests.firstOrNull()?.let(completedToolBrokerRequests::remove) ?: break
            }
        }
    }

    private suspend fun sendToolBrokerFailure(requestId: String?, message: String) {
        val nonce = toolBrokerNonce ?: return
        if (requestId.isNullOrBlank()) return
        sendJson(buildJsonObject {
            put("type", "tool_response")
            put("requestId", requestId)
            put("sessionNonce", nonce)
            put("success", false)
            put("error", message.take(MAX_TOOL_BROKER_ERROR_CHARS))
        })
    }

    private suspend fun sendJson(command: JsonObject) {
        writerMutex.withLock {
            terminalError.get()?.let { throw it }
            withContext(Dispatchers.IO) {
                writer.write(json.encodeToString(command))
                writer.newLine()
                writer.flush()
            }
        }
    }

    private suspend fun handleMessageUpdate(payload: JsonObject) {
        val event = payload["assistantMessageEvent"]?.jsonObject ?: return
        val delta = event["delta"]?.jsonPrimitive?.contentOrNull ?: return
        when (event["type"]?.jsonPrimitive?.contentOrNull) {
            "text_delta" -> emitEvent(PiSessionEvent.TextDelta(delta))
            "thinking_delta" -> emitEvent(PiSessionEvent.ThinkingDelta(delta))
        }
    }

    private suspend fun emitEvent(event: PiSessionEvent) {
        try {
            activeEventSink.get()?.invoke(event)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "pi[$pid] event consumer failed: ${error.message}" }
        }
    }

    private fun updateState(response: JsonObject): PiSessionState {
        val data = response["data"]?.jsonObject ?: error("pi 未返回 state data")
        return parsePiSessionState(data, pid).also { parsed ->
            remoteSessionId = parsed.sessionId
            _state.value = parsed
        }
    }

    private suspend fun refreshStateBestEffort() {
        try {
            refreshState()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "pi[$pid] refresh state failed: ${error.message}" }
        }
    }

    private suspend fun refreshStatsBestEffort() {
        try {
            refreshStats()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "pi[$pid] refresh stats failed: ${error.message}" }
        }
    }

    private suspend fun fetchConversationMessages(): List<PiConversationMessage> =
        parsePiConversationMessages(request("get_messages", configTimeout()))
}

internal fun piProcessEnvironment(
    config: AgentConfig,
    toolBrokerNonce: String? = null,
    brokerCoreTools: Boolean = true,
): Map<String, String> =
    config.env.filterKeys { it !in MANAGED_PI_ENVIRONMENT_VARIABLES } + buildMap {
        put("PI_CODING_AGENT_DIR", PiRuntimePaths.agentDirectory(config.id).absolutePath)
        put("SWARM_PI_AGENT_ID", config.id)
        put("SWARM_EDITOR_MCP_CONFIG", ConfigPaths.MCP_SERVERS_JSON)
        if (toolBrokerNonce != null) {
            put("SWARM_PI_TOOL_BROKER", "stdio-v1")
            put("SWARM_PI_TOOL_BROKER_NONCE", toolBrokerNonce)
            put("SWARM_PI_TOOL_BROKER_CORE_TOOLS", if (brokerCoreTools) "1" else "0")
        }
    }

internal fun parsePiSessionState(data: JsonObject, pid: Long?): PiSessionState {
    val model = data["model"]?.let { element -> runCatching { element.jsonObject }.getOrNull() }
    return PiSessionState(
        pid = pid,
        sessionId = data["sessionId"]?.jsonPrimitive?.contentOrNull ?: error("pi 未返回 sessionId"),
        sessionName = data["sessionName"]?.jsonPrimitive?.contentOrNull,
        provider = model?.get("provider")?.jsonPrimitive?.contentOrNull,
        modelId = model?.get("id")?.jsonPrimitive?.contentOrNull,
        modelName = model?.get("name")?.jsonPrimitive?.contentOrNull,
        contextWindow = model?.get("contextWindow")?.jsonPrimitive?.intOrNull,
        maxTokens = model?.get("maxTokens")?.jsonPrimitive?.intOrNull,
        thinkingLevel = data["thinkingLevel"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        isStreaming = data["isStreaming"]?.jsonPrimitive?.booleanOrNull ?: false,
        isCompacting = data["isCompacting"]?.jsonPrimitive?.booleanOrNull ?: false,
        autoCompactionEnabled = data["autoCompactionEnabled"]?.jsonPrimitive?.booleanOrNull ?: false,
        messageCount = data["messageCount"]?.jsonPrimitive?.intOrNull ?: 0,
        pendingMessageCount = data["pendingMessageCount"]?.jsonPrimitive?.intOrNull ?: 0,
        tools = data["tools"]?.jsonArray?.mapNotNull { element ->
            runCatching { element.jsonObject }.getOrNull()?.let { tool ->
                PiToolInfo(
                    name = tool["name"]?.jsonPrimitive?.contentOrNull ?: return@let null,
                    description = tool["description"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    active = tool["active"]?.jsonPrimitive?.booleanOrNull ?: false,
                )
            }
        }.orEmpty(),
        isAlive = true,
        errorMessage = null,
        steeringMode = data["steeringMode"]?.jsonPrimitive?.contentOrNull ?: "one-at-a-time",
        followUpMode = data["followUpMode"]?.jsonPrimitive?.contentOrNull ?: "one-at-a-time",
        autoRetryEnabled = data["autoRetryEnabled"]?.jsonPrimitive?.booleanOrNull ?: true,
        isRetrying = data["isRetrying"]?.jsonPrimitive?.booleanOrNull ?: false,
    )
}

private fun requireQueueMode(mode: String) {
    require(mode == "all" || mode == "one-at-a-time") { "Unsupported pi queue mode: $mode" }
}

internal fun parsePiCommands(response: JsonObject): List<PiCommandInfo> {
    val commands = response["data"]?.jsonObject?.get("commands")?.jsonArray.orEmpty()
    return commands.mapNotNull { element ->
        val command = runCatching { element.jsonObject }.getOrNull() ?: return@mapNotNull null
        val name = command["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        PiCommandInfo(
            name = name,
            description = command["description"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            source = command["source"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }
}

internal fun parsePiAvailableModels(response: JsonObject): List<PiModelInfo> {
    val models = response["data"]?.jsonObject?.get("models")?.jsonArray.orEmpty()
    return models.mapNotNull { element ->
        val model = runCatching { element.jsonObject }.getOrNull() ?: return@mapNotNull null
        val provider = model["provider"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        val id = model["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        PiModelInfo(
            provider = provider,
            id = id,
            name = model["name"]?.jsonPrimitive?.contentOrNull ?: id,
            api = model["api"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            reasoning = model["reasoning"]?.jsonPrimitive?.booleanOrNull ?: false,
            contextWindow = model["contextWindow"]?.jsonPrimitive?.intOrNull ?: 0,
            maxTokens = model["maxTokens"]?.jsonPrimitive?.intOrNull ?: 0,
            inputModes = model["input"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
        )
    }.sortedWith(compareBy(PiModelInfo::provider, PiModelInfo::name))
}

internal fun parsePiConversationMessages(response: JsonObject): List<PiConversationMessage> {
    val messages = response["data"]?.jsonObject?.get("messages")?.jsonArray.orEmpty()
    val parsed = mutableListOf<PiConversationMessage>()
    val toolLocations = mutableMapOf<String, Pair<Int, Int>>()
    messages.forEach { element ->
        val message = runCatching { element.jsonObject }.getOrNull() ?: return@forEach
        val role = message["role"]?.jsonPrimitive?.contentOrNull ?: return@forEach
        when (role) {
            "user", "assistant" -> {
                val text = extractPiText(message["content"])
                val toolExecutions = if (role == "assistant") parsePiToolCalls(message["content"]) else emptyList()
                if (text.isBlank() && toolExecutions.isEmpty()) return@forEach
                val messageIndex = parsed.size
                parsed += PiConversationMessage(
                    role = role,
                    text = text,
                    timestampMillis = message["timestamp"]?.jsonPrimitive?.longOrNull,
                    toolExecutions = toolExecutions,
                )
                toolExecutions.forEachIndexed { toolIndex, execution ->
                    toolLocations[execution.id] = messageIndex to toolIndex
                }
            }
            "toolResult" -> {
                val toolCallId = message["toolCallId"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                val (messageIndex, toolIndex) = toolLocations[toolCallId] ?: return@forEach
                val owner = parsed[messageIndex]
                val executions = owner.toolExecutions.toMutableList()
                val started = executions[toolIndex]
                executions[toolIndex] = started.copy(
                    name = message["toolName"]?.jsonPrimitive?.contentOrNull?.ifBlank { started.name } ?: started.name,
                    output = extractPiToolOutput(message),
                    isError = message["isError"]?.jsonPrimitive?.booleanOrNull ?: false,
                )
                parsed[messageIndex] = owner.copy(toolExecutions = executions)
            }
        }
    }
    return parsed
}

private fun parsePiToolCalls(content: JsonElement?): List<ToolExecution> {
    val blocks = runCatching { content?.jsonArray }.getOrNull() ?: return emptyList()
    return blocks.mapNotNull { blockElement ->
        val block = runCatching { blockElement.jsonObject }.getOrNull() ?: return@mapNotNull null
        if (block["type"]?.jsonPrimitive?.contentOrNull != "toolCall") return@mapNotNull null
        val id = block["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        val name = block["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        ToolExecution(
            id = id,
            name = name,
            arguments = block["arguments"]?.toString().orEmpty(),
        )
    }
}

internal fun parsePiSessionTree(response: JsonObject): PiSessionTree {
    val data = response["data"]?.jsonObject ?: error("pi 未返回 session tree")
    return PiSessionTree(
        roots = data["tree"]?.jsonArray?.mapNotNull(::parsePiSessionTreeNode).orEmpty(),
        leafId = data["leafId"]?.jsonPrimitive?.contentOrNull,
    )
}

private fun parsePiSessionTreeNode(element: kotlinx.serialization.json.JsonElement): PiSessionTreeNode? {
    val node = runCatching { element.jsonObject }.getOrNull() ?: return null
    val entry = node["entry"]?.jsonObject ?: return null
    val entryId = entry["id"]?.jsonPrimitive?.contentOrNull ?: return null
    val message = entry["message"]?.let { runCatching { it.jsonObject }.getOrNull() }
    return PiSessionTreeNode(
        entryId = entryId,
        parentId = entry["parentId"]?.jsonPrimitive?.contentOrNull,
        type = entry["type"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        role = message?.get("role")?.jsonPrimitive?.contentOrNull,
        text = extractPiText(message?.get("content")),
        timestamp = entry["timestamp"]?.jsonPrimitive?.contentOrNull,
        label = node["label"]?.jsonPrimitive?.contentOrNull,
        children = node["children"]?.jsonArray?.mapNotNull(::parsePiSessionTreeNode).orEmpty(),
    )
}

private fun extractPiText(content: kotlinx.serialization.json.JsonElement?): String {
    if (content == null) return ""
    runCatching { content.jsonPrimitive.contentOrNull }.getOrNull()?.let { return it }
    val blocks = runCatching { content.jsonArray }.getOrNull() ?: return ""
    return blocks.mapNotNull { blockElement ->
        val block = runCatching { blockElement.jsonObject }.getOrNull() ?: return@mapNotNull null
        when (block["type"]?.jsonPrimitive?.contentOrNull) {
            "text" -> block["text"]?.jsonPrimitive?.contentOrNull
            "thinking" -> null
            else -> null
        }
    }.joinToString("\n")
}

internal fun extractPiToolOutput(result: JsonElement?): String {
    if (result == null) return ""
    val resultObject = runCatching { result.jsonObject }.getOrNull()
        ?: return runCatching { result.jsonPrimitive.contentOrNull }.getOrNull().orEmpty().boundedToolOutput()
    return extractPiText(resultObject["content"]).ifBlank {
        resultObject["details"]?.let { details ->
            runCatching { details.jsonPrimitive.contentOrNull }.getOrNull() ?: details.toString()
        }.orEmpty()
    }.boundedToolOutput()
}

internal fun parsePiAgentCompletion(payload: JsonObject): PiSessionEvent.AgentCompleted {
    val messages = payload["messages"]
        ?.let { runCatching { it.jsonArray }.getOrNull() }
        .orEmpty()
    val assistant = messages.asReversed()
        .mapNotNull { runCatching { it.jsonObject }.getOrNull() }
        .firstOrNull { it["role"]?.jsonPrimitive?.contentOrNull == "assistant" }
    return PiSessionEvent.AgentCompleted(
        stopReason = assistant?.get("stopReason")?.jsonPrimitive?.contentOrNull,
        rawStopReason = assistant?.get("rawStopReason")?.jsonPrimitive?.contentOrNull,
        errorMessage = assistant?.get("errorMessage")?.jsonPrimitive?.contentOrNull,
    )
}

private fun String.boundedToolOutput(): String {
    if (length <= MAX_TOOL_OUTPUT_CHARS) return this
    val edgeLength = MAX_TOOL_OUTPUT_CHARS / 2
    return take(edgeLength) + "\n… tool output truncated …\n" + takeLast(edgeLength)
}

internal fun parsePiSessionStats(data: JsonObject): PiSessionStats {
    val tokens = data["tokens"]?.jsonObject ?: error("pi 未返回 token stats")
    val context = data["contextUsage"]?.let { element -> runCatching { element.jsonObject }.getOrNull() }
    return PiSessionStats(
        sessionId = data["sessionId"]?.jsonPrimitive?.contentOrNull ?: error("pi 未返回 sessionId"),
        userMessages = data["userMessages"]?.jsonPrimitive?.intOrNull ?: 0,
        assistantMessages = data["assistantMessages"]?.jsonPrimitive?.intOrNull ?: 0,
        toolCalls = data["toolCalls"]?.jsonPrimitive?.intOrNull ?: 0,
        toolResults = data["toolResults"]?.jsonPrimitive?.intOrNull ?: 0,
        totalMessages = data["totalMessages"]?.jsonPrimitive?.intOrNull ?: 0,
        tokens = PiTokenUsage(
            input = tokens["input"]?.jsonPrimitive?.longOrNull ?: 0,
            output = tokens["output"]?.jsonPrimitive?.longOrNull ?: 0,
            cacheRead = tokens["cacheRead"]?.jsonPrimitive?.longOrNull ?: 0,
            cacheWrite = tokens["cacheWrite"]?.jsonPrimitive?.longOrNull ?: 0,
            total = tokens["total"]?.jsonPrimitive?.longOrNull ?: 0,
        ),
        cost = data["cost"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
        contextUsage = context?.let {
            PiContextUsage(
                tokens = it["tokens"]?.jsonPrimitive?.longOrNull,
                contextWindow = it["contextWindow"]?.jsonPrimitive?.intOrNull ?: 0,
                percent = it["percent"]?.jsonPrimitive?.doubleOrNull,
            )
        }
    )
}

internal fun parsePiCompactionResult(data: JsonObject): PiCompactionResult = PiCompactionResult(
    summary = data["summary"]?.jsonPrimitive?.contentOrNull.orEmpty(),
    firstKeptEntryId = data["firstKeptEntryId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
    tokensBefore = data["tokensBefore"]?.jsonPrimitive?.longOrNull ?: 0,
    estimatedTokensAfter = data["estimatedTokensAfter"]?.jsonPrimitive?.longOrNull,
)

internal fun kotlinx.serialization.json.JsonObjectBuilder.putPiPromptPayload(
    message: String,
    images: List<ImageData>
) {
    put("message", message)
    if (images.isNotEmpty()) {
        putJsonArray("images") {
            images.forEach { image ->
                addJsonObject {
                    put("type", "image")
                    put("data", image.base64)
                    put("mimeType", image.mimeType)
                }
            }
        }
    }
}

internal suspend fun readJsonLines(
    input: InputStream,
    onLine: suspend (String) -> Unit,
    maxLineBytes: Int = MAX_PI_RPC_LINE_BYTES,
) = withContext(Dispatchers.IO) {
    require(maxLineBytes > 0) { "maxLineBytes must be positive" }
    input.use { stream ->
        val buffer = ByteArrayOutputStream()
        while (true) {
            val byte = stream.read()
            if (byte == -1) break
            if (byte == '\n'.code) {
                val bytes = buffer.toByteArray()
                val size = if (bytes.lastOrNull() == '\r'.code.toByte()) bytes.size - 1 else bytes.size
                onLine(String(bytes, 0, size, Charsets.UTF_8))
                buffer.reset()
            } else {
                check(buffer.size() < maxLineBytes) { "pi RPC 单行输出超过 ${maxLineBytes}B 限制" }
                buffer.write(byte)
            }
        }
        if (buffer.size() > 0) onLine(buffer.toString(Charsets.UTF_8))
    }
}
