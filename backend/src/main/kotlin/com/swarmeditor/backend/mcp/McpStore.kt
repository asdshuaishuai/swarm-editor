package com.swarmeditor.backend.mcp

import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

@Serializable
private data class McpFile(val servers: Map<String, McpServerFile> = emptyMap())

@Serializable
private data class McpServerFile(
    val name: String, val type: String = "stdio", val command: String = "",
    val args: List<String> = emptyList(), val env: Map<String, String> = emptyMap(),
    val url: String = "", val enabledAgents: Map<String, Boolean> = emptyMap(),
    val description: String = "", val tags: List<String> = emptyList()
)

class McpStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val servers = mutableMapOf<String, McpServerConfig>()

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext
        try {
            val mc = json.decodeFromString(McpFile.serializer(), file.readText())
            mc.servers.forEach { (id, s) -> servers[id] = s.toConfig(id) }
            log.info { "Loaded ${servers.size} MCP servers" }
        } catch (e: Exception) { log.warn { "Failed to load MCP: ${e.message}" } }
    }

    suspend fun getAll(): List<McpServerConfig> = mutex.withLock { servers.values.toList() }
    suspend fun get(id: String): McpServerConfig? = mutex.withLock { servers[id] }

    suspend fun upsert(config: McpServerConfig) = mutex.withLock { servers[config.id] = config; save() }
    suspend fun delete(id: String) = mutex.withLock { servers.remove(id); save() }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try { file.parentFile?.mkdirs(); file.writeText(json.encodeToString(McpFile.serializer(), McpFile(servers.mapValues { (_, s) -> s.toFile() }))) }
        catch (e: Exception) { log.error { "Failed to save MCP: ${e.message}" } }
    }
}

private fun McpServerFile.toConfig(id: String) = McpServerConfig(id = id, name = name, type = when(type){"http"->McpServerType.HTTP else->McpServerType.STDIO},
    command = command, args = args, env = env, url = url, enabledAgents = enabledAgents, description = description, tags = tags)

private fun McpServerConfig.toFile() = McpServerFile(name = name, type = type.name.lowercase(), command = command, args = args, env = env,
    url = url, enabledAgents = enabledAgents, description = description, tags = tags)
