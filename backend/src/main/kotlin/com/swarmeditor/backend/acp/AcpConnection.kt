package com.swarmeditor.backend.acp

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.protocol.JsonRpcError
import com.swarmeditor.common.protocol.JsonRpcNotification
import com.swarmeditor.common.protocol.JsonRpcRequest
import com.swarmeditor.common.protocol.JsonRpcResponse
import com.swarmeditor.common.protocol.RequestId
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter

/**
 * ACP 连接 — 管理单个 Agent 进程的 ACP 通信。
 *
 * 生命周期：disconnected → connecting → connected → error
 * 通过 stdio (stdin/stdout) 与 Agent CLI 进程通信，协议为 JSON-RPC 2.0 over JSON Lines。
 */
class AcpConnection(
    val agentId: String,
    private val config: AgentConfig
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Volatile
    var status: AgentStatus = AgentStatus.DISCONNECTED
        private set

    @Volatile
    var errorMessage: String? = null
        private set

    private var process: Process? = null
    private var writer: BufferedWriter? = null
    private var readerJob: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var nextId = 1L
    private val pendingRequests = mutableMapOf<Long, CompletableDeferred<JsonRpcResponse>>()
    private val notificationHandlers = mutableListOf<(JsonRpcNotification) -> Unit>()

    val isConnected: Boolean get() = status == AgentStatus.CONNECTED

    /**
     * 启动 Agent 进程并完成 ACP initialize 握手。
     */
    suspend fun connect(): Result<Unit> = withContext(Dispatchers.IO) {
        if (status == AgentStatus.CONNECTED) return@withContext Result.success(Unit)

        status = AgentStatus.CONNECTING
        errorMessage = null

        try {
            // 启动 Agent CLI 进程
            val cmd = mutableListOf(config.command) + config.args
            val pb = ProcessBuilder(cmd)
            pb.environment().putAll(config.env)
            pb.redirectErrorStream(false)

            process = pb.start()
            writer = BufferedWriter(OutputStreamWriter(process!!.outputStream, Charsets.UTF_8))
            val reader = BufferedReader(InputStreamReader(process!!.inputStream, Charsets.UTF_8))

            // 启动读取循环
            readerJob = scope.launch { readLoop(reader) }

            // ACP initialize 握手
            val initResult = initialize()
            if (initResult.isFailure) {
                status = AgentStatus.ERROR
                errorMessage = initResult.exceptionOrNull()?.message
                close()
                return@withContext Result.failure(initResult.exceptionOrNull()!!)
            }

            status = AgentStatus.CONNECTED
            Result.success(Unit)
        } catch (e: Exception) {
            status = AgentStatus.ERROR
            errorMessage = e.message
            Result.failure(e)
        }
    }

    /**
     * ACP initialize 握手。
     */
    private suspend fun initialize(): Result<JsonElement> {
        val response = sendRequest(
            method = "initialize",
            params = json.encodeToJsonElement(
                InitializeParams.serializer(),
                InitializeParams(
                    protocolVersion = "1",
                    clientInfo = ClientInfo(
                        name = "swarm-editor",
                        version = "0.1.0"
                    )
                )
            )
        )
        return if (response.error != null) {
            Result.failure(AcpException(response.error!!))
        } else {
            // 发送 initialized 通知
            sendNotification("notifications/initialized")
            Result.success(response.result ?: JsonElement.serializer().let { json.encodeToJsonElement(it, kotlinx.serialization.json.JsonObject(emptyMap())) })
        }
    }

    /**
     * 创建新会话。
     */
    suspend fun createSession(mode: String = "default"): Result<String> {
        val response = sendRequest(
            method = "session/new",
            params = json.encodeToJsonElement(
                SessionNewParams.serializer(),
                SessionNewParams(mode = mode)
            )
        )
        return if (response.error != null) {
            Result.failure(AcpException(response.error!!))
        } else {
            val result = response.result
            val sessionId = result?.let {
                json.decodeFromString(SessionNewResult.serializer(), it.toString())
            }?.sessionId ?: ""
            Result.success(sessionId)
        }
    }

    /**
     * 发送 prompt 到会话。
     */
    suspend fun sendPrompt(sessionId: String, prompt: String): Result<String> {
        val response = sendRequest(
            method = "session/prompt",
            params = json.encodeToJsonElement(
                SessionPromptParams.serializer(),
                SessionPromptParams(
                    sessionId = sessionId,
                    prompt = PromptContent(
                        content = listOf(ContentBlock(type = "text", text = prompt))
                    )
                )
            )
        )
        return if (response.error != null) {
            Result.failure(AcpException(response.error!!))
        } else {
            val result = response.result?.let {
                json.decodeFromString(SessionPromptResult.serializer(), it.toString())
            }
            Result.success(result?.content?.firstOrNull()?.text ?: "")
        }
    }

    /**
     * 关闭会话。
     */
    suspend fun closeSession(sessionId: String): Result<Unit> {
        val response = sendRequest(
            method = "session/close",
            params = json.encodeToJsonElement(
                SessionCloseParams.serializer(),
                SessionCloseParams(sessionId = sessionId)
            )
        )
        return if (response.error != null) {
            Result.failure(AcpException(response.error!!))
        } else {
            Result.success(Unit)
        }
    }

    /**
     * 注册通知处理器。
     */
    fun onNotification(handler: (JsonRpcNotification) -> Unit) {
        notificationHandlers.add(handler)
    }

    /**
     * 发送 JSON-RPC 请求并等待响应。
     */
    private suspend fun sendRequest(method: String, params: JsonElement? = null): JsonRpcResponse {
        val id = nextId++
        val request = JsonRpcRequest(
            id = RequestId.NumericId(id),
            method = method,
            params = params
        )

        val deferred = CompletableDeferred<JsonRpcResponse>()
        pendingRequests[id] = deferred

        val message = json.encodeToString(JsonRpcRequest.serializer(), request)
        withContext(Dispatchers.IO) {
            writer?.apply {
                write(message)
                newLine()
                flush()
            }
        }

        return withTimeout(config.timeout * 1000L) {
            deferred.await()
        }
    }

    /**
     * 发送 JSON-RPC 通知（无 id，无响应）。
     */
    private suspend fun sendNotification(method: String, params: JsonElement? = null) {
        val notification = JsonRpcNotification(
            method = method,
            params = params
        )
        val message = json.encodeToString(JsonRpcNotification.serializer(), notification)
        withContext(Dispatchers.IO) {
            writer?.apply {
                write(message)
                newLine()
                flush()
            }
        }
    }

    /**
     * 读取循环 — 从 Agent stdout 读取 JSON Lines。
     */
    private suspend fun readLoop(reader: BufferedReader) {
        try {
            while (true) {
                val line = withContext(Dispatchers.IO) { reader.readLine() } ?: break
                if (line.isBlank()) continue

                try {
                    // 先尝试解析为响应（有 id）
                    val response = json.decodeFromString(JsonRpcResponse.serializer(), line)
                    if (response.id != null) {
                        val rid = response.id
                        val id = when (rid) {
                            is RequestId.NumericId -> rid.value
                            is RequestId.StringId -> rid.value.toLongOrNull() ?: continue
                            null -> continue
                        }
                        pendingRequests.remove(id)?.complete(response)
                    }
                } catch (_: Exception) {
                    try {
                        // 尝试解析为通知（无 id）
                        val notification = json.decodeFromString(JsonRpcNotification.serializer(), line)
                        notificationHandlers.forEach { it(notification) }
                    } catch (_: Exception) {
                        // 忽略无法解析的行
                    }
                }
            }
        } catch (_: Exception) {
            // 读取循环结束
        } finally {
            if (status == AgentStatus.CONNECTED) {
                status = AgentStatus.DISCONNECTED
            }
        }
    }

    /**
     * 关闭连接，终止 Agent 进程。
     */
    fun close() {
        readerJob?.cancel()
        try {
            writer?.close()
        } catch (_: Exception) {}
        try {
            process?.destroyForcibly()
        } catch (_: Exception) {}
        process = null
        writer = null
        pendingRequests.values.forEach { it.completeExceptionally(Exception("Connection closed")) }
        pendingRequests.clear()
        if (status == AgentStatus.CONNECTED) {
            status = AgentStatus.DISCONNECTED
        }
    }
}

/** ACP 异常 */
class AcpException(val error: JsonRpcError) : Exception("ACP error ${error.code}: ${error.message}")
