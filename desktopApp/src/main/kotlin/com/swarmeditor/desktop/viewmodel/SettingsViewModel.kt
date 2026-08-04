package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.service.ModelService
import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

@androidx.compose.runtime.Immutable
data class ModelConfigField(
    val label: String,
    val value: String,
    val isSelect: Boolean = false,
    val options: List<String> = emptyList()
)

data class SettingsActionEvent(val message: String, val type: ToastType)

class SettingsViewModel(
    private val agentService: AgentService,
    private val mcpService: McpService,
    private val skillService: SkillService,
    private val scope: CoroutineScope,
    private val modelService: ModelService? = null,
) {
    private val _primaryModelId = MutableStateFlow("")
    val primaryModelId: StateFlow<String> = _primaryModelId
    private val _configPath = MutableStateFlow("")
    val configPath: StateFlow<String> = _configPath
    private val eventChannel = Channel<SettingsActionEvent>(Channel.BUFFERED)
    val events = eventChannel.receiveAsFlow()
    private var loadAgentJob: Job? = null
    private val _selectedModelId = MutableStateFlow(ModelRegistry.DEFAULT_MODEL_ID)
    val selectedModelId: StateFlow<String> = _selectedModelId
    private val _modelConfigFields = MutableStateFlow<List<ModelConfigField>>(emptyList())
    val modelConfigFields: StateFlow<List<ModelConfigField>> = _modelConfigFields
    private val _modelConfigPath = MutableStateFlow(ConfigPaths.MODELS_JSON)
    val modelConfigPath: StateFlow<String> = _modelConfigPath
    private var loadModelJob: Job? = null
    private val modelSelectionRequests = AtomicLong()

    val mcpServers: StateFlow<List<McpServerDto>> = mcpService.servers
        .map { servers -> servers.map { it.toDto() } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())
    val skills: StateFlow<List<SkillDto>> = skillService.skills
        .map { skills -> skills.map { it.toDto() } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())
    val models: StateFlow<List<ModelConfig>> = modelService?.models
        ?: MutableStateFlow(emptyList())

    init {
        refreshPrimaryAgentConfig()
        selectModel(ModelRegistry.DEFAULT_MODEL_ID)
    }

    fun refreshPrimaryAgentConfig() {
        _configPath.value = ""
        _primaryModelId.value = ""
        loadAgentJob?.cancel()
        loadAgentJob = scope.launch {
            loadPrimaryAgentFields()
        }
    }

    fun setPrimaryModel(modelConfigId: String) {
        val normalizedModelConfigId = modelConfigId.trim()
        if (normalizedModelConfigId.isEmpty()) return
        scope.launch {
            runAction("主智能体配置已保存", "主智能体配置保存失败") {
                val config = agentService.getConfig(AgentRegistry.DEFAULT_AGENT_ID) ?: AgentRegistry.defaultConfig()
                agentService.upsert(config.copy(modelConfigId = normalizedModelConfigId)).getOrThrow()
                loadPrimaryAgentFields()
            }
        }
    }

    private suspend fun loadPrimaryAgentFields() {
        val config = agentService.getConfig(AgentRegistry.DEFAULT_AGENT_ID) ?: AgentRegistry.defaultConfig()
        _configPath.value = ConfigPaths.AGENTS_JSON
        _primaryModelId.value = config.modelConfigId
    }

    fun selectModel(id: String) {
        val requestId = modelSelectionRequests.incrementAndGet()
        _selectedModelId.value = id
        _modelConfigFields.value = emptyList()
        loadModelJob?.cancel()
        loadModelJob = scope.launch { loadModelFields(id, requestId) }
    }

    fun saveModelField(key: String, value: String) {
        val service = modelService ?: return
        val modelId = _selectedModelId.value
        scope.launch {
            runAction("模型配置已保存", "模型配置保存失败") {
                val config = service.get(modelId) ?: ModelRegistry.defaultConfig().copy(id = modelId)
                service.upsert(config.updatedWith(mapOf(key to value))).getOrThrow()
                if (_selectedModelId.value == modelId) loadModelFields(modelId, modelSelectionRequests.get())
            }
        }
    }

    fun createModelConfig() {
        val service = modelService ?: return
        scope.launch {
            runAction("模型配置已创建", "模型配置创建失败") {
                val created = service.create(_selectedModelId.value).getOrThrow()
                selectModel(created.id)
            }
        }
    }

    fun deleteSelectedModelConfig() {
        val service = modelService ?: return
        val modelId = _selectedModelId.value
        scope.launch {
            runAction("模型配置已删除", "模型配置删除失败") {
                service.delete(modelId).getOrThrow()
                selectModel(service.models.value.firstOrNull()?.id ?: ModelRegistry.DEFAULT_MODEL_ID)
            }
        }
    }

    private suspend fun loadModelFields(id: String, requestId: Long) {
        val config = modelService?.get(id) ?: return
        if (requestId != modelSelectionRequests.get() || _selectedModelId.value != id) return
        _modelConfigFields.value = listOf(
            ModelConfigField("Name", config.name),
            ModelConfigField(
                label = "Enabled",
                value = config.enabled.toString(),
                isSelect = true,
                options = listOf("true", "false"),
            ),
            ModelConfigField("Provider", config.provider),
            ModelConfigField("Model", config.model),
            ModelConfigField(
                label = "Thinking",
                value = config.thinkingLevel.name.lowercase(),
                isSelect = true,
                options = AgentThinkingLevel.entries.map { it.name.lowercase() },
            ),
            ModelConfigField("Environment", config.env.entries.sortedBy { it.key }.joinToString("; ") { "${it.key}=${it.value}" }),
            ModelConfigField("Priority", config.priority.toString()),
            ModelConfigField("Roles", config.roles.joinToString(", ") { it.name.lowercase() }),
            ModelConfigField("Max Concurrent Agents", config.maxConcurrentAgents.toString()),
        )
    }

    fun scanSkills() {
        scope.launch {
            runResultAction("Skills 扫描完成", "Skills 扫描失败") { skillService.scan() }
        }
    }

    fun addMcpServer(name: String, command: String) {
        scope.launch {
            runResultAction("MCP 配置已保存", "MCP 配置保存失败") {
                mcpService.upsert(
                    McpServerDto(
                        id = UUID.randomUUID().toString(),
                        name = name,
                        command = command
                    ).toConfig()
                )
            }
        }
    }

    fun upsertMcpServer(server: McpServerDto) {
        scope.launch {
            runResultAction("MCP 配置已保存", "MCP 配置保存失败") { mcpService.upsert(server.toConfig()) }
        }
    }

    fun deleteMcpServer(id: String) {
        scope.launch {
            runResultAction("MCP 服务已删除", "MCP 服务删除失败", ToastType.INFO) { mcpService.delete(id) }
        }
    }

    private suspend fun runAction(
        successMessage: String,
        failureMessage: String,
        successType: ToastType = ToastType.SUCCESS,
        action: suspend () -> Unit
    ) {
        try {
            action()
            eventChannel.send(SettingsActionEvent(successMessage, successType))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            eventChannel.send(SettingsActionEvent(error.message ?: failureMessage, ToastType.ERROR))
        }
    }

    private suspend fun runResultAction(
        successMessage: String,
        failureMessage: String,
        successType: ToastType = ToastType.SUCCESS,
        action: suspend () -> Result<Unit>
    ) {
        try {
            action().fold(
                onSuccess = { eventChannel.send(SettingsActionEvent(successMessage, successType)) },
                onFailure = { eventChannel.send(SettingsActionEvent(it.message ?: failureMessage, ToastType.ERROR)) }
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            eventChannel.send(SettingsActionEvent(error.message ?: failureMessage, ToastType.ERROR))
        }
    }

    fun toggleMcpAgent(serverId: String, agentId: String, enabled: Boolean) {
        scope.launch {
            val server = mcpService.servers.value.find { it.id == serverId } ?: return@launch
            val agentIds = agentService.agents.value.map { it.config.id }
            runResultAction("MCP 授权已更新", "MCP 授权更新失败") {
                mcpService.upsert(
                    server.copy(
                        enabledAgents = server.enabledAgents.updatedAgentAccess(agentIds, agentId, enabled)
                    )
                )
            }
        }
    }

    fun toggleSkillAgent(skillId: String, agentId: String, enabled: Boolean) {
        scope.launch {
            runResultAction("Skill 授权已更新", "Skill 授权更新失败") {
                skillService.toggleAgent(skillId, agentId, enabled)
            }
        }
    }
}

internal fun Map<String, Boolean>.updatedAgentAccess(
    agentIds: List<String>,
    agentId: String,
    enabled: Boolean,
): Map<String, Boolean> {
    val updated = if (isEmpty()) {
        agentIds.associateWith { true }.toMutableMap()
    } else {
        toMutableMap()
    }
    updated[agentId] = enabled
    return if (agentIds.isNotEmpty() && agentIds.all { updated[it] == true }) emptyMap() else updated
}

internal fun ModelConfig.updatedWith(fields: Map<String, String>): ModelConfig = copy(
    name = fields["Name"]?.trim().orEmpty().ifBlank { name },
    enabled = fields["Enabled"]?.toBooleanStrictOrNull() ?: enabled,
    provider = fields["Provider"]?.trim() ?: provider,
    model = fields["Model"]?.trim() ?: model,
    thinkingLevel = fields["Thinking"]
        ?.uppercase()
        ?.let { value -> AgentThinkingLevel.entries.find { it.name == value } }
        ?: thinkingLevel,
    env = fields["Environment"]?.let(::parseAgentEnvironment) ?: env,
    priority = fields["Priority"]?.toIntOrNull()?.coerceIn(0, 1000) ?: priority,
    roles = fields["Roles"]
        ?.split(',')
        ?.map(String::trim)
        ?.filter(String::isNotBlank)
        ?.map { role -> SwarmAgentRole.valueOf(role.uppercase()) }
        ?.distinct()
        ?: roles,
    maxConcurrentAgents = fields["Max Concurrent Agents"]?.toIntOrNull()?.coerceIn(1, 64)
        ?: maxConcurrentAgents,
)

internal fun parseAgentEnvironment(value: String): Map<String, String> = value
    .split(';', '\n')
    .map(String::trim)
    .filter(String::isNotBlank)
    .associate { entry ->
        val separator = entry.indexOf('=')
        require(separator > 0) { "环境变量必须使用 KEY=VALUE 格式: $entry" }
        entry.substring(0, separator).trim() to entry.substring(separator + 1).trim()
    }
