package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.pi.PiRuntimeManager
import com.swarmeditor.backend.pi.PiRuntimeInfo
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentModelSelectionStrategy
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmModelDemand
import com.swarmeditor.common.model.SwarmTask
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class DynamicAgentAllocation internal constructor(
    val config: AgentConfig,
    val modelDemand: SwarmModelDemand? = null,
    val modelSelectionReason: String? = null,
    val isCurrent: suspend () -> Boolean,
    private val releaseAllocation: suspend () -> Unit,
) {
    private val released = AtomicBoolean(false)

    suspend fun release() {
        if (released.compareAndSet(false, true)) releaseAllocation()
    }
}

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
    private val allocationMutex = Mutex()
    private val allocationVersion = MutableStateFlow(0L)
    private val activeDynamicAgentCounts = mutableMapOf<String, Int>()
    private val _activeDynamicAgents = MutableStateFlow<Map<String, Int>>(emptyMap())
    val activeDynamicAgents: StateFlow<Map<String, Int>> = _activeDynamicAgents.asStateFlow()
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
        allocationMutex.withLock {
            activeDynamicAgentCounts.clear()
            publishDynamicAgentCountsLocked()
            allocationVersion.update(Long::inc)
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
            val updated = registry.getConfig(config.id) ?: error("Agent profile not found after update: ${config.id}")
            updateLaunchableSnapshotLocked()
            if (updated == previous) {
                publishAvailabilityLocked()
                return@withLock
            }
            try {
                runtimeManager.closeAgent(updated.id)
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
            if (!updated.enabled) {
                explicitConnections -= updated.id
                suppressedAutoStarts -= updated.id
            } else if (!updated.autoStart) {
                suppressedAutoStarts -= updated.id
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
        resolvePrimaryModel(config, "session:$agentId")
    }

    suspend fun createDynamicAgent(task: SwarmTask): AgentConfig = lifecycleMutex.withLock {
        val base = requireBaseLaunchConfigLocked(AgentRegistry.DEFAULT_AGENT_ID)
        resolveModel(base, task.role, "${task.id}:${task.title}:${task.prompt}")
    }

    suspend fun acquireDynamicAgent(
        task: SwarmTask,
        demand: SwarmModelDemand? = null,
    ): DynamicAgentAllocation {
        val primaryAgentId = AgentRegistry.DEFAULT_AGENT_ID
        val base = acquireDynamicAgentSlot(primaryAgentId)
        var modelAllocation: ModelAllocation? = null
        try {
            modelAllocation = modelService?.acquire(
                role = task.role,
                strategy = AgentModelSelectionStrategy.BALANCED,
                affinityKey = "${task.id}:${task.title}:${task.prompt}",
                demand = demand,
            )
            val config = applyResolvedModel(base, modelAllocation?.config)
            return DynamicAgentAllocation(
                config = config,
                modelDemand = modelAllocation?.demand,
                modelSelectionReason = modelAllocation?.selectionReason,
                isCurrent = { isLaunchConfigCurrent(config) },
                releaseAllocation = {
                    withContext(NonCancellable) {
                        var releaseFailure: Throwable? = null
                        try {
                            modelAllocation?.release()
                        } catch (error: Throwable) {
                            releaseFailure = error
                        }
                        try {
                            releaseDynamicAgentSlot(primaryAgentId)
                        } catch (error: Throwable) {
                            releaseFailure?.addSuppressed(error) ?: throw error
                        }
                        releaseFailure?.let { throw it }
                    }
                },
            )
        } catch (error: CancellationException) {
            withContext(NonCancellable) {
                try {
                    modelAllocation?.release()
                } catch (releaseError: Throwable) {
                    error.addSuppressed(releaseError)
                }
                try {
                    releaseDynamicAgentSlot(primaryAgentId)
                } catch (releaseError: Throwable) {
                    error.addSuppressed(releaseError)
                }
            }
            throw error
        } catch (error: Throwable) {
            withContext(NonCancellable) {
                try {
                    modelAllocation?.release()
                } catch (releaseError: Throwable) {
                    error.addSuppressed(releaseError)
                }
                try {
                    releaseDynamicAgentSlot(primaryAgentId)
                } catch (releaseError: Throwable) {
                    error.addSuppressed(releaseError)
                }
            }
            throw error
        }
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
        resolvePrimaryModel(config, "available:${config.id}")
    }

    private suspend fun resolvePrimaryModel(
        config: AgentConfig,
        affinityKey: String,
    ): AgentConfig {
        val service = modelService ?: return applyResolvedModel(config, null)
        val configured = config.modelConfigId
            .takeIf(String::isNotBlank)
            ?.let { service.get(it) }
            ?.takeIf { it.enabled }
        val model = configured ?: service.select(
            role = SwarmAgentRole.GENERAL,
            strategy = AgentModelSelectionStrategy.BALANCED,
            affinityKey = affinityKey,
        )
        return applyResolvedModel(config, model)
    }

    private suspend fun resolveModel(
        config: AgentConfig,
        role: SwarmAgentRole,
        affinityKey: String,
    ): AgentConfig {
        val model = modelService?.select(role, AgentModelSelectionStrategy.BALANCED, affinityKey)
        return applyResolvedModel(config, model)
    }

    private fun applyResolvedModel(config: AgentConfig, model: com.swarmeditor.common.model.ModelConfig?): AgentConfig {
        val agentRevision = config.revision()
        if (model == null) return config.copy(agentRevision = agentRevision)
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

    private suspend fun acquireDynamicAgentSlot(agentId: String): AgentConfig {
        while (true) {
            val observedVersion = allocationVersion.value
            val base = lifecycleMutex.withLock { requireBaseLaunchConfigLocked(agentId) }
            val acquired = allocationMutex.withLock {
                val active = activeDynamicAgentCounts.getOrDefault(agentId, 0)
                if (active >= base.maxDynamicSubagents) return@withLock false
                activeDynamicAgentCounts[agentId] = active + 1
                publishDynamicAgentCountsLocked()
                true
            }
            if (acquired) return base
            allocationVersion.first { version -> version != observedVersion }
        }
    }

    private suspend fun releaseDynamicAgentSlot(agentId: String) {
        allocationMutex.withLock {
            val active = activeDynamicAgentCounts.getOrDefault(agentId, 0)
            check(active > 0) { "Dynamic agent allocation is not active: $agentId" }
            if (active == 1) activeDynamicAgentCounts.remove(agentId) else activeDynamicAgentCounts[agentId] = active - 1
            publishDynamicAgentCountsLocked()
            allocationVersion.update(Long::inc)
        }
    }

    private fun publishDynamicAgentCountsLocked() {
        _activeDynamicAgents.value = activeDynamicAgentCounts.toSortedMap()
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
        allocationVersion.update(Long::inc)
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
    modelConfigId,
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
