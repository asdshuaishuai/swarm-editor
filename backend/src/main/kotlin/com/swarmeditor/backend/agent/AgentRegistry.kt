package com.swarmeditor.backend.agent

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

/** 持久化主智能体策略；子智能体只在运行时动态创建。 */
class AgentRegistry(
    private val configPath: File = File(ConfigPaths.AGENTS_JSON),
    private val maxFileBytes: Long = 4L * 1024 * 1024,
    private val persist: suspend (String) -> Unit = { content ->
        withContext(Dispatchers.IO) {
            configPath.parentFile?.mkdirs()
            configPath.atomicWriteText(content)
        }
    },
) {
    private val mutex = Mutex()
    private val configs = linkedMapOf<String, AgentConfig>()
    private val statuses = mutableMapOf<String, AgentStatus>()
    private val versions = mutableMapOf<String, String>()
    private val errors = mutableMapOf<String, String?>()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        var quarantined = false
        val decodedFile = if (configPath.isFile) {
            try {
                json.decodeFromString(AgentsFile.serializer(), configPath.readBoundedUtf8(maxFileBytes))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val quarantine = quarantineAgentFile(error)
                quarantined = true
                log.warn { "Quarantined unreadable agent profiles to ${quarantine.name}: ${error.message}" }
                null
            }
        } else {
            null
        }
        if (decodedFile != null) {
            require(decodedFile.schemaVersion in SUPPORTED_SCHEMAS) {
                "Unsupported agent profile schema: ${decodedFile.schemaVersion}"
            }
        }
        val loadedFile = if (decodedFile == null) {
            null
        } else {
            try {
                decodedFile to when {
                    decodedFile.schemaVersion < CURRENT_SCHEMA -> listOf(
                        normalizeDefaultConfig(decodedFile.agents.firstOrNull { it.id == DEFAULT_AGENT_ID })
                    )
                    else -> listOf(normalizeDefaultConfig(decodedFile.agents.firstOrNull { it.id == DEFAULT_AGENT_ID }))
                }
            } catch (error: Exception) {
                val quarantine = quarantineAgentFile(error)
                quarantined = true
                log.warn { "Quarantined invalid agent profiles to ${quarantine.name}: ${error.message}" }
                null
            }
        }
        if (quarantined && mutex.withLock { configs.isNotEmpty() }) return@withContext
        val normalized = loadedFile?.second ?: listOf(defaultConfig())
        mutex.withLock {
            configs.clear()
            statuses.clear()
            versions.clear()
            errors.clear()
            normalized.forEach { configs[it.id] = it }
            configs.keys.forEach { statuses[it] = AgentStatus.DISCONNECTED }
        }
        if (loadedFile == null || loadedFile.first.schemaVersion != CURRENT_SCHEMA || loadedFile.first.agents != normalized) {
            save()
        }
    }

    suspend fun getConfig(agentId: String): AgentConfig? = mutex.withLock { configs[agentId] }

    suspend fun getAllConfigs(): List<AgentConfig> = mutex.withLock { configs.values.toList() }

    suspend fun upsert(config: AgentConfig) {
        require(config.id == DEFAULT_AGENT_ID) { "Static subagent profiles are no longer supported" }
        val normalized = normalizeDefaultConfig(config)
        mutateAndSave {
            configs[normalized.id] = normalized
            statuses.putIfAbsent(normalized.id, AgentStatus.DISCONNECTED)
        }
    }

    suspend fun delete(agentId: String) {
        require(agentId != DEFAULT_AGENT_ID) { "内置 Pi Agent 不能删除" }
        mutateAndSave {
            require(configs.remove(agentId) != null) { "Agent Profile 不存在: $agentId" }
            statuses.remove(agentId)
            versions.remove(agentId)
            errors.remove(agentId)
        }
    }

    suspend fun updateRuntimeState(
        status: AgentStatus,
        version: String = "",
        errorMessage: String? = null
    ) = mutex.withLock {
        configs.keys.forEach { id ->
            statuses[id] = status
            if (version.isNotBlank()) versions[id] = version
            errors[id] = errorMessage
        }
    }

    suspend fun updateStatus(
        agentId: String,
        status: AgentStatus,
        version: String = "",
        errorMessage: String? = null
    ) = mutex.withLock {
        if (configs.containsKey(agentId)) {
            statuses[agentId] = status
            if (version.isNotBlank()) versions[agentId] = version
            errors[agentId] = errorMessage
        }
    }

    suspend fun runtimeInfos(): List<AgentRuntimeInfo> = mutex.withLock {
        configs.values.map { config ->
            AgentRuntimeInfo(
                config = config,
                status = statuses[config.id] ?: AgentStatus.DISCONNECTED,
                version = versions[config.id].orEmpty(),
                errorMessage = errors[config.id]
            )
        }
    }

    suspend fun save() {
        val snapshot = mutex.withLock {
            AgentsFile(schemaVersion = CURRENT_SCHEMA, agents = configs.values.toList())
        }
        persist(
            json.encodeToString(AgentsFile.serializer(), snapshot)
                .requireUtf8Size(maxFileBytes, "Agent profile data")
        )
    }

    private suspend fun mutateAndSave(mutation: () -> Unit) = mutex.withLock {
        val previous = RegistrySnapshot(
            configs = configs.toMap(),
            statuses = statuses.toMap(),
            versions = versions.toMap(),
            errors = errors.toMap()
        )
        mutation()
        try {
            persist(
                json.encodeToString(
                    AgentsFile.serializer(),
                    AgentsFile(schemaVersion = CURRENT_SCHEMA, agents = configs.values.toList())
                ).requireUtf8Size(maxFileBytes, "Agent profile data")
            )
        } catch (error: Throwable) {
            configs.clear()
            configs.putAll(previous.configs)
            statuses.clear()
            statuses.putAll(previous.statuses)
            versions.clear()
            versions.putAll(previous.versions)
            errors.clear()
            errors.putAll(previous.errors)
            throw error
        }
    }

    companion object {
        const val DEFAULT_AGENT_ID = "pi-default"
        private const val CURRENT_SCHEMA = 4
        private val SUPPORTED_SCHEMAS = 1..CURRENT_SCHEMA
        private val PROFILE_ID = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")

        fun defaultConfig() = AgentConfig(
            id = DEFAULT_AGENT_ID,
            name = "Pi 主智能体",
            description = "负责规划任务并按需创建 Pi 子智能体",
            tags = listOf("pi", "builtin")
        )

        private fun normalizeDefaultConfig(config: AgentConfig?): AgentConfig {
            val default = defaultConfig()
            return (config ?: default).copy(
                id = DEFAULT_AGENT_ID,
                name = config?.name?.trim().takeUnless { it.isNullOrBlank() } ?: default.name,
                description = config?.description?.takeIf { it.isNotBlank() } ?: default.description,
                enabled = true,
                tags = (config?.tags.orEmpty() + default.tags).distinct(),
                maxDynamicSubagents = (config?.maxDynamicSubagents ?: default.maxDynamicSubagents).coerceIn(1, 32),
            )
        }
    }

    private fun quarantineAgentFile(error: Exception): File = try {
        configPath.quarantineCorruptFile()
    } catch (quarantineError: Exception) {
        quarantineError.addSuppressed(error)
        throw quarantineError
    }
}

private data class RegistrySnapshot(
    val configs: Map<String, AgentConfig>,
    val statuses: Map<String, AgentStatus>,
    val versions: Map<String, String>,
    val errors: Map<String, String?>
)

@Serializable
private data class AgentsFile(
    val schemaVersion: Int = 1,
    val agents: List<AgentConfig> = emptyList()
)
