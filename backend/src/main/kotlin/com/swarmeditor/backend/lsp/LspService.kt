package com.swarmeditor.backend.lsp

import com.swarmeditor.backend.process.readTruncatedUtf8Lines
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

private val log = KotlinLogging.logger {}
private const val MAX_LSP_MESSAGE_BYTES = 16 * 1024 * 1024
private const val MAX_LSP_HEADER_LINE_BYTES = 8 * 1024
private const val LSP_CLOSE_GRACE_MILLIS = 250L
private const val LSP_PROCESS_TERMINATION_TIMEOUT_SECONDS = 1L
private val TRANSIENT_LSP_RETRY_DELAYS_MILLIS = listOf(250L, 500L, 1_000L, 2_000L, 4_000L, 8_000L)
private val TRANSIENT_LSP_ERROR_CODES = setOf(-32800, -32801)

internal class LspResponseException(
    val code: Int?,
    message: String,
) : IllegalStateException(message)

internal suspend fun <T> retryTransientLspRequest(
    retryDelaysMillis: List<Long> = TRANSIENT_LSP_RETRY_DELAYS_MILLIS,
    pause: suspend (Long) -> Unit = { delay(it) },
    request: suspend () -> T,
): T {
    retryDelaysMillis.forEach { delayMillis ->
        try {
            return request()
        } catch (error: CancellationException) {
            throw error
        } catch (error: LspResponseException) {
            if (!error.isTransientCancellation()) throw error
            pause(delayMillis)
        }
    }
    return request()
}

private fun LspResponseException.isTransientCancellation(): Boolean =
    code in TRANSIENT_LSP_ERROR_CODES ||
        message.orEmpty().contains("cancel", ignoreCase = true) ||
        message.orEmpty().contains("timed out", ignoreCase = true)

data class SemanticHighlight(
    val line: Int,
    val startCharacter: Int,
    val length: Int,
    val tokenType: String,
    val modifiers: Set<String> = emptySet(),
)

data class LspHighlightResult(
    val languageId: String,
    val serverName: String? = null,
    val highlights: List<SemanticHighlight> = emptyList(),
    val message: String? = null,
)

data class SourceSymbol(
    val name: String,
    val kind: String,
    val line: Int,
    val containerName: String? = null,
)

data class SourceDiagnostic(
    val line: Int,
    val severity: String,
    val message: String,
)

data class SourceFoldingRange(
    val startLine: Int,
    val endLine: Int,
    val kind: String? = null,
)

data class LspDocumentInsight(
    val languageId: String,
    val serverName: String? = null,
    val highlights: List<SemanticHighlight> = emptyList(),
    val symbols: List<SourceSymbol> = emptyList(),
    val diagnostics: List<SourceDiagnostic> = emptyList(),
    val foldingRanges: List<SourceFoldingRange> = emptyList(),
    val message: String? = null,
)

enum class LspConnectionPhase {
    IDLE,
    CONNECTING,
    CONNECTED,
    UNAVAILABLE,
    FAILED,
}

data class LspServerConnectionState(
    val id: String,
    val displayName: String,
    val phase: LspConnectionPhase = LspConnectionPhase.IDLE,
    val command: List<String> = emptyList(),
    val serverName: String? = null,
    val message: String? = null,
)

interface SourceSemanticHighlighter {
    suspend fun highlight(file: File, content: String): LspHighlightResult
    suspend fun close() = Unit
}

interface SourceCodeIntelligence : SourceSemanticHighlighter {
    suspend fun inspect(file: File, content: String): LspDocumentInsight
}

class LspService(
    private val projectRoot: File,
    private val specs: List<LspServerSpec> = defaultLspServerSpecs(),
    private val sessionFactory: suspend (LspServerSpec) -> LspSession = { spec ->
        StdioLspSession(projectRoot, spec)
    },
    private val commandAvailability: (String) -> Boolean = ::commandAvailable,
    private val managedCommandProvider: suspend (LspServerSpec) -> List<String>? = { null },
) : SourceCodeIntelligence {
    private val sessions = ConcurrentHashMap<String, LspSession>()
    private val sessionLifecycleLocks = ConcurrentHashMap<String, Mutex>()
    private val sessionMutex = Mutex()
    private val closed = AtomicBoolean()
    private val _serverStates = MutableStateFlow(
        specs.associate { spec ->
            spec.id to LspServerConnectionState(id = spec.id, displayName = spec.displayName)
        },
    )
    val serverStates: StateFlow<Map<String, LspServerConnectionState>> = _serverStates.asStateFlow()

    override suspend fun highlight(file: File, content: String): LspHighlightResult {
        check(!closed.get()) { "LSP service is closed" }
        val extension = file.extension.lowercase()
        val spec = specs.firstOrNull { extension in it.extensions }
            ?: return LspHighlightResult(languageId = extension, message = "该文件类型未配置 LSP")
        val activeSession = sessionMutex.withLock {
            check(!closed.get()) { "LSP service is closed" }
            sessions[spec.id]
        }
        if (activeSession != null) {
            try {
                return activeSession.highlight(file, content).also { result ->
                    updateServerState(
                        spec,
                        phase = LspConnectionPhase.CONNECTED,
                        serverName = result.serverName,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                check(!closed.get()) { "LSP service is closed" }
                updateServerState(spec, phase = LspConnectionPhase.FAILED, message = error.message)
                val closeError = discardSession(spec.id, activeSession)
                log.warn(error) { "Active ${spec.displayName} session failed; trying configured commands" }
                if (closeError != null) {
                    error.addSuppressed(closeError)
                    return unavailableResult(spec, listOf("${spec.displayName}：${error.message ?: "未知错误"}"))
                }
            }
        }
        val managedCommand = if (spec.hasExplicitCommandOverride) null else managedCommandProvider(spec)
        val candidates = buildList {
            managedCommand?.let(::add)
            addAll(spec.commandCandidates)
        }.distinct()
        val commands = candidates.filter { commandAvailability(it.first()) }
        if (commands.isEmpty()) {
            val candidateDescription = candidates.joinToString(" / ") { it.joinToString(" ") }
            val environmentVariable = "SWARM_LSP_${spec.id.uppercase()}"
            updateServerState(
                spec,
                phase = LspConnectionPhase.UNAVAILABLE,
                message = "未发现可执行的语言服务器",
            )
            return LspHighlightResult(
                languageId = spec.languageId,
                message = buildString {
                    append("未发现 ${spec.displayName}（尝试：$candidateDescription；可通过 ")
                    append("$environmentVariable 或 swarm.lsp.${spec.id} 配置），已使用本地语法高亮")
                },
            )
        }
        val failures = mutableListOf<String>()
        commands.forEach { command ->
            var session: LspSession? = null
            try {
                updateServerState(spec, phase = LspConnectionPhase.CONNECTING, command = command)
                val resolvedSpec = spec.copy(commandCandidates = listOf(command))
                session = sessionMutex.withLock {
                    check(!closed.get()) { "LSP service is closed" }
                    sessions[spec.id] ?: sessionFactory(resolvedSpec).also { sessions[spec.id] = it }
                }
                return session.highlight(file, content).also { result ->
                    updateServerState(
                        spec,
                        phase = LspConnectionPhase.CONNECTED,
                        command = command,
                        serverName = result.serverName,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                check(!closed.get()) { "LSP service is closed" }
                val closeError = discardSession(spec.id, session)
                val executable = command.first()
                failures += "$executable：${error.message ?: "未知错误"}"
                updateServerState(
                    spec,
                    phase = LspConnectionPhase.FAILED,
                    command = command,
                    message = error.message,
                )
                log.warn(error) { "$executable failed; trying the next ${spec.displayName} command" }
                if (closeError != null) {
                    error.addSuppressed(closeError)
                    return unavailableResult(spec, failures)
                }
            }
        }
        return unavailableResult(spec, failures)
    }

    override suspend fun inspect(file: File, content: String): LspDocumentInsight {
        val highlighted = highlight(file, content)
        if (highlighted.serverName == null) {
            return LspDocumentInsight(
                languageId = highlighted.languageId,
                highlights = highlighted.highlights,
                message = highlighted.message,
            )
        }
        val spec = specs.firstOrNull { file.extension.lowercase() in it.extensions }
            ?: return LspDocumentInsight(
                languageId = highlighted.languageId,
                highlights = highlighted.highlights,
                message = highlighted.message,
            )
        val session = sessionMutex.withLock { sessions[spec.id] }
            ?: return LspDocumentInsight(
                languageId = highlighted.languageId,
                highlights = highlighted.highlights,
                message = highlighted.message,
            )
        return try {
            session.inspect(file, content).copy(highlights = highlighted.highlights).also { insight ->
                updateServerState(
                    spec,
                    phase = LspConnectionPhase.CONNECTED,
                    serverName = insight.serverName ?: highlighted.serverName,
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.debug(error) { "${spec.displayName} code intelligence inspection failed" }
            LspDocumentInsight(
                languageId = highlighted.languageId,
                serverName = highlighted.serverName,
                highlights = highlighted.highlights,
                message = error.message,
            )
        }
    }

    private fun unavailableResult(spec: LspServerSpec, failures: List<String>) = LspHighlightResult(
        languageId = spec.languageId,
        message = "${spec.displayName} 语义高亮不可用（${failures.joinToString("；")}），已使用本地语法高亮",
    )

    suspend fun restart(serverId: String) {
        val spec = specs.firstOrNull { it.id == serverId } ?: return
        val active = sessionMutex.withLock { sessions[serverId] }
        discardSession(serverId, active)?.let { throw it }
        updateServerState(spec, phase = LspConnectionPhase.IDLE)
    }

    private fun updateServerState(
        spec: LspServerSpec,
        phase: LspConnectionPhase,
        command: List<String> = emptyList(),
        serverName: String? = null,
        message: String? = null,
    ) {
        _serverStates.update { current ->
            val previous = current[spec.id] ?: LspServerConnectionState(spec.id, spec.displayName)
            current + (spec.id to previous.copy(
                phase = phase,
                command = command.ifEmpty { previous.command.takeIf { phase == LspConnectionPhase.CONNECTED }.orEmpty() },
                serverName = serverName,
                message = message,
            ))
        }
    }

    private suspend fun discardSession(id: String, expected: LspSession?): Throwable? {
        if (expected == null) return null
        return withContext(NonCancellable) {
            sessionLifecycleLocks.computeIfAbsent(id) { Mutex() }.withLock {
                val current = sessionMutex.withLock { sessions[id] }
                if (current !== expected) return@withLock null
                try {
                    expected.close()
                } catch (error: Throwable) {
                    return@withLock error
                }
                sessionMutex.withLock {
                    if (sessions[id] === expected) sessions.remove(id)
                }
                null
            }
        }
    }

    override suspend fun close() {
        withContext(NonCancellable) {
            val active = sessionMutex.withLock {
                closed.set(true)
                sessions.entries.map { it.key to it.value }
            }
            var firstFailure: Throwable? = null
            active.forEach { (id, session) ->
                discardSession(id, session)?.let { error ->
                    if (firstFailure == null) {
                        firstFailure = error
                    } else {
                        firstFailure.addSuppressed(error)
                    }
                }
            }
            _serverStates.value = _serverStates.value.mapValues { (_, state) ->
                state.copy(phase = LspConnectionPhase.IDLE, serverName = null, message = null)
            }
            firstFailure?.let { throw it }
        }
    }
}

data class LspServerSpec(
    val id: String,
    val displayName: String,
    val languageId: String,
    val extensions: Set<String>,
    val commandCandidates: List<List<String>>,
    val initializationOptions: JsonObject? = null,
    val hasExplicitCommandOverride: Boolean = false,
) {
    init {
        require(commandCandidates.isNotEmpty() && commandCandidates.all(List<String>::isNotEmpty)) {
            "LSP command candidates must not be empty"
        }
    }

    val command: List<String>
        get() = commandCandidates.first()
}

interface LspSession {
    suspend fun highlight(file: File, content: String): LspHighlightResult

    suspend fun inspect(file: File, content: String): LspDocumentInsight {
        val highlighted = highlight(file, content)
        return LspDocumentInsight(
            languageId = highlighted.languageId,
            serverName = highlighted.serverName,
            highlights = highlighted.highlights,
            message = highlighted.message,
        )
    }

    suspend fun close()
}

internal fun defaultLspServerSpecs(): List<LspServerSpec> = listOf(
    lspSpec(
        "kotlin",
        "Kotlin Language Server",
        "kotlin",
        setOf("kt", "kts"),
        listOf(listOf("kotlin-lsp"), listOf("kotlin-language-server")),
    ),
    lspSpec(
        "typescript",
        "TypeScript Language Server",
        "typescript",
        setOf("ts", "tsx", "js", "jsx"),
        listOf(listOf("typescript-language-server", "--stdio")),
    ),
    lspSpec(
        "python",
        "Pyright",
        "python",
        setOf("py"),
        listOf(listOf("pyright-langserver", "--stdio")),
    ),
    lspSpec("rust", "rust-analyzer", "rust", setOf("rs"), listOf(listOf("rust-analyzer"))),
    lspSpec(
        "go",
        "gopls",
        "go",
        setOf("go"),
        listOf(listOf("gopls")),
        initializationOptions = buildJsonObject { put("semanticTokens", true) },
    ),
    lspSpec(
        "clangd",
        "clangd",
        "cpp",
        setOf("c", "h", "cc", "cpp", "cxx", "hpp"),
        listOf(listOf("clangd")),
    ),
    lspSpec(
        "java",
        "Eclipse JDT Language Server",
        "java",
        setOf("java"),
        listOf(listOf("jdtls")),
    ),
    lspSpec(
        "csharp",
        "C# Language Server",
        "csharp",
        setOf("cs"),
        listOf(listOf("csharp-ls")),
    ),
    lspSpec(
        "dart",
        "Dart Language Server",
        "dart",
        setOf("dart"),
        listOf(listOf("dart", "language-server", "--protocol=lsp")),
    ),
    lspSpec(
        "php",
        "Intelephense",
        "php",
        setOf("php", "phtml"),
        listOf(listOf("intelephense", "--stdio")),
    ),
    lspSpec(
        "ruby",
        "Ruby LSP",
        "ruby",
        setOf("rb", "rake", "gemspec"),
        listOf(listOf("ruby-lsp")),
    ),
    lspSpec(
        "swift",
        "SourceKit-LSP",
        "swift",
        setOf("swift"),
        listOf(listOf("sourcekit-lsp")),
    ),
)

internal fun lspSpec(
    id: String,
    displayName: String,
    languageId: String,
    extensions: Set<String>,
    fallbackCommands: List<List<String>>,
    initializationOptions: JsonObject? = null,
    environment: (String) -> String? = { System.getenv(it) },
    systemProperty: (String) -> String? = { System.getProperty(it) },
): LspServerSpec {
    val override = environment("SWARM_LSP_${id.uppercase()}")
        ?: systemProperty("swarm.lsp.$id")
    val overrideCommand = override?.trim()?.split(Regex("\\s+"))?.filter(String::isNotBlank).orEmpty()
    val commandCandidates = if (overrideCommand.isEmpty()) fallbackCommands else listOf(overrideCommand)
    return LspServerSpec(
        id = id,
        displayName = displayName,
        languageId = languageId,
        extensions = extensions,
        commandCandidates = commandCandidates,
        initializationOptions = initializationOptions,
        hasExplicitCommandOverride = overrideCommand.isNotEmpty(),
    )
}

internal fun resolveLspCommand(
    spec: LspServerSpec,
    available: (String) -> Boolean = ::commandAvailable,
): List<String>? = resolveLspCommands(spec, available).firstOrNull()

internal fun resolveLspCommands(
    spec: LspServerSpec,
    available: (String) -> Boolean = ::commandAvailable,
): List<List<String>> = spec.commandCandidates.filter { available(it.first()) }

private fun commandAvailable(executable: String): Boolean {
    val direct = File(executable)
    if (direct.isAbsolute || File.separatorChar in executable) return direct.canExecute()
    return System.getenv("PATH")
        ?.split(File.pathSeparatorChar)
        ?.asSequence()
        ?.map { directory -> File(directory, executable) }
        ?.any(File::canExecute)
        ?: false
}

private class StdioLspSession(
    private val projectRoot: File,
    private val spec: LspServerSpec,
) : LspSession {
    private val json = Json { ignoreUnknownKeys = true }
    private val process = ProcessBuilder(spec.command).directory(projectRoot).start()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val writerMutex = Mutex()
    private val requestIds = AtomicLong()
    private val documentSynchronizer = LspDocumentSynchronizer(spec.languageId)
    private val documentOperations = ConcurrentHashMap<String, Mutex>()
    private val publishedDiagnostics = ConcurrentHashMap<String, List<SourceDiagnostic>>()
    private val pending = ConcurrentHashMap<Long, CompletableDeferred<JsonObject>>()
    private val terminalError = AtomicReference<Throwable?>()
    @Volatile
    private var initialized = false
    private var serverName = spec.displayName
    private var tokenTypes: List<String> = emptyList()
    private var tokenModifiers: List<String> = emptyList()
    private var supportsPullDiagnostics = false
    private var supportsFoldingRanges = false
    private val initialization = scope.async(start = CoroutineStart.LAZY) { initializeSession() }

    init {
        scope.launch {
            try {
                readMessages(BufferedInputStream(process.inputStream))
                failSession(IllegalStateException("${spec.displayName} closed its protocol stream"))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                failSession(IllegalStateException("${spec.displayName} protocol reader failed", error))
            }
        }
        scope.launch {
            try {
                readTruncatedUtf8Lines(process.errorStream) { line -> log.debug { "lsp[${spec.id}]: $line" } }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (terminalError.get() == null && process.isAlive) {
                    log.debug(error) { "lsp[${spec.id}] stderr reader stopped" }
                }
            }
        }
        scope.launch {
            val exitCode = process.waitFor()
            failSession(IllegalStateException("${spec.displayName} exited with code $exitCode"))
        }
    }

    override suspend fun highlight(file: File, content: String): LspHighlightResult {
        ensureInitialized()
        val uri = file.toURI().toString()
        return documentOperations.computeIfAbsent(uri) { Mutex() }.withLock {
            documentSynchronizer.sync(uri, content, ::notify)
            val response = retryTransientLspRequest {
                request(
                    "textDocument/semanticTokens/full",
                    buildJsonObject { putJsonObject("textDocument") { put("uri", uri) } },
                )
            }
            LspHighlightResult(
                languageId = spec.languageId,
                serverName = serverName,
                highlights = decodeSemanticTokens(semanticTokenData(response), tokenTypes, tokenModifiers),
            )
        }
    }

    override suspend fun inspect(file: File, content: String): LspDocumentInsight {
        ensureInitialized()
        val uri = file.toURI().toString()
        return documentOperations.computeIfAbsent(uri) { Mutex() }.withLock {
            documentSynchronizer.sync(uri, content, ::notify)
            val symbols = optionalRequest(
                method = "textDocument/documentSymbol",
                params = buildJsonObject { putJsonObject("textDocument") { put("uri", uri) } },
                retryTransient = true,
            )?.let(::decodeDocumentSymbols).orEmpty()
            val pullDiagnostics = if (supportsPullDiagnostics) {
                optionalRequest(
                    method = "textDocument/diagnostic",
                    params = buildJsonObject { putJsonObject("textDocument") { put("uri", uri) } },
                    timeoutMillis = 1_500,
                )?.let(::decodeDocumentDiagnostics).orEmpty()
            } else {
                emptyList()
            }
            val foldingRanges = if (supportsFoldingRanges) {
                optionalRequest(
                    method = "textDocument/foldingRange",
                    params = buildJsonObject { putJsonObject("textDocument") { put("uri", uri) } },
                    retryTransient = true,
                )?.let(::decodeFoldingRanges).orEmpty()
            } else {
                emptyList()
            }
            LspDocumentInsight(
                languageId = spec.languageId,
                serverName = serverName,
                symbols = symbols,
                diagnostics = pullDiagnostics.ifEmpty { publishedDiagnostics[uri].orEmpty() },
                foldingRanges = foldingRanges,
            )
        }
    }

    override suspend fun close() {
        withContext(NonCancellable + Dispatchers.IO) {
            val gracefulClose = scope.launch {
                runCatching {
                    if (process.isAlive && initialized) {
                        request("shutdown", JsonObject(emptyMap()), timeoutMillis = 1_500)
                    }
                    if (process.isAlive) notify("exit", JsonObject(emptyMap()))
                }
            }
            try {
                withTimeoutOrNull(LSP_CLOSE_GRACE_MILLIS) { gracefulClose.join() }
                failSession(IllegalStateException("${spec.displayName} session closed"))
                if (process.isAlive) {
                    process.destroy()
                    if (!process.waitFor(
                            LSP_PROCESS_TERMINATION_TIMEOUT_SECONDS,
                            java.util.concurrent.TimeUnit.SECONDS,
                        )
                    ) {
                        process.destroyForcibly()
                        check(
                            process.waitFor(
                                LSP_PROCESS_TERMINATION_TIMEOUT_SECONDS,
                                java.util.concurrent.TimeUnit.SECONDS,
                            ),
                        ) { "${spec.displayName} process ${process.pid()} did not terminate" }
                    }
                }
            } finally {
                gracefulClose.cancelAndJoin()
                writerMutex.withLock { runCatching { process.outputStream.close() } }
                documentOperations.clear()
                scope.cancel()
            }
        }
    }

    private suspend fun ensureInitialized() {
        initialization.await()
    }

    private suspend fun initializeSession() {
        val response = retryTransientLspRequest {
            request(
                "initialize",
                lspInitializeParams(projectRoot, spec),
                timeoutMillis = 10_000,
            )
        }
        val result = response["result"]?.jsonObject ?: error("${spec.displayName} did not return initialize result")
        serverName = result["serverInfo"]?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull ?: spec.displayName
        val capabilities = result["capabilities"]?.jsonObject
        val provider = capabilities?.get("semanticTokensProvider")?.jsonObject
        val legend = provider?.get("legend")?.jsonObject
        tokenTypes = legend?.get("tokenTypes")?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
        tokenModifiers = legend?.get("tokenModifiers")?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
        supportsPullDiagnostics = supportsPullDiagnostics(serverName, capabilities)
        supportsFoldingRanges = when (val provider = capabilities?.get("foldingRangeProvider")) {
            is JsonObject -> true
            is JsonPrimitive -> provider.booleanOrNull == true
            else -> false
        }
        check(provider != null && tokenTypes.isNotEmpty()) { "$serverName does not support semantic tokens" }
        notify("initialized", JsonObject(emptyMap()))
        initialized = true
    }

    private suspend fun request(
        method: String,
        params: JsonObject,
        timeoutMillis: Long = 6_000,
    ): JsonObject {
        terminalError.get()?.let { throw it }
        val id = requestIds.incrementAndGet()
        val response = CompletableDeferred<JsonObject>()
        pending[id] = response
        terminalError.get()?.let(response::completeExceptionally)
        try {
            write(
                buildJsonObject {
                    put("jsonrpc", "2.0")
                    put("id", id)
                    put("method", method)
                    put("params", params)
                },
            )
            val payload = try {
                withTimeout(timeoutMillis) { response.await() }
            } catch (error: TimeoutCancellationException) {
                throw LspResponseException(null, "$method timed out after ${timeoutMillis}ms")
            }
            payload["error"]?.jsonObject?.let { error ->
                throw LspResponseException(
                    code = error["code"]?.jsonPrimitive?.intOrNull,
                    message = error["message"]?.jsonPrimitive?.contentOrNull ?: "$method failed",
                )
            }
            return payload
        } finally {
            pending.remove(id)
        }
    }

    private suspend fun optionalRequest(
        method: String,
        params: JsonObject,
        timeoutMillis: Long = 3_000,
        retryTransient: Boolean = false,
    ): JsonObject? {
        return try {
            if (retryTransient) {
                retryTransientLspRequest { request(method, params, timeoutMillis) }
            } else {
                request(method, params, timeoutMillis)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.debug(error) { "$serverName does not provide $method" }
            null
        }
    }

    private suspend fun notify(method: String, params: JsonObject) {
        write(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("method", method)
                put("params", params)
            },
        )
    }

    private suspend fun write(message: JsonObject) = writerMutex.withLock {
        terminalError.get()?.let { throw it }
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(message).toByteArray(Charsets.UTF_8)
            process.outputStream.write("Content-Length: ${body.size}\r\n\r\n".toByteArray(Charsets.US_ASCII))
            process.outputStream.write(body)
            process.outputStream.flush()
        }
    }

    private suspend fun readMessages(input: InputStream) {
        while (true) {
            val message = readLspMessage(input, json) ?: return
            decodePublishedDiagnostics(message)?.let { (uri, diagnostics) ->
                publishedDiagnostics[uri] = diagnostics
                continue
            }
            serverRequestResponse(message, projectRoot)?.let { response ->
                write(response)
                continue
            }
            val id = message["id"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: continue
            pending[id]?.complete(message)
        }
    }

    private fun failSession(error: Throwable) {
        if (!terminalError.compareAndSet(null, error)) return
        pending.values.forEach { response -> response.completeExceptionally(error) }
        pending.clear()
    }
}

internal fun supportsPullDiagnostics(serverName: String, capabilities: JsonObject?): Boolean =
    capabilities?.get("diagnosticProvider") is JsonObject &&
        !serverName.contains("IntelliJ Language Server", ignoreCase = true)

internal fun lspInitializeParams(projectRoot: File, spec: LspServerSpec): JsonObject = buildJsonObject {
    val rootUri = projectRoot.toURI().toString()
    put("processId", ProcessHandle.current().pid())
    put("rootUri", rootUri)
    putJsonArray("workspaceFolders") {
        add(
            buildJsonObject {
                put("uri", rootUri)
                put("name", projectRoot.name.ifEmpty { projectRoot.absoluteFile.name })
            },
        )
    }
    putJsonObject("clientInfo") {
        put("name", "swarm-editor")
        put("version", "1.0.0")
    }
    spec.initializationOptions?.let { put("initializationOptions", it) }
    putJsonObject("capabilities") {
        putJsonObject("textDocument") {
            put("semanticTokens", semanticTokensClientCapabilities())
            putJsonObject("documentSymbol") { put("hierarchicalDocumentSymbolSupport", true) }
            putJsonObject("diagnostic") { put("dynamicRegistration", false) }
            putJsonObject("foldingRange") {
                put("dynamicRegistration", false)
                put("lineFoldingOnly", true)
            }
        }
    }
}

internal class LspDocumentSynchronizer(
    private val languageId: String,
) {
    private val mutex = Mutex()
    private val versions = mutableMapOf<String, Int>()
    private val opened = mutableSetOf<String>()

    suspend fun sync(
        uri: String,
        content: String,
        notify: suspend (method: String, params: JsonObject) -> Unit,
    ) = withContext(NonCancellable) {
        mutex.withLock {
            val version = versions.getOrDefault(uri, 0) + 1
            val method: String
            val params: JsonObject
            if (uri !in opened) {
                method = "textDocument/didOpen"
                params = buildJsonObject {
                    putJsonObject("textDocument") {
                        put("uri", uri)
                        put("languageId", languageId)
                        put("version", version)
                        put("text", content)
                    }
                }
            } else {
                method = "textDocument/didChange"
                params = buildJsonObject {
                    putJsonObject("textDocument") {
                        put("uri", uri)
                        put("version", version)
                    }
                    putJsonArray("contentChanges") {
                        add(buildJsonObject { put("text", content) })
                    }
                }
            }
            notify(method, params)
            versions[uri] = version
            opened += uri
        }
    }
}

internal fun serverRequestResponse(request: JsonObject, projectRoot: File): JsonObject? {
    val id = request["id"] ?: return null
    val method = request["method"]?.jsonPrimitive?.contentOrNull ?: return null
    val result = when (method) {
        "workspace/configuration" -> {
            val itemCount = request["params"]
                ?.jsonObject
                ?.get("items")
                ?.jsonArray
                ?.size
                ?: 0
            buildJsonArray { repeat(itemCount) { add(JsonNull) } }
        }

        "workspace/workspaceFolders" -> buildJsonArray {
            add(
                buildJsonObject {
                    put("uri", projectRoot.toURI().toString())
                    put("name", projectRoot.name.ifEmpty { projectRoot.absoluteFile.name })
                },
            )
        }

        "workspace/applyEdit" -> buildJsonObject {
            put("applied", false)
            put("failureReason", "Swarm Editor source preview is read-only")
        }

        "window/showDocument" -> buildJsonObject { put("success", false) }
        "window/showMessageRequest" -> JsonNull
        "window/workDoneProgress/create",
        "client/registerCapability",
        "client/unregisterCapability",
        "workspace/semanticTokens/refresh",
        "workspace/codeLens/refresh",
        "workspace/inlayHint/refresh",
        "workspace/inlineValue/refresh",
        "workspace/diagnostic/refresh",
        -> JsonNull

        else -> return jsonRpcMethodNotFound(id, method)
    }
    return jsonRpcResult(id, result)
}

private fun jsonRpcResult(id: JsonElement, result: JsonElement): JsonObject = buildJsonObject {
    put("jsonrpc", "2.0")
    put("id", id)
    put("result", result)
}

private fun jsonRpcMethodNotFound(id: JsonElement, method: String): JsonObject = buildJsonObject {
    put("jsonrpc", "2.0")
    put("id", id)
    putJsonObject("error") {
        put("code", -32601)
        put("message", "Method not found: $method")
    }
}

internal fun semanticTokensClientCapabilities(): JsonObject = buildJsonObject {
    putJsonObject("requests") { put("full", true) }
    putJsonArray("tokenTypes") {
        standardSemanticTokenTypes.forEach { add(JsonPrimitive(it)) }
    }
    putJsonArray("tokenModifiers") {
        standardSemanticTokenModifiers.forEach { add(JsonPrimitive(it)) }
    }
    put("formats", buildJsonArray { add(JsonPrimitive("relative")) })
}

internal fun semanticTokenData(response: JsonObject): List<Int> {
    val result = response["result"] as? JsonObject ?: return emptyList()
    val elements = result["data"] as? JsonArray ?: return emptyList()
    val data = ArrayList<Int>(elements.size)
    elements.forEach { element ->
        val value = (element as? JsonPrimitive)?.intOrNull ?: return emptyList()
        data += value
    }
    return if (data.size % 5 == 0) data else emptyList()
}

internal fun decodeDocumentSymbols(response: JsonObject): List<SourceSymbol> {
    val result = response["result"] as? JsonArray ?: return emptyList()
    val symbols = mutableListOf<SourceSymbol>()

    fun collect(element: JsonElement, inheritedContainer: String?) {
        val symbol = element as? JsonObject ?: return
        val name = (symbol["name"] as? JsonPrimitive)?.contentOrNull ?: return
        val kind = (symbol["kind"] as? JsonPrimitive)?.intOrNull?.let(::symbolKindName) ?: "symbol"
        val explicitContainer = (symbol["containerName"] as? JsonPrimitive)?.contentOrNull
        val range = symbol["selectionRange"] as? JsonObject
            ?: symbol["range"] as? JsonObject
            ?: ((symbol["location"] as? JsonObject)?.get("range") as? JsonObject)
        val start = range?.get("start") as? JsonObject
        val line = (start?.get("line") as? JsonPrimitive)?.intOrNull ?: 0
        symbols += SourceSymbol(
            name = name,
            kind = kind,
            line = line,
            containerName = explicitContainer ?: inheritedContainer,
        )
        (symbol["children"] as? JsonArray)?.forEach { child -> collect(child, name) }
    }

    result.forEach { collect(it, null) }
    return symbols
}

internal fun decodeFoldingRanges(response: JsonObject): List<SourceFoldingRange> =
    (response["result"] as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            val range = element as? JsonObject ?: return@mapNotNull null
            val startLine = (range["startLine"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val endLine = (range["endLine"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            if (startLine < 0 || endLine <= startLine) return@mapNotNull null
            SourceFoldingRange(
                startLine = startLine,
                endLine = endLine,
                kind = (range["kind"] as? JsonPrimitive)?.contentOrNull,
            )
        }
        .distinctBy { range -> Triple(range.startLine, range.endLine, range.kind) }
        .sortedWith(compareBy(SourceFoldingRange::startLine, SourceFoldingRange::endLine))

internal fun decodeDocumentDiagnostics(response: JsonObject): List<SourceDiagnostic> {
    val result = response["result"] as? JsonObject ?: return emptyList()
    val items = result["items"] as? JsonArray ?: return emptyList()
    return decodeDiagnostics(items)
}

internal fun decodePublishedDiagnostics(message: JsonObject): Pair<String, List<SourceDiagnostic>>? {
    if ((message["method"] as? JsonPrimitive)?.contentOrNull != "textDocument/publishDiagnostics") return null
    val params = message["params"] as? JsonObject ?: return null
    val uri = (params["uri"] as? JsonPrimitive)?.contentOrNull ?: return null
    val diagnostics = params["diagnostics"] as? JsonArray ?: return uri to emptyList()
    return uri to decodeDiagnostics(diagnostics)
}

private fun decodeDiagnostics(items: JsonArray): List<SourceDiagnostic> = items.mapNotNull { element ->
        val diagnostic = element as? JsonObject ?: return@mapNotNull null
        val message = (diagnostic["message"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
        val range = diagnostic["range"] as? JsonObject
        val start = range?.get("start") as? JsonObject
        val line = (start?.get("line") as? JsonPrimitive)?.intOrNull ?: 0
        val severity = (diagnostic["severity"] as? JsonPrimitive)?.intOrNull?.let(::diagnosticSeverityName)
            ?: "unknown"
        SourceDiagnostic(line = line, severity = severity, message = message)
    }

private fun symbolKindName(kind: Int): String = when (kind) {
    1 -> "file"
    2 -> "module"
    3 -> "namespace"
    4 -> "package"
    5 -> "class"
    6 -> "method"
    7 -> "property"
    8 -> "field"
    9 -> "constructor"
    10 -> "enum"
    11 -> "interface"
    12 -> "function"
    13 -> "variable"
    14 -> "constant"
    22 -> "enum-member"
    23 -> "struct"
    else -> "symbol"
}

private fun diagnosticSeverityName(severity: Int): String = when (severity) {
    1 -> "error"
    2 -> "warning"
    3 -> "information"
    4 -> "hint"
    else -> "unknown"
}

private val standardSemanticTokenTypes = listOf(
    "namespace",
    "type",
    "class",
    "enum",
    "interface",
    "struct",
    "typeParameter",
    "parameter",
    "variable",
    "property",
    "enumMember",
    "event",
    "function",
    "method",
    "macro",
    "label",
    "comment",
    "string",
    "keyword",
    "number",
    "regexp",
    "operator",
    "decorator",
)

private val standardSemanticTokenModifiers = listOf(
    "declaration",
    "definition",
    "readonly",
    "static",
    "deprecated",
    "abstract",
    "async",
    "modification",
    "documentation",
    "defaultLibrary",
)

internal fun decodeSemanticTokens(
    data: List<Int>,
    tokenTypes: List<String>,
    tokenModifiers: List<String>,
): List<SemanticHighlight> {
    if (data.size % 5 != 0) return emptyList()
    val highlights = ArrayList<SemanticHighlight>(data.size / 5)
    var line = 0
    var character = 0
    data.chunked(5).forEach { token ->
        line += token[0]
        character = if (token[0] == 0) character + token[1] else token[1]
        val type = tokenTypes.getOrNull(token[3]) ?: "unknown"
        val bits = token[4]
        val modifiers = tokenModifiers.mapIndexedNotNull { index, modifier ->
            modifier.takeIf { bits and (1 shl index) != 0 }
        }.toSet()
        highlights += SemanticHighlight(line, character, token[2], type, modifiers)
    }
    return highlights
}

internal fun readLspMessage(input: InputStream, json: Json): JsonObject? {
    val headers = readHeaders(input) ?: return null
    val rawLength = headers["content-length"] ?: error("LSP message is missing Content-Length")
    val length = rawLength.toIntOrNull()?.takeIf { it in 1..MAX_LSP_MESSAGE_BYTES }
        ?: error("Invalid LSP Content-Length: $rawLength")
    val body = input.readNBytes(length)
    check(body.size == length) { "LSP protocol stream ended within message body" }
    return json.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
}

private fun readHeaders(input: InputStream): Map<String, String>? {
    val headers = linkedMapOf<String, String>()
    while (true) {
        val line = readAsciiLine(input) ?: return null
        if (line.isEmpty()) return headers
        val separator = line.indexOf(':')
        if (separator > 0) headers[line.substring(0, separator).trim().lowercase()] = line.substring(separator + 1).trim()
    }
}

private fun readAsciiLine(input: InputStream): String? {
    val bytes = ByteArrayOutputStream()
    while (true) {
        val value = input.read()
        if (value == -1) {
            if (bytes.size() == 0) return null
            error("LSP protocol stream ended within a header")
        }
        if (value == '\n'.code) {
            val line = bytes.toByteArray()
            val length = if (line.lastOrNull() == '\r'.code.toByte()) line.size - 1 else line.size
            return String(line, 0, length, Charsets.US_ASCII)
        }
        check(bytes.size() < MAX_LSP_HEADER_LINE_BYTES) { "LSP header line is too large" }
        bytes.write(value)
    }
}
