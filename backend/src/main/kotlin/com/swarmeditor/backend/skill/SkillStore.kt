package com.swarmeditor.backend.skill

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.agent.piProfileAccess
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlinx.coroutines.CancellationException

private val log = KotlinLogging.logger {}

@Serializable
private data class SkillsFile(val skills: List<SkillFile> = emptyList())

@Serializable
private data class SkillFile(
    val id: String, val name: String, val description: String = "",
    val source: String = "filesystem", val scope: String = "global",
    val path: String = "", val agentId: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(), val tags: List<String> = emptyList(),
    val files: List<String> = emptyList()
)

class SkillStore(
    private val file: File,
    private val maxFileBytes: Long = 8L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val skills = mutableMapOf<String, SkillConfig>()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            mutex.withLock { skills.clear() }
            return@withContext
        }
        val decoded = try {
            val sf = json.decodeFromString(SkillsFile.serializer(), file.readBoundedUtf8(maxFileBytes))
            val loaded = sf.skills.map { it.toConfig().normalizedForPi() }
            sf to loaded
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val quarantined = try {
                file.quarantineCorruptFile()
            } catch (quarantineError: Exception) {
                quarantineError.addSuppressed(error)
                throw quarantineError
            }
            log.warn { "Quarantined unreadable skill configuration to ${quarantined.name}: ${error.message}" }
            return@withContext
        }
        val (sf, loaded) = decoded
        mutex.withLock {
            skills.clear()
            loaded.forEach { skill -> skills[skill.id] = skill }
        }
        if (sf.skills.map { it.agentId to it.enabledAgents } != loaded.map { it.agentId to it.enabledAgents }) save()
        log.info { "Loaded ${skills.size} skills" }
    }

    suspend fun getAll(): List<SkillConfig> = mutex.withLock { skills.values.toList() }

    suspend fun upsert(config: SkillConfig) = mutex.withLock {
        val normalized = config.normalizedForPi()
        val previous = skills.put(normalized.id, normalized)
        try {
            save()
        } catch (error: Throwable) {
            if (previous == null) skills.remove(config.id) else skills[config.id] = previous
            throw error
        }
    }

    suspend fun synchronizeFilesystem(scanned: List<SkillConfig>) = mutex.withLock {
        val previous = skills.toMap()
        skills.entries.removeIf { it.value.source == SkillSource.FILESYSTEM }
        scanned.forEach { skill ->
            skills[skill.id] = skill.copy(
                enabledAgents = previous[skill.id]?.enabledAgents ?: skill.enabledAgents
            ).normalizedForPi()
        }
        try {
            save()
        } catch (error: Throwable) {
            skills.clear()
            skills.putAll(previous)
            throw error
        }
    }

    suspend fun delete(id: String) = mutex.withLock {
        val previous = skills.remove(id)
        try {
            save()
        } catch (error: Throwable) {
            if (previous != null) skills[id] = previous
            throw error
        }
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try {
            val content = json.encodeToString(
                SkillsFile.serializer(),
                SkillsFile(skills.values.map { it.toFile() }),
            ).requireUtf8Size(maxFileBytes, "Skill configuration")
            file.atomicWriteText(content)
        } catch (error: Throwable) {
            log.error { "Failed to save skills: ${error.message}" }
            throw error
        }
    }
}

private fun SkillFile.toConfig() = SkillConfig(id=id, name=name, description=description,
    source=when(source){"mcp"->SkillSource.MCP else->SkillSource.FILESYSTEM}, scope=scope, path=path, agentId=agentId, enabledAgents=enabledAgents, tags=tags, files=files)

private fun SkillConfig.toFile() = SkillFile(id=id, name=name, description=description,
    source=source.name.lowercase(), scope=scope, path=path, agentId=agentId, enabledAgents=enabledAgents, tags=tags, files=files)

private fun SkillConfig.normalizedForPi() = copy(
    agentId = agentId.takeIf { it.isBlank() } ?: AgentRegistry.DEFAULT_AGENT_ID,
    enabledAgents = enabledAgents.piProfileAccess()
)
