package com.swarmeditor.backend.pi

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private val log = KotlinLogging.logger {}

/** 单个 Provider 的界面化模型配置视图。 */
data class PiModelEndpointView(
    val id: String,
    val name: String,
    val baseUrl: String,
    val reasoning: Boolean,
)

/** 单个 Provider 的界面化模型配置视图。 */
data class PiProviderView(
    val id: String,
    val name: String,
    val baseUrl: String,
    val api: String,
    val apiKey: String,
    val authHeader: Boolean,
    val models: List<PiModelEndpointView>,
)

/** Pi agent 模型配置文件的一个可编辑快照。 */
data class PiAgentConfigUi(
    val providers: List<PiProviderView> = emptyList(),
    val defaultProvider: String = "",
    val defaultModel: String = "",
    val defaultThinkingLevel: String = "",
)

/**
 * 将 Pi Agent 的模型配置文件（models.json / auth.json / settings.json）界面化。
 *
 * 文件落在隔离的 agent 目录（~/.swarm-editor/pi-agent/agents/<base64>）中，pi 通过
 * PI_CODING_AGENT_DIR 读取。本服务只做整文件 JSON 读取与更新，保留未知字段，
 * 保存后由调用方触发 runtime 失效使配置生效。
 */
class PiModelConfigService(
    private val invalidateRuntimes: suspend () -> Unit = {},
    private val agentDirectoryProvider: () -> File = { PiRuntimePaths.agentDirectory(AgentRegistry.DEFAULT_AGENT_ID) },
    private val maxFileBytes: Long = 4L * 1024 * 1024,
) {
    private val mutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val _state = MutableStateFlow(PiAgentConfigUi())
    val state: StateFlow<PiAgentConfigUi> = _state.asStateFlow()

    fun configDirectory(): File = agentDirectoryProvider()

    suspend fun load() {
        val view = mutex.withLock {
            readView()
        }
        _state.value = view
    }

    suspend fun upsertProvider(
        providerId: String,
        name: String,
        baseUrl: String,
        api: String,
        apiKey: String,
        authHeader: Boolean,
    ) = mutex.withLock {
        val directory = configDirectory()
        val models = readJson(directory.resolve(MODELS_FILE), JsonObject(emptyMap()))
        val providers = models["providers"]?.jsonObject?.toMutableMap() ?: mutableMapOf()

        val existing = providers[providerId]?.jsonObject ?: JsonObject(emptyMap())
        val updatedProvider = buildJsonObject {
            // 保留所有既有键，仅覆盖受支持字段
            existing.forEach { (key, value) -> put(key, value) }
            put("name", name.ifBlank { providerId })
            if (baseUrl.isNotBlank()) put("baseUrl", baseUrl)
            if (api.isNotBlank()) put("api", api)
            if (authHeader) put("authHeader", true)
        }
        providers[providerId] = updatedProvider

        val updatedModels = JsonObject(
            models + ("providers" to JsonObject(providers)),
        )
        directory.resolve(MODELS_FILE).atomicWrite(updatedModels)

        // API key 单独写入 auth.json（默认 type=api_key）。
        if (apiKey.isNotBlank()) {
            val auth = readJson(directory.resolve(AUTH_FILE), JsonObject(emptyMap()))
            val authProviders = auth["providers"]?.jsonObject
            val credential = buildJsonObject {
                put("type", "api_key")
                put("key", apiKey)
            }
            val newAuthProviders = if (authProviders != null) {
                JsonObject(authProviders.toMutableMap().apply { put(providerId, credential) })
            } else {
                JsonObject(mapOf(providerId to credential))
            }
            directory.resolve(AUTH_FILE).atomicWrite(JsonObject(auth.toMutableMap().apply { put("providers", newAuthProviders) }))
        }

        _state.value = readView()
    }

    suspend fun deleteProvider(providerId: String) = mutex.withLock {
        val directory = configDirectory()
        val models = readJson(directory.resolve(MODELS_FILE), JsonObject(emptyMap()))
        val providers = models["providers"]?.jsonObject?.toMutableMap() ?: mutableMapOf()
        if (providers.remove(providerId) != null) {
            directory.resolve(MODELS_FILE).atomicWrite(
                JsonObject(models + ("providers" to JsonObject(providers))),
            )
        }
        val auth = readJson(directory.resolve(AUTH_FILE), JsonObject(emptyMap()))
        val authProviders = auth["providers"]?.jsonObject?.toMutableMap() ?: mutableMapOf()
        if (authProviders.remove(providerId) != null) {
            directory.resolve(AUTH_FILE).atomicWrite(
                JsonObject(auth.toMutableMap().apply { put("providers", JsonObject(authProviders)) }),
            )
        }
        _state.value = readView()
    }

    /** 在指定 Provider 下新增或更新一个模型端点（models[] 数组项）。 */
    suspend fun upsertModel(
        providerId: String,
        modelId: String,
        name: String,
        baseUrl: String,
        reasoning: Boolean,
    ) = mutex.withLock {
        require(modelId.isNotBlank()) { "模型 ID 不能为空" }
        val directory = configDirectory()
        val models = readJson(directory.resolve(MODELS_FILE), JsonObject(emptyMap()))
        val providers = models["providers"]?.jsonObject?.toMutableMap() ?: mutableMapOf()
        val existingProvider = providers[providerId]?.jsonObject ?: error("Provider 不存在: $providerId")

        val existingModels = existingProvider["models"]?.let { it as? JsonArray } ?: JsonArray(emptyList())
        val updatedModelsArray = buildJsonArray {
            var replaced = false
            existingModels.forEach { model ->
                val entry = (model as? JsonObject)
                if (entry?.get("id")?.jsonPrimitive?.contentOrNull == modelId) {
                    // 覆盖既有项，保留其余字段（如 cost/contextWindow/api）
                    val merged = buildJsonObject {
                        entry.forEach { (key, value) -> put(key, value) }
                        put("name", name.ifBlank { modelId })
                        if (baseUrl.isNotBlank()) put("baseUrl", baseUrl)
                        if (reasoning) put("reasoning", true)
                    }
                    add(merged)
                    replaced = true
                } else {
                    // 未必是对象；原样保留
                    add(model)
                }
            }
            if (!replaced) {
                add(buildJsonObject {
                    put("id", modelId)
                    put("name", name.ifBlank { modelId })
                    if (baseUrl.isNotBlank()) put("baseUrl", baseUrl)
                    if (reasoning) put("reasoning", true)
                })
            }
        }

        val updatedProvider = buildJsonObject {
            existingProvider.forEach { (key, value) -> put(key, value) }
            put("models", updatedModelsArray)
        }
        providers[providerId] = updatedProvider
        directory.resolve(MODELS_FILE).atomicWrite(
            JsonObject(models + ("providers" to JsonObject(providers))),
        )
        _state.value = readView()
    }

    /** 删除指定 Provider 下的一个模型端点。 */
    suspend fun deleteModel(providerId: String, modelId: String) = mutex.withLock {
        val directory = configDirectory()
        val models = readJson(directory.resolve(MODELS_FILE), JsonObject(emptyMap()))
        val providers = models["providers"]?.jsonObject?.toMutableMap() ?: mutableMapOf()
        val existingProvider = providers[providerId]?.jsonObject ?: return@withLock
        val existingModels = existingProvider["models"]?.let { it as? JsonArray } ?: JsonArray(emptyList())
        val remaining = existingModels.filterNot { model ->
            (model as? JsonObject)?.get("id")?.jsonPrimitive?.contentOrNull == modelId
        }
        if (remaining.size == existingModels.size) return@withLock
        val updatedProvider = buildJsonObject {
            existingProvider.forEach { (key, value) -> put(key, value) }
            put("models", buildJsonArray { remaining.forEach { add(it) } })
        }
        providers[providerId] = updatedProvider
        directory.resolve(MODELS_FILE).atomicWrite(
            JsonObject(models + ("providers" to JsonObject(providers))),
        )
        _state.value = readView()
    }

    suspend fun setDefaults(defaultProvider: String, defaultModel: String, defaultThinkingLevel: String) = mutex.withLock {
        val directory = configDirectory()
        val settings = readJson(directory.resolve(SETTINGS_FILE), JsonObject(emptyMap())).toMutableMap()
        if (defaultProvider.isNotBlank()) settings["defaultProvider"] = JsonPrimitive(defaultProvider)
        if (defaultModel.isNotBlank()) settings["defaultModel"] = JsonPrimitive(defaultModel)
        if (defaultThinkingLevel.isNotBlank()) settings["defaultThinkingLevel"] = JsonPrimitive(defaultThinkingLevel)
        directory.resolve(SETTINGS_FILE).atomicWrite(JsonObject(settings))
        _state.value = readView()
    }

    suspend fun applyChanges() {
        invalidateRuntimes()
    }

    private fun readView(): PiAgentConfigUi {
        val directory = configDirectory()
        if (!directory.isDirectory) return PiAgentConfigUi()
        val models = readJson(directory.resolve(MODELS_FILE), JsonObject(emptyMap()))
        val auth = readJson(directory.resolve(AUTH_FILE), JsonObject(emptyMap()))
        val settings = readJson(directory.resolve(SETTINGS_FILE), JsonObject(emptyMap()))

        val authProviders = auth["providers"]?.jsonObject ?: JsonObject(emptyMap())
        val providers = models["providers"]?.jsonObject ?: JsonObject(emptyMap())
        val views = providers.mapNotNull { (id, element) ->
            val provider = element.jsonObjectOrNull() ?: return@mapNotNull null
            val modelsArray = provider["models"]?.let { it as? JsonArray } ?: JsonArray(emptyList())
            val apiKey = authProviders[id]?.jsonObjectOrNull()?.get("key")?.jsonPrimitive?.contentOrNull.orEmpty()
            val endpointModels = modelsArray.mapNotNull { model ->
                val entry = (model as? JsonObject) ?: return@mapNotNull null
                val modelId = entry["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
                if (modelId.isBlank()) return@mapNotNull null
                PiModelEndpointView(
                    id = modelId,
                    name = entry["name"]?.jsonPrimitive?.contentOrNull?.ifBlank { modelId } ?: modelId,
                    baseUrl = entry["baseUrl"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    reasoning = entry["reasoning"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() == true,
                )
            }
            PiProviderView(
                id = id,
                name = provider["name"]?.jsonPrimitive?.contentOrNull?.ifBlank { id } ?: id,
                baseUrl = provider["baseUrl"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                api = provider["api"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                apiKey = apiKey,
                authHeader = provider["authHeader"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() == true,
                models = endpointModels,
            )
        }.sortedBy { it.id }

        return PiAgentConfigUi(
            providers = views,
            defaultProvider = settings["defaultProvider"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            defaultModel = settings["defaultModel"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            defaultThinkingLevel = settings["defaultThinkingLevel"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    private fun JsonElement.jsonObjectOrNull(): JsonObject? = (this as? JsonObject)

    private fun readJson(file: File, fallback: JsonObject): JsonObject {
        if (!file.isFile) return fallback
        return try {
            json.parseToJsonElement(file.readBoundedUtf8(maxFileBytes)).jsonObject
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.warn { "无法解析 Pi 配置文件 ${file.name}: ${error.message}" }
            fallback
        }
    }

    private suspend fun File.atomicWrite(content: JsonObject) = withContext(Dispatchers.IO) {
        parentFile?.mkdirs()
        atomicWriteText(json.encodeToString(content).requireUtf8Size(maxFileBytes, "Pi agent config"))
    }

    private companion object {
        const val MODELS_FILE = "models.json"
        const val AUTH_FILE = "auth.json"
        const val SETTINGS_FILE = "settings.json"
    }
}
