package com.swarmeditor.backend.agent

import com.swarmeditor.backend.agent.adapter.ClaudeCodeAdapter
import com.swarmeditor.backend.agent.adapter.GeminiCliAdapter
import com.swarmeditor.backend.agent.adapter.KimiCodeAdapter
import com.swarmeditor.backend.agent.adapter.OpenCodeAdapter
import com.swarmeditor.backend.agent.adapter.QwenCodeAdapter
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.AgentType
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

/**
 * Agent 注册表 — 管理所有 Agent 配置和适配器。
 */
class AgentRegistry {
    private val adapters = mutableMapOf<AgentType, AgentAdapter>()
    private val configs = mutableMapOf<String, AgentConfig>()
    private val statuses = mutableMapOf<String, AgentStatus>()
    private val versions = mutableMapOf<String, String>()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    private val configPath = File(System.getProperty("user.home"), ".swarm-editor/agents.json")

    init {
        registerAdapter(ClaudeCodeAdapter())
        registerAdapter(QwenCodeAdapter())
        registerAdapter(GeminiCliAdapter())
        registerAdapter(KimiCodeAdapter())
        registerAdapter(OpenCodeAdapter())
    }

    fun registerAdapter(adapter: AgentAdapter) {
        adapters[adapter.agentType] = adapter
    }

    fun getAdapter(agentType: AgentType): AgentAdapter? = adapters[agentType]

    fun getAllAdapters(): List<AgentAdapter> = adapters.values.toList()

    /**
     * 扫描 PATH 中的 Agent CLI。
     */
    suspend fun scan(): List<AgentRuntimeInfo> = withContext(Dispatchers.IO) {
        adapters.values.map { adapter ->
            val version = adapter.detect()
            val isInstalled = version != null
            val id = adapter.agentType.name.lowercase().replace("_", "-")

            if (isInstalled && !configs.containsKey(id)) {
                // 自动注册已安装的 Agent
                val config = AgentConfig(
                    id = id,
                    name = adapter.displayName,
                    command = adapter.acpCommand.first(),
                    args = adapter.acpCommand.drop(1),
                    agentType = adapter.agentType,
                    enabled = true
                )
                configs[id] = config
                versions[id] = version
                statuses[id] = AgentStatus.DISCONNECTED
            }

            AgentRuntimeInfo(
                config = configs[id] ?: AgentConfig(
                    id = id,
                    name = adapter.displayName,
                    command = adapter.acpCommand.first(),
                    args = adapter.acpCommand.drop(1),
                    agentType = adapter.agentType,
                    enabled = false
                ),
                status = statuses[id] ?: AgentStatus.DISCONNECTED,
                version = version ?: ""
            )
        }
    }

    fun getConfig(agentId: String): AgentConfig? = configs[agentId]

    fun getAllConfigs(): List<AgentConfig> = configs.values.toList()

    fun updateStatus(agentId: String, status: AgentStatus) {
        statuses[agentId] = status
    }

    fun getStatus(agentId: String): AgentStatus = statuses[agentId] ?: AgentStatus.DISCONNECTED

    fun getVersion(agentId: String): String = versions[agentId] ?: ""

    /**
     * 持久化配置到 ~/.swarm-editor/agents.json。
     */
    suspend fun save() = withContext(Dispatchers.IO) {
        try {
            configPath.parentFile.mkdirs()
            val wrapper = AgentsFileWrapper(agents = configs.values.toList())
            configPath.writeText(json.encodeToString(AgentsFileWrapper.serializer(), wrapper))
        } catch (e: Exception) {
            log.error { "Failed to save agents config: ${e.message}" }
        }
    }

    /**
     * 从 ~/.swarm-editor/agents.json 加载配置。
     */
    suspend fun load() = withContext(Dispatchers.IO) {
        try {
            if (!configPath.exists()) return@withContext
            val wrapper = json.decodeFromString(AgentsFileWrapper.serializer(), configPath.readText())
            wrapper.agents.forEach { config ->
                configs[config.id] = config
                statuses[config.id] = AgentStatus.DISCONNECTED
            }
        } catch (e: Exception) {
            log.warn { "Failed to load agents config: ${e.message}" }
        }
    }
}

@kotlinx.serialization.Serializable
private data class AgentsFileWrapper(
    val agents: List<AgentConfig> = emptyList()
)
