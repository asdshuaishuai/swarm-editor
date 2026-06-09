package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
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
private data class SkillsFile(val skills: List<SkillFile> = emptyList())

@Serializable
private data class SkillFile(
    val id: String, val name: String, val description: String = "",
    val source: String = "filesystem", val scope: String = "global",
    val path: String = "", val agentId: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(), val tags: List<String> = emptyList()
)

class SkillStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val skills = mutableMapOf<String, SkillConfig>()

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext
        try {
            val sf = json.decodeFromString(SkillsFile.serializer(), file.readText())
            sf.skills.forEach { skills[it.id] = it.toConfig() }
            log.info { "Loaded ${skills.size} skills" }
        } catch (e: Exception) { log.warn { "Failed to load skills: ${e.message}" } }
    }

    suspend fun getAll(): List<SkillConfig> = mutex.withLock { skills.values.toList() }

    suspend fun upsert(config: SkillConfig) = mutex.withLock { skills[config.id] = config; save() }
    suspend fun delete(id: String) = mutex.withLock { skills.remove(id); save() }

    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean) = mutex.withLock {
        skills[id]?.let { s -> skills[id] = s.copy(enabledAgents = s.enabledAgents + (agentId to enabled)); save() }
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try { file.parentFile?.mkdirs(); file.writeText(json.encodeToString(SkillsFile.serializer(), SkillsFile(skills.values.map { it.toFile() }))) }
        catch (e: Exception) { log.error { "Failed to save skills: ${e.message}" } }
    }
}

private fun SkillFile.toConfig() = SkillConfig(id=id, name=name, description=description,
    source=when(source){"mcp"->SkillSource.MCP else->SkillSource.FILESYSTEM}, scope=scope, path=path, agentId=agentId, enabledAgents=enabledAgents, tags=tags)

private fun SkillConfig.toFile() = SkillFile(id=id, name=name, description=description,
    source=source.name.lowercase(), scope=scope, path=path, agentId=agentId, enabledAgents=enabledAgents, tags=tags)
