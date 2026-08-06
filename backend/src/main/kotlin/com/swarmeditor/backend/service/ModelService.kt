package com.swarmeditor.backend.service

import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmModelDemand
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs
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

class ModelAllocation internal constructor(
    val config: ModelConfig,
    val demand: SwarmModelDemand? = null,
    val selectionReason: String? = null,
    private val releaseAllocation: suspend () -> Unit,
) {
    private val released = AtomicBoolean(false)

    suspend fun release() {
        if (released.compareAndSet(false, true)) releaseAllocation()
    }
}

class ModelService(
    private val registry: ModelRegistry,
    private val invalidateRuntimes: suspend () -> Unit = {},
) {
    private val mutex = Mutex()
    private val allocationMutex = Mutex()
    private val sequence = AtomicLong()
    private val activeAllocationCounts = mutableMapOf<String, Int>()
    private val allocationVersion = MutableStateFlow(0L)
    private val _models = MutableStateFlow<List<ModelConfig>>(emptyList())
    val models: StateFlow<List<ModelConfig>> = _models.asStateFlow()
    private val _activeAllocations = MutableStateFlow<Map<String, Int>>(emptyMap())
    val activeAllocations: StateFlow<Map<String, Int>> = _activeAllocations.asStateFlow()

    suspend fun init() {
        registry.load()
        refresh()
    }

    suspend fun upsert(config: ModelConfig): Result<Unit> = resultOf {
        mutex.withLock {
            val previous = registry.get(config.id)
            registry.upsert(config)
            try {
                invalidateRuntimes()
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        if (previous == null) registry.delete(config.id) else registry.upsert(previous)
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
            refresh()
        }
    }

    suspend fun synchronizeCatalog(catalog: List<PiModelInfo>): Result<Unit> = resultOf {
        require(catalog.isNotEmpty()) { "Pi 模型目录为空，请先启动主智能体并刷新模型" }
        mutex.withLock {
            val current = registry.getAll()
            val currentByIdentity = current
                .filter { it.id != ModelRegistry.DEFAULT_MODEL_ID && it.provider.isNotBlank() && it.model.isNotBlank() }
                .associateBy { it.provider to it.model }
            val defaultConfig = current.firstOrNull { it.id == ModelRegistry.DEFAULT_MODEL_ID }
                ?: ModelRegistry.defaultConfig()
            val synchronized = buildList {
                add(defaultConfig.copy(name = "Pi 自动选择", provider = "", model = ""))
                catalog.distinctBy { it.provider to it.id }.forEach { model ->
                    add(model.toModelConfig(currentByIdentity[model.provider to model.id]))
                }
            }
            registry.replaceAll(synchronized)
            refresh()
        }
    }

    suspend fun delete(id: String): Result<Unit> = resultOf {
        mutex.withLock {
            val previous = registry.get(id) ?: error("Model config not found: $id")
            registry.delete(id)
            try {
                invalidateRuntimes()
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        registry.upsert(previous)
                    } catch (rollbackError: Throwable) {
                        error.addSuppressed(rollbackError)
                    }
                }
                throw error
            }
            refresh()
        }
    }

    suspend fun get(id: String): ModelConfig? = registry.get(id)

    suspend fun select(
        role: SwarmAgentRole,
        affinityKey: String = "",
        demand: SwarmModelDemand? = null,
    ): ModelConfig {
        val enabled = registry.getAll().filter(ModelConfig::enabled)
        check(enabled.isNotEmpty()) { "没有已启用的模型配置" }
        return selectCandidate(
            candidates = roleScoped(enabled, role, includeGenericFallback = demand != null),
            affinityKey = affinityKey,
            demand = demand,
            weight = ModelConfig::maxConcurrentAgents,
        ).config
    }

    suspend fun acquire(
        role: SwarmAgentRole,
        affinityKey: String = "",
        demand: SwarmModelDemand? = null,
    ): ModelAllocation {
        while (true) {
            val observedVersion = allocationVersion.value
            val allocation = allocationMutex.withLock {
                val enabled = registry.getAll().filter(ModelConfig::enabled)
                check(enabled.isNotEmpty()) { "没有已启用的模型配置" }
                val available = roleScoped(enabled, role, includeGenericFallback = demand != null).filter { config ->
                    activeAllocationCounts.getOrDefault(config.id, 0) < config.maxConcurrentAgents
                }
                if (available.isEmpty()) return@withLock null
                val selected = selectCandidate(
                    candidates = available,
                    affinityKey = affinityKey,
                    demand = demand,
                    weight = { config ->
                        config.maxConcurrentAgents - activeAllocationCounts.getOrDefault(config.id, 0)
                    },
                )
                activeAllocationCounts[selected.config.id] =
                    activeAllocationCounts.getOrDefault(selected.config.id, 0) + 1
                publishActiveAllocationsLocked()
                ModelAllocation(
                    config = selected.config,
                    demand = demand,
                    selectionReason = selected.reason,
                ) { release(selected.config.id) }
            }
            if (allocation != null) return allocation
            allocationVersion.first { version -> version != observedVersion }
        }
    }

    suspend fun isEnabled(id: String): Boolean = registry.get(id)?.enabled == true

    suspend fun isCurrent(id: String, revision: String): Boolean {
        val current = registry.get(id) ?: return false
        return current.enabled && current.revision() == revision
    }

    private suspend fun refresh() {
        _models.value = registry.getAll()
        allocationVersion.update(Long::inc)
    }

    private suspend fun release(modelId: String) {
        allocationMutex.withLock {
            val active = activeAllocationCounts.getOrDefault(modelId, 0)
            check(active > 0) { "Model allocation is not active: $modelId" }
            if (active == 1) activeAllocationCounts.remove(modelId) else activeAllocationCounts[modelId] = active - 1
            publishActiveAllocationsLocked()
            allocationVersion.update(Long::inc)
        }
    }

    private fun publishActiveAllocationsLocked() {
        _activeAllocations.value = activeAllocationCounts.toSortedMap()
    }

    private fun selectCandidate(
        candidates: List<ModelConfig>,
        affinityKey: String,
        demand: SwarmModelDemand?,
        weight: (ModelConfig) -> Int,
    ): CandidateSelection {
        val ordered = if (demand == null) {
            candidates.sortedWith(
                compareByDescending<ModelConfig>(ModelConfig::priority)
                    .thenByDescending(ModelConfig::maxConcurrentAgents)
                    .thenBy(ModelConfig::id)
            )
        } else {
            candidates.sortedWith(
                compareBy<ModelConfig> {
                    abs(it.thinkingLevel.qualityRank() - demand.targetThinkingLevel.qualityRank())
                }.thenByDescending(ModelConfig::priority)
                    .thenByDescending(weight)
                    .thenBy(ModelConfig::id)
            )
        }
        if (ordered.size == 1 || demand != null) {
            val selected = ordered.first()
            return CandidateSelection(selected, selectionReason(selected, demand))
        }
        val seed = affinityKey.takeIf(String::isNotBlank)?.hashCode()?.toLong() ?: sequence.getAndIncrement()
        val totalWeight = ordered.sumOf(weight)
        check(totalWeight > 0) { "Model allocation capacity must be positive" }
        var slot = Math.floorMod(seed, totalWeight.toLong()).toInt()
        val selected = ordered.first { config ->
            slot -= weight(config)
            slot < 0
        }
        return CandidateSelection(selected, selectionReason(selected, demand))
    }

    private fun selectionReason(
        selected: ModelConfig,
        demand: SwarmModelDemand?,
    ): String = when {
        demand == null -> "balanced capacity selection"
        else -> buildString {
            val thinkingDistance = abs(
                selected.thinkingLevel.qualityRank() - demand.targetThinkingLevel.qualityRank()
            )
            append("balanced demand match target=")
            append(demand.targetThinkingLevel.name.lowercase())
            append(", selected=")
            append(selected.thinkingLevel.name.lowercase())
            append(", score=")
            append(demand.normalizedScore)
            append(", repositoryRisk=")
            append(demand.repositoryRiskScore)
            if (thinkingDistance > 0) append(", capacityOrRoleFallbackDistance=$thinkingDistance")
            if (demand.reasons.isNotEmpty()) append(", reasons=${demand.reasons.joinToString("|")}")
        }
    }
}

private data class CandidateSelection(
    val config: ModelConfig,
    val reason: String,
)

private fun roleScoped(
    enabled: List<ModelConfig>,
    role: SwarmAgentRole,
    includeGenericFallback: Boolean,
): List<ModelConfig> {
    val roleSpecific = enabled.filter { role in it.roles }
    if (includeGenericFallback) {
        return (roleSpecific + enabled.filter { it.roles.isEmpty() }).distinctBy(ModelConfig::id).ifEmpty { enabled }
    }
    return roleSpecific.ifEmpty { enabled.filter { it.roles.isEmpty() } }.ifEmpty { enabled }
}

private fun AgentThinkingLevel.qualityRank(): Int = when (this) {
    AgentThinkingLevel.OFF -> 0
    AgentThinkingLevel.MINIMAL -> 1
    AgentThinkingLevel.LOW -> 2
    AgentThinkingLevel.MEDIUM -> 3
    AgentThinkingLevel.HIGH -> 4
    AgentThinkingLevel.XHIGH -> 5
}

internal fun ModelConfig.revision(): String = listOf(
    id,
    name,
    provider,
    model,
    api,
    reasoning.toString(),
    contextWindow.toString(),
    maxTokens.toString(),
    inputModes.joinToString(","),
    enabled.toString(),
    thinkingLevel.name,
    priority.toString(),
    roles.joinToString(",") { it.name },
    maxConcurrentAgents.toString(),
).joinToString("\u0000")

private fun PiModelInfo.toModelConfig(existing: ModelConfig?): ModelConfig = ModelConfig(
    id = existing?.id ?: stablePiModelConfigId(provider, id),
    name = name.ifBlank { id },
    provider = provider,
    model = id,
    api = api,
    reasoning = reasoning,
    contextWindow = contextWindow,
    maxTokens = maxTokens,
    inputModes = inputModes,
    enabled = existing?.enabled ?: true,
    thinkingLevel = if (reasoning) existing?.thinkingLevel ?: AgentThinkingLevel.MEDIUM else AgentThinkingLevel.OFF,
    priority = existing?.priority ?: 100,
    roles = existing?.roles.orEmpty(),
    maxConcurrentAgents = existing?.maxConcurrentAgents ?: 2,
)

internal fun stablePiModelConfigId(provider: String, modelId: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
        .digest("$provider\u0000$modelId".toByteArray())
        .take(12)
        .joinToString("") { byte -> "%02x".format(byte) }
    return "pi-$digest"
}

private suspend fun resultOf(action: suspend () -> Unit): Result<Unit> = try {
    action()
    Result.success(Unit)
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}
