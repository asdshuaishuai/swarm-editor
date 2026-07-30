package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.pi.PiRuntimeManager
import com.swarmeditor.backend.pi.PiRuntimeInfo
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmTask
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference

class AgentService(
    private val registry: AgentRegistry,
    private val runtimeManager: PiRuntimeManager,
    private val inspectRuntime: () -> Result<PiRuntimeInfo> = runtimeManager::inspect,
    private val modelService: ModelService? = null,
) {
    private val _agents = MutableStateFlow<List<AgentRuntimeInfo>>(emptyList())
    val agents: StateFlow<List<AgentRuntimeInfo>> = _agents.asStateFlow()
    private val runtimeAvailability = MutableStateFlow(RuntimeAvailability())
    private val lifecycleMutex = Mutex()
    private val explicitConnections = mutableSetOf<String>()
    private val suppressedAutoStarts = mutableSetOf<String>()
    private val launchableConfigs = AtomicReference<Map<String, AgentConfig>>(emptyMap())

    suspend fun init() {
        registry.load()
        lifecycleMutex.withLock {
            explicitConnections.clear()
            suppressedAutoStarts.clear()
            launchableConfigs.set(emptyMap())
        }
        scan()
    }

    suspend fun scan(): Result<Unit> = resultOf {
        lifecycleMutex.withLock {
            inspectAndPublishLocked()
        }
    }

    suspend fun connect(agentId: String): Result<Unit> = resultOf {
        lifecycleMutex.withLock {
            val config = registry.getConfig(agentId) ?: error("Agent profile not found")
            check(config.enabled) { "Agent profile is disabled" }
            val wasExplicitlyConnected = agentId in explicitConnections
            val wasAutoStartSuppressed = agentId in suppressedAutoStarts
            explicitConnections += agentId
            suppressedAutoStarts -= agentId
            try {
                inspectAndPublishLocked()
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    if (!wasExplicitlyConnected) explicitConnections -= agentId
                    if (wasAutoStartSuppressed) suppressedAutoStarts += agentId
                    try {
                        publishAvailabilityLocked()
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
        }
    }

    suspend fun disconnect(agentId: String): Result<Unit> = resultOf {
        lifecycleMutex.withLock {
            val wasExplicitlyConnected = agentId in explicitConnections
            val wasAutoStartSuppressed = agentId in suppressedAutoStarts
            explicitConnections -= agentId
            suppressedAutoStarts += agentId
            updateLaunchableSnapshotLocked()
            try {
                runtimeManager.closeAgent(agentId)
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    if (wasExplicitlyConnected) explicitConnections += agentId
                    if (!wasAutoStartSuppressed) suppressedAutoStarts -= agentId
                    try {
                        publishAvailabilityLocked()
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
            publishAvailabilityLocked()
        }
    }

    suspend fun upsert(config: AgentConfig): Result<Unit> = resultOf {
        lifecycleMutex.withLock {
            val previous = registry.getConfig(config.id)
            registry.upsert(config)
            updateLaunchableSnapshotLocked()
            try {
                runtimeManager.closeAgent(config.id)
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        if (previous == null) registry.delete(config.id) else registry.upsert(previous)
                        updateLaunchableSnapshotLocked()
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
            if (!config.enabled) {
                explicitConnections -= config.id
                suppressedAutoStarts -= config.id
            } else if (!config.autoStart) {
                suppressedAutoStarts -= config.id
            }
            publishAvailabilityLocked()
        }
    }

    suspend fun getConfig(agentId: String): AgentConfig? = registry.getConfig(agentId)

    suspend fun delete(agentId: String): Result<Unit> = resultOf {
        require(agentId != AgentRegistry.DEFAULT_AGENT_ID) { "主智能体不能删除" }
        error("静态子智能体 Profile 已停用；子智能体由主智能体按需创建")
    }

    suspend fun getAllConfigs(): List<AgentConfig> = registry.getAllConfigs()

    suspend fun requireLaunchConfig(agentId: String): AgentConfig = lifecycleMutex.withLock {
        val config = requireBaseLaunchConfigLocked(agentId)
        resolveModel(config, SwarmAgentRole.GENERAL, "session:$agentId")
    }

    suspend fun createDynamicAgent(task: SwarmTask): AgentConfig = lifecycleMutex.withLock {
        val base = requireBaseLaunchConfigLocked(task.agentId ?: AgentRegistry.DEFAULT_AGENT_ID)
        resolveModel(base, task.role, "${task.id}:${task.title}:${task.prompt}")
    }

    private suspend fun requireBaseLaunchConfigLocked(agentId: String): AgentConfig {
        val config = registry.getConfig(agentId) ?: error("Agent profile not found: $agentId")
        check(config.enabled) { "Agent profile is disabled: $agentId" }
        check(isLaunchRequestedLocked(config)) { "Agent profile is disconnected: $agentId" }
        val availability = runtimeAvailability.value
        check(availability.status == AgentStatus.CONNECTED) {
            availability.errorMessage ?: "Pi runtime is unavailable"
        }
        return config
    }

    suspend fun isLaunchConfigCurrent(config: AgentConfig): Boolean {
        val current = launchableConfigs.get()[config.id] ?: return false
        if (config.agentRevision.isNotBlank() && config.agentRevision != current.revision()) return false
        return config.modelConfigId.isBlank() ||
            modelService?.isCurrent(config.modelConfigId, config.modelRevision) != false
    }

    suspend fun getLaunchableConfigs(): List<AgentConfig> = launchableConfigs.get().values.map { config ->
        resolveModel(config, SwarmAgentRole.GENERAL, "available:${config.id}")
    }

    private suspend fun resolveModel(
        config: AgentConfig,
        role: SwarmAgentRole,
        affinityKey: String,
    ): AgentConfig {
        val agentRevision = config.revision()
        val model = modelService?.select(role, config.modelSelectionStrategy, affinityKey)
            ?: return config.copy(agentRevision = agentRevision)
        return config.copy(
            provider = model.provider,
            model = model.model,
            thinkingLevel = model.thinkingLevel,
            env = model.env,
            modelConfigId = model.id,
            agentRevision = agentRevision,
            modelRevision = model.revision(),
        )
    }

    private suspend fun refresh() {
        _agents.value = registry.runtimeInfos()
    }

    private suspend fun inspectAndPublishLocked() {
        val inspection = inspectRuntime()
        runtimeAvailability.value = inspection.fold(
            onSuccess = { info -> RuntimeAvailability(AgentStatus.CONNECTED, info.version) },
            onFailure = { error -> RuntimeAvailability(AgentStatus.ERROR, errorMessage = error.message) },
        )
        publishAvailabilityLocked()
        inspection.getOrThrow()
    }

    private suspend fun publishAvailabilityLocked() {
        val availability = runtimeAvailability.value
        updateLaunchableSnapshotLocked()
        registry.getAllConfigs().forEach { config ->
            val requested = isLaunchRequestedLocked(config)
            val status = when {
                !requested -> AgentStatus.DISCONNECTED
                availability.status == AgentStatus.CONNECTED -> AgentStatus.CONNECTED
                else -> AgentStatus.ERROR
            }
            registry.updateStatus(
                agentId = config.id,
                status = status,
                version = availability.version,
                errorMessage = availability.errorMessage.takeIf { status == AgentStatus.ERROR },
            )
        }
        refresh()
    }

    private suspend fun updateLaunchableSnapshotLocked() {
        val configs = if (runtimeAvailability.value.status == AgentStatus.CONNECTED) {
            registry.getAllConfigs()
                .filter(::isLaunchRequestedLocked)
                .associateBy(AgentConfig::id)
        } else {
            emptyMap()
        }
        launchableConfigs.set(configs)
    }

    private fun isLaunchRequestedLocked(config: AgentConfig): Boolean =
        config.enabled &&
            config.id !in suppressedAutoStarts &&
            (config.autoStart || config.id in explicitConnections)
}

private fun AgentConfig.revision(): String = listOf(
    id,
    name,
    description,
    enabled.toString(),
    systemPrompt,
    workingDirectory,
    tags.joinToString(","),
    timeoutSeconds.toString(),
    autoStart.toString(),
    maxDynamicSubagents.toString(),
    modelSelectionStrategy.name,
).joinToString("\u0000")

private data class RuntimeAvailability(
    val status: AgentStatus = AgentStatus.DISCONNECTED,
    val version: String = "",
    val errorMessage: String? = null
)

private suspend fun resultOf(action: suspend () -> Unit): Result<Unit> {
    return try {
        action()
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}

private suspend fun <T> resultOfValue(action: suspend () -> T): Result<T> {
    return try {
        Result.success(action())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}
