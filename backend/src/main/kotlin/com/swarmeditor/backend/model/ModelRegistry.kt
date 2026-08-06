package com.swarmeditor.backend.model

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private val log = KotlinLogging.logger {}

/** 持久化独立模型池，并从旧 Agent Profile 中迁移一次模型配置。 */
class ModelRegistry(
    private val configPath: File = File(ConfigPaths.MODELS_JSON),
    private val legacyAgentsPath: File = File(ConfigPaths.AGENTS_JSON),
    private val maxFileBytes: Long = 4L * 1024 * 1024,
    private val persist: suspend (String) -> Unit = { content ->
        withContext(Dispatchers.IO) {
            configPath.parentFile?.mkdirs()
            configPath.atomicWriteText(content)
        }
    },
) {
    private val mutex = Mutex()
    private val configs = linkedMapOf<String, ModelConfig>()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        var quarantined = false
        val decoded = if (configPath.isFile) {
            try {
                json.decodeFromString(ModelsFile.serializer(), configPath.readBoundedUtf8(maxFileBytes))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val quarantine = configPath.quarantineCorruptFile()
                quarantined = true
                log.warn { "Quarantined unreadable model pool to ${quarantine.name}: ${error.message}" }
                null
            }
        } else {
            null
        }
        decoded?.let {
            require(it.schemaVersion in SUPPORTED_SCHEMAS) { "Unsupported model schema: ${it.schemaVersion}" }
        }
        val normalized = try {
            when {
                decoded != null -> normalize(decoded.models)
                else -> listOf(migrateLegacyModel() ?: defaultConfig())
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (decoded != null) {
                val quarantine = configPath.quarantineCorruptFile()
                quarantined = true
                log.warn { "Quarantined invalid model pool to ${quarantine.name}: ${error.message}" }
            }
            listOf(defaultConfig())
        }
        if (quarantined && mutex.withLock { configs.isNotEmpty() }) return@withContext
        mutex.withLock {
            configs.clear()
            normalized.forEach { configs[it.id] = it }
        }
        if (decoded == null || decoded.schemaVersion != CURRENT_SCHEMA || decoded.models != normalized) save()
    }

    suspend fun getAll(): List<ModelConfig> = mutex.withLock { configs.values.toList() }

    suspend fun get(id: String): ModelConfig? = mutex.withLock { configs[id] }

    suspend fun upsert(config: ModelConfig) = mutateAndSave {
        val normalized = normalizeConfig(config)
        configs[normalized.id] = normalized
    }

    suspend fun replaceAll(models: List<ModelConfig>) = mutateAndSave {
        val normalized = normalize(models)
        configs.clear()
        normalized.forEach { configs[it.id] = it }
    }

    suspend fun delete(id: String) = mutateAndSave {
        require(configs.size > 1) { "至少保留一个模型配置" }
        checkNotNull(configs.remove(id)) { "Model config not found: $id" }
    }

    suspend fun save() {
        val snapshot = mutex.withLock { ModelsFile(CURRENT_SCHEMA, configs.values.toList()) }
        persist(json.encodeToString(ModelsFile.serializer(), snapshot).requireUtf8Size(maxFileBytes, "Model pool data"))
    }

    private suspend fun mutateAndSave(mutation: () -> Unit) = mutex.withLock {
        val previous = configs.toMap()
        mutation()
        try {
            persist(
                json.encodeToString(ModelsFile.serializer(), ModelsFile(CURRENT_SCHEMA, configs.values.toList()))
                    .requireUtf8Size(maxFileBytes, "Model pool data")
            )
        } catch (error: Throwable) {
            configs.clear()
            configs.putAll(previous)
            throw error
        }
    }

    private fun normalize(loaded: List<ModelConfig>): List<ModelConfig> {
        val normalized = linkedMapOf<String, ModelConfig>()
        loaded.ifEmpty { listOf(defaultConfig()) }.forEach { config ->
            val value = normalizeConfig(config)
            require(value.id !in normalized) { "Duplicate model id: ${value.id}" }
            normalized[value.id] = value
        }
        return normalized.values.toList()
    }

    private fun normalizeConfig(config: ModelConfig): ModelConfig {
        require(config.id.matches(CONFIG_ID)) { "Invalid model id: ${config.id}" }
        require(config.maxConcurrentAgents > 0) { "Model concurrency must be positive" }
        return config.copy(
            name = config.name.trim().ifBlank { "Pi Model" },
            provider = config.provider.trim(),
            model = config.model.trim(),
            api = config.api.trim(),
            contextWindow = config.contextWindow.coerceAtLeast(0),
            maxTokens = config.maxTokens.coerceAtLeast(0),
            inputModes = config.inputModes.map(String::trim).filter(String::isNotBlank).distinct(),
            priority = config.priority.coerceIn(0, 1000),
            roles = config.roles.distinct(),
        )
    }

    private fun migrateLegacyModel(): ModelConfig? {
        if (!legacyAgentsPath.isFile) return null
        val root = json.parseToJsonElement(legacyAgentsPath.readBoundedUtf8(maxFileBytes)).jsonObject
        val agent = root["agents"]?.jsonArray
            ?.map { it.jsonObject }
            ?.firstOrNull { it["id"]?.jsonPrimitive?.contentOrNull == "pi-default" }
            ?: return null
        val thinking = agent["thinkingLevel"]?.jsonPrimitive?.contentOrNull
            ?.uppercase()
            ?.let { value -> AgentThinkingLevel.entries.firstOrNull { it.name == value } }
            ?: AgentThinkingLevel.MEDIUM
        return defaultConfig().copy(
            provider = agent["provider"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            model = agent["model"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            thinkingLevel = thinking,
            priority = agent["priority"]?.jsonPrimitive?.intOrNull ?: 100,
        )
    }

    companion object {
        const val DEFAULT_MODEL_ID = "pi-default-model"
        private const val CURRENT_SCHEMA = 2
        private val SUPPORTED_SCHEMAS = 1..CURRENT_SCHEMA
        private val CONFIG_ID = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")

        fun defaultConfig() = ModelConfig(
            id = DEFAULT_MODEL_ID,
            name = "Pi 默认模型",
            priority = 100,
        )
    }
}

@Serializable
private data class ModelsFile(
    val schemaVersion: Int = 2,
    val models: List<ModelConfig> = emptyList(),
)
