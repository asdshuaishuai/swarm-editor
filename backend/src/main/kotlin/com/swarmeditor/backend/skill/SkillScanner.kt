package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

private val log = KotlinLogging.logger {}

class SkillScanner {
    private val globalPaths = listOf(
        File(System.getProperty("user.home"), ".claude/skills"),
        File(System.getProperty("user.home"), ".swarm-editor/skills"),
        File(System.getProperty("user.home"), ".kimi/skills"),
        File(System.getProperty("user.home"), ".qwen/skills"),
        File(System.getProperty("user.home"), ".config/opencode/skills"),
    )

    suspend fun scanGlobal(): List<SkillConfig> = withContext(Dispatchers.IO) {
        val skills = mutableListOf<SkillConfig>()
        globalPaths.forEach { dir ->
            if (!dir.exists()) return@forEach
            dir.listFiles()?.forEach { entry ->
                if (entry.isDirectory) {
                    val skillMd = File(entry, "SKILL.md")
                    if (skillMd.exists()) {
                        val desc = skillMd.readLines().dropWhile { it.startsWith("#") || it.isBlank() }.firstOrNull()?.trim() ?: ""
                        skills.add(SkillConfig(id = "fs:${entry.name}", name = entry.name, description = desc, source = SkillSource.FILESYSTEM, scope = "global", path = entry.absolutePath))
                    }
                } else if (entry.extension in listOf("sh", "py", "js", "ts")) {
                    skills.add(SkillConfig(id = "fs:${entry.nameWithoutExtension}", name = entry.nameWithoutExtension, description = "Script: ${entry.name}", source = SkillSource.FILESYSTEM, scope = "global", path = entry.absolutePath))
                }
            }
        }
        log.info { "Scanned ${skills.size} global skills" }
        skills
    }
}
