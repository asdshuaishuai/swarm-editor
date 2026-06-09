package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.skill.SyncMethod
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.SkillConfig
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.file.Files

private val log = KotlinLogging.logger {}

class SkillService(
    private val store: SkillStore,
    private val scanner: SkillScanner,
    private val adapterResolver: (AgentType) -> AgentAdapter? = { null }
) {
    private val _skills = MutableStateFlow<List<SkillConfig>>(emptyList())
    val skills: StateFlow<List<SkillConfig>> = _skills

    suspend fun init() { store.load(); refresh() }
    suspend fun scan() { scanner.scanGlobal().forEach { store.upsert(it) }; refresh() }
    suspend fun getAll() = store.getAll()
    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean) { store.toggleAgent(id, agentId, enabled); refresh() }
    private suspend fun refresh() { _skills.value = store.getAll() }

    suspend fun syncSkillsToAgent(
        agentType: AgentType,
        skillNames: List<String>,
        method: SyncMethod = SyncMethod.Auto
    ) {
        val adapter = adapterResolver(agentType) ?: run {
            log.warn { "No adapter found for $agentType" }
            return
        }
        withContext(Dispatchers.IO) {
            try {
                val agentDir = File(adapter.skillsDirectory)
                if (!agentDir.exists()) agentDir.mkdirs()

                val globalDir = File(System.getProperty("user.home"), ".swarm-editor/skills")

                agentDir.listFiles { f -> Files.isSymbolicLink(f.toPath()) }?.forEach { link ->
                    if (!link.exists() || !skillNames.contains(link.name)) {
                        link.delete()
                    }
                }

                agentDir.listFiles { f -> f.isDirectory && !Files.isSymbolicLink(f.toPath()) }?.forEach { dir ->
                    if (!skillNames.contains(dir.name)) {
                        dir.deleteRecursively()
                    }
                }

                skillNames.forEach { name ->
                    val target = File(globalDir, name)
                    val link = File(agentDir, name)
                    if (!target.exists()) return@forEach
                    if (link.exists()) return@forEach

                    when (method) {
                        SyncMethod.Copy -> copyRecursively(target, link)
                        SyncMethod.Symlink -> Files.createSymbolicLink(link.toPath(), target.toPath())
                        SyncMethod.Auto -> {
                            try {
                                Files.createSymbolicLink(link.toPath(), target.toPath())
                            } catch (_: Exception) {
                                copyRecursively(target, link)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                log.error { "Failed to sync skills to $agentType: ${e.message}" }
            }
        }
    }

    suspend fun scanAgentSkills(agentType: AgentType): List<String> {
        val adapter = adapterResolver(agentType) ?: return emptyList()
        return withContext(Dispatchers.IO) {
            try {
                val dir = File(adapter.skillsDirectory)
                if (!dir.exists()) return@withContext emptyList()
                dir.listFiles { f -> f.isDirectory }?.map { it.name } ?: emptyList()
            } catch (e: Exception) {
                log.warn { "Failed to scan agent skills for $agentType: ${e.message}" }
                emptyList()
            }
        }
    }

    suspend fun applyProviderPreset(agentType: AgentType, presetName: String) {
        val adapter = adapterResolver(agentType) ?: run {
            log.warn { "No adapter found for $agentType" }
            return
        }
        val preset = adapter.providerPresets.find { it.name == presetName } ?: run {
            log.warn { "Preset '$presetName' not found for $agentType" }
            return
        }
        adapter.writeNativeConfigField("Base URL", preset.baseUrl)
        adapter.writeNativeConfigField("Model", preset.model)
    }
}

private fun copyRecursively(src: File, dest: File) {
    if (src.isDirectory) {
        dest.mkdirs()
        src.listFiles()?.forEach { child ->
            copyRecursively(child, File(dest, child.name))
        }
    } else {
        src.copyTo(dest)
    }
}
