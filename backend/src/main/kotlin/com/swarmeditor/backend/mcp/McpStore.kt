package com.swarmeditor.backend.mcp

import com.swarmeditor.backend.agent.piProfileAccess
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
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

@Serializable
private data class McpFile(val servers: Map<String, McpServerFile> = emptyMap())

@Serializable
private data class McpServerFile(
    val name: String, val type: String = "stdio", val command: String = "",
    val args: List<String> = emptyList(), val env: Map<String, String> = emptyMap(),
    val url: String = "", val enabledAgents: Map<String, Boolean> = emptyMap(),
    val description: String = "", val tags: List<String> = emptyList(),
    val bearerTokenEnvVar: String = "", val headers: Map<String, String> = emptyMap(),
    val disabled: Boolean = false
)

class McpStore(
    private val file: File,
    private val maxFileBytes: Long = 8L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val servers = mutableMapOf<String, McpServerConfig>()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            mutex.withLock { servers.clear() }
            return@withContext
        }
        val decoded = try {
            val mc = json.decodeFromString(McpFile.serializer(), file.readBoundedUtf8(maxFileBytes))
            val loaded = mc.servers.mapValues { (id, server) -> server.toConfig(id).normalizedForPi() }
            mc to loaded
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val quarantined = try {
                file.quarantineCorruptFile()
            } catch (quarantineError: Exception) {
                quarantineError.addSuppressed(error)
                throw quarantineError
            }
            log.warn { "Quarantined unreadable MCP configuration to ${quarantined.name}: ${error.message}" }
            return@withContext
        }
        val (mc, loaded) = decoded
        mutex.withLock {
            servers.clear()
            servers.putAll(loaded)
        }
        if (mc.servers.values.map { it.enabledAgents } != loaded.values.map { it.enabledAgents }) save()
        log.info { "Loaded ${servers.size} MCP servers" }
    }

    suspend fun getAll(): List<McpServerConfig> = mutex.withLock { servers.values.toList() }
    suspend fun get(id: String): McpServerConfig? = mutex.withLock { servers[id] }

    suspend fun upsert(config: McpServerConfig) = mutex.withLock {
        val normalized = config.normalizedForPi()
        val previous = servers.put(normalized.id, normalized)
        try {
            save()
        } catch (error: Throwable) {
            if (previous == null) servers.remove(config.id) else servers[config.id] = previous
            throw error
        }
    }

    suspend fun delete(id: String) = mutex.withLock {
        val previous = servers.remove(id)
        try {
            save()
        } catch (error: Throwable) {
            if (previous != null) servers[id] = previous
            throw error
        }
    }

    suspend fun synchronizeDiscovered(discovered: List<McpServerConfig>) = mutex.withLock {
        val previous = servers.toMap()
        val manualKeys = servers.values
            .filterNot { USER_MCP_TAG in it.tags }
            .mapTo(mutableSetOf(), McpServerConfig::connectionKey)
        servers.entries.removeIf { USER_MCP_TAG in it.value.tags }
        discovered.forEach { candidate ->
            if (candidate.connectionKey() in manualKeys) return@forEach
            val existing = previous[candidate.id]
            servers[candidate.id] = candidate.copy(
                enabledAgents = existing?.enabledAgents ?: candidate.enabledAgents,
                disabled = existing?.disabled ?: candidate.disabled,
            ).normalizedForPi()
        }
        try {
            save()
        } catch (error: Throwable) {
            servers.clear()
            servers.putAll(previous)
            throw error
        }
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try {
            val content = json.encodeToString(
                McpFile.serializer(),
                McpFile(servers.mapValues { (_, server) -> server.toFile() }),
            ).requireUtf8Size(maxFileBytes, "MCP configuration")
            file.atomicWriteText(content)
        } catch (error: Throwable) {
            log.error { "Failed to save MCP: ${error.message}" }
            throw error
        }
    }
}
private fun McpServerFile.toConfig(id: String) = McpServerConfig(id = id, name = name, type = when(type){"http"->McpServerType.HTTP else->McpServerType.STDIO},
    command = command, args = args, env = env, url = url, enabledAgents = enabledAgents, description = description, tags = tags,
    bearerTokenEnvVar = bearerTokenEnvVar, headers = headers, disabled = disabled)
private fun McpServerConfig.toFile() = McpServerFile(name = name, type = type.name.lowercase(), command = command, args = args, env = env,
    url = url, enabledAgents = enabledAgents, description = description, tags = tags,
    bearerTokenEnvVar = bearerTokenEnvVar, headers = headers, disabled = disabled)

private fun McpServerConfig.normalizedForPi() = copy(enabledAgents = enabledAgents.piProfileAccess())
