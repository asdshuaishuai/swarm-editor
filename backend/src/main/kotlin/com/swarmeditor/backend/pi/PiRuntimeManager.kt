package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class PiRuntimeManager(
    private val distribution: PiRuntimeDistribution,
    private val defaultWorkingDirectory: File,
    private val prepareAgent: suspend (AgentConfig) -> Unit = {},
    private val toolBrokerFactory: PiToolBrokerFactory = PiToolBrokerFactory { _, _ -> null },
    private val factory: PiSessionFactory = PiSessionFactory { config, workingDirectory, remoteSessionId ->
        val session = PiRpcSession(
            distribution = distribution,
            config = config,
            workingDirectory = workingDirectory,
            remoteSessionId = remoteSessionId,
            toolBroker = toolBrokerFactory.create(config, workingDirectory),
        )
        try {
            session.validate(config.timeoutSeconds)
            session.refreshStats()
            session
        } catch (error: Throwable) {
            withContext(NonCancellable) { session.close() }
            throw error
        }
    }
) : PiSessionProvider {
    private val sessions = ConcurrentHashMap<String, PiSession>()
    private val owners = ConcurrentHashMap<String, String>()
    private val sessionConfigs = ConcurrentHashMap<String, AgentConfig>()
    private val runtimeStates = ConcurrentHashMap<String, MutableStateFlow<PiSessionState?>>()
    private val runtimeStats = ConcurrentHashMap<String, MutableStateFlow<PiSessionStats?>>()
    private val stateJobs = ConcurrentHashMap<String, Job>()
    private val statsJobs = ConcurrentHashMap<String, Job>()
    private val sessionLocks = ConcurrentHashMap<String, Mutex>()
    private val pendingCreations = ConcurrentHashMap<Any, PendingCreation>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lifecycleMutex = Mutex()
    private val shutdown = AtomicBoolean()

    fun inspect(): Result<PiRuntimeInfo> = distribution.inspect()

    override suspend fun getOrCreate(
        sessionId: String,
        config: AgentConfig,
        remoteSessionId: String?
    ): PiSession = getOrCreateValidated(sessionId, config, remoteSessionId) { true }

    override suspend fun getOrCreateValidated(
        sessionId: String,
        config: AgentConfig,
        remoteSessionId: String?,
        isConfigCurrent: suspend () -> Boolean,
    ): PiSession {
        val pendingToken = Any()
        lifecycleMutex.withLock {
            check(!shutdown.get()) { "pi runtime manager is shut down" }
            pendingCreations[pendingToken] = PendingCreation(sessionId, config.id)
        }
        return try {
            sessionLock(sessionId).withLock {
                check(isConfigCurrent()) { "Agent profile changed or was disabled: ${config.id}" }
                val current = sessions[sessionId]
                val reusable = current != null &&
                    current.state.value?.isAlive != false &&
                    owners[sessionId] == config.id &&
                    sessionConfigs[sessionId] == config &&
                    (remoteSessionId.isNullOrBlank() || current.remoteSessionId == remoteSessionId)
                if (reusable) return@withLock current

                if (current != null) closeSessionLocked(sessionId)
                prepareAgent(config)
                val created = factory.create(config, resolveWorkingDirectory(config), remoteSessionId)
                try {
                    check(isConfigCurrent()) { "Agent profile changed or was disabled while Pi was starting: ${config.id}" }
                } catch (error: Throwable) {
                    withContext(NonCancellable) {
                        try {
                            created.close()
                        } catch (closeError: Throwable) {
                            error.addSuppressed(closeError)
                        }
                    }
                    throw error
                }
                installSessionLocked(sessionId, config, created)
                created
            }
        } finally {
            pendingCreations.remove(pendingToken)
        }
    }

    override fun state(sessionId: String): StateFlow<PiSessionState?> =
        runtimeStates.computeIfAbsent(sessionId) { MutableStateFlow(null) }

    override fun stats(sessionId: String): StateFlow<PiSessionStats?> =
        runtimeStats.computeIfAbsent(sessionId) { MutableStateFlow(null) }

    override suspend fun refreshStats(sessionId: String): PiSessionStats =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.refreshStats()

    override suspend fun compact(sessionId: String, customInstructions: String?): PiCompactionResult =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.compact(customInstructions)

    override suspend fun sendQueuedMessage(
        sessionId: String,
        message: String,
        images: List<ImageData>,
        mode: PiQueuedMessageMode,
    ) {
        checkNotNull(sessions[sessionId]) { "pi session is not running" }
            .sendQueuedMessage(message, images, mode)
    }

    override suspend fun respondToExtensionUi(
        sessionId: String,
        requestId: String,
        response: PiExtensionUiResponse,
    ) {
        checkNotNull(sessions[sessionId]) { "pi session is not running" }
            .respondToExtensionUi(requestId, response)
    }

    override suspend fun getCommands(sessionId: String): List<PiCommandInfo> =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.getCommands()

    override suspend fun getAvailableModels(sessionId: String): List<PiModelInfo> =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.getAvailableModels()

    override suspend fun getAvailableThinkingLevels(sessionId: String): List<String> =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.getAvailableThinkingLevels()

    override suspend fun setModel(sessionId: String, provider: String, modelId: String): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setModel(provider, modelId)

    override suspend fun setThinkingLevel(sessionId: String, level: String): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setThinkingLevel(level)

    override suspend fun setAutoCompaction(sessionId: String, enabled: Boolean): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setAutoCompaction(enabled)

    override suspend fun setAutoRetry(sessionId: String, enabled: Boolean): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setAutoRetry(enabled)

    override suspend fun abortRetry(sessionId: String) {
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.abortRetry()
    }

    override suspend fun setSteeringMode(sessionId: String, mode: String): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setSteeringMode(mode)

    override suspend fun setFollowUpMode(sessionId: String, mode: String): PiSessionState =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.setFollowUpMode(mode)

    override suspend fun getSessionTree(sessionId: String): PiSessionTree =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.getSessionTree()

    override suspend fun fork(sessionId: String, entryId: String): PiSessionMutationResult =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.fork(entryId)

    override suspend fun cloneSession(sessionId: String): PiSessionMutationResult =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.cloneSession()

    override suspend fun snapshot(sessionId: String): PiSessionSnapshot =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.snapshot()

    override suspend fun exportHtml(sessionId: String, outputPath: String?): String =
        checkNotNull(sessions[sessionId]) { "pi session is not running" }.exportHtml(outputPath)

    override suspend fun close(sessionId: String) {
        sessionLock(sessionId).withLock { closeSessionLocked(sessionId) }
    }

    override suspend fun abort(sessionId: String) {
        sessions[sessionId]?.abort()
    }

    suspend fun closeAgent(agentId: String) {
        val sessionIds = lifecycleMutex.withLock {
            buildSet {
                addAll(owners.filterValues { it == agentId }.keys)
                pendingCreations.values.filter { it.agentId == agentId }.forEach { add(it.sessionId) }
            }.toList()
        }
        closeSessions(sessionIds)
    }

    suspend fun closeAll() {
        val sessionIds = lifecycleMutex.withLock {
            (sessions.keys + pendingCreations.values.map(PendingCreation::sessionId)).distinct()
        }
        closeSessions(sessionIds)
    }

    suspend fun shutdown() {
        shutdown.set(true)
        try {
            withContext(NonCancellable) { closeAll() }
        } finally {
            scope.cancel()
        }
    }

    private suspend fun closeSessions(sessionIds: List<String>) {
        var failure: Throwable? = null
        sessionIds.forEach { sessionId ->
            try {
                sessionLock(sessionId).withLock { closeSessionLocked(sessionId) }
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (failure == null) failure = error
            }
        }
        failure?.let { throw it }
    }

    private suspend fun closeSessionLocked(sessionId: String) {
        val session = sessions[sessionId]
        session?.close()
        withContext(NonCancellable) {
            if (session != null) sessions.remove(sessionId, session)
            owners.remove(sessionId)
            sessionConfigs.remove(sessionId)
            stateJobs.remove(sessionId)?.cancelAndJoin()
            statsJobs.remove(sessionId)?.cancelAndJoin()
            runtimeStates[sessionId]?.value = null
            runtimeStats[sessionId]?.value = null
        }
    }

    private fun installSessionLocked(sessionId: String, config: AgentConfig, session: PiSession) {
        sessions[sessionId] = session
        owners[sessionId] = config.id
        sessionConfigs[sessionId] = config
        val state = runtimeStates.computeIfAbsent(sessionId) { MutableStateFlow(null) }
        val stats = runtimeStats.computeIfAbsent(sessionId) { MutableStateFlow(null) }
        state.value = session.state.value
        stats.value = session.stats.value
        stateJobs.remove(sessionId)?.cancel()
        statsJobs.remove(sessionId)?.cancel()
        stateJobs[sessionId] = scope.launch {
            session.state.collect { state.value = it }
        }
        statsJobs[sessionId] = scope.launch {
            session.stats.collect { stats.value = it }
        }
    }

    private fun sessionLock(sessionId: String): Mutex = sessionLocks.computeIfAbsent(sessionId) { Mutex() }

    private fun resolveWorkingDirectory(config: AgentConfig): File {
        val configured = config.workingDirectory.takeIf(String::isNotBlank)?.let(::File)
        return configured?.takeIf(File::isDirectory) ?: defaultWorkingDirectory
    }

    private data class PendingCreation(val sessionId: String, val agentId: String)
}
