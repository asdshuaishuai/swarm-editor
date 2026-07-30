package com.swarmeditor.backend.service

import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.common.model.AgentModelSelectionStrategy
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class ModelService(
    private val registry: ModelRegistry,
    private val invalidateRuntimes: suspend () -> Unit = {},
) {
    private val mutex = Mutex()
    private val sequence = AtomicLong()
    private val _models = MutableStateFlow<List<ModelConfig>>(emptyList())
    val models: StateFlow<List<ModelConfig>> = _models.asStateFlow()

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

    suspend fun create(templateId: String? = null): Result<ModelConfig> = resultOfValue {
        mutex.withLock {
            val template = templateId?.let { registry.get(it) } ?: ModelRegistry.defaultConfig()
            val created = template.copy(
                id = "model-${UUID.randomUUID().toString().take(8)}",
                name = "${template.name} 副本",
                enabled = true,
            )
            registry.upsert(created)
            refresh()
            created
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
        strategy: AgentModelSelectionStrategy,
        affinityKey: String = "",
    ): ModelConfig {
        val enabled = registry.getAll().filter(ModelConfig::enabled)
        check(enabled.isNotEmpty()) { "没有已启用的模型配置" }
        val roleScoped = enabled.filter { role in it.roles }
            .ifEmpty { enabled.filter { it.roles.isEmpty() } }
            .ifEmpty { enabled }
        val ordered = when (strategy) {
            AgentModelSelectionStrategy.QUALITY_FIRST -> roleScoped.sortedWith(
                compareByDescending<ModelConfig> { it.thinkingLevel.qualityRank() }
                    .thenByDescending(ModelConfig::priority)
                    .thenBy(ModelConfig::id)
            )
            AgentModelSelectionStrategy.SPEED_FIRST -> roleScoped.sortedWith(
                compareBy<ModelConfig> { it.thinkingLevel.qualityRank() }
                    .thenByDescending(ModelConfig::priority)
                    .thenBy(ModelConfig::id)
            )
            AgentModelSelectionStrategy.BALANCED -> roleScoped.sortedWith(
                compareByDescending<ModelConfig>(ModelConfig::priority)
                    .thenByDescending(ModelConfig::maxConcurrentAgents)
                    .thenBy(ModelConfig::id)
            )
        }
        if (strategy != AgentModelSelectionStrategy.BALANCED || ordered.size == 1) return ordered.first()
        val seed = affinityKey.takeIf(String::isNotBlank)?.hashCode()?.toLong() ?: sequence.getAndIncrement()
        val totalWeight = ordered.sumOf(ModelConfig::maxConcurrentAgents)
        var slot = Math.floorMod(seed, totalWeight.toLong()).toInt()
        return ordered.first { config ->
            slot -= config.maxConcurrentAgents
            slot < 0
        }
    }

    suspend fun isEnabled(id: String): Boolean = registry.get(id)?.enabled == true

    suspend fun isCurrent(id: String, revision: String): Boolean {
        val current = registry.get(id) ?: return false
        return current.enabled && current.revision() == revision
    }

    private suspend fun refresh() {
        _models.value = registry.getAll()
    }
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
    enabled.toString(),
    thinkingLevel.name,
    env.entries.sortedBy(Map.Entry<String, String>::key).joinToString(";") { "${it.key}=${it.value}" },
    priority.toString(),
    roles.joinToString(",") { it.name },
    maxConcurrentAgents.toString(),
).joinToString("\u0000")

private suspend fun resultOf(action: suspend () -> Unit): Result<Unit> = try {
    action()
    Result.success(Unit)
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}

private suspend fun <T> resultOfValue(action: suspend () -> T): Result<T> = try {
    Result.success(action())
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}
