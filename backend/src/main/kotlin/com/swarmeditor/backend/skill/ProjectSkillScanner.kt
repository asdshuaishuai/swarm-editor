package com.swarmeditor.backend.skill

import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val log = KotlinLogging.logger {}

data class ProjectSkillSnapshot(
    val fingerprint: String,
    val skills: List<SkillConfig>,
)

class ProjectSkillScanner(
    private val maxMetadataBytes: Long = 2L * 1024 * 1024,
) {
    init {
        require(maxMetadataBytes > 0) { "maxMetadataBytes must be positive" }
    }

    suspend fun scan(projectRoot: File): ProjectSkillSnapshot = withContext(Dispatchers.IO) {
        val root = projectRoot.toPath().toRealPath()
        val skillsByName = linkedMapOf<String, SkillConfig>()
        val fingerprintFiles = mutableListOf<Pair<String, Path>>()

        PROJECT_ROOTS.forEach { skillRoot ->
            val rootDirectory = root.resolve(skillRoot.relativePath).normalize()
            if (!rootDirectory.startsWith(root) || !Files.isDirectory(rootDirectory) || Files.isSymbolicLink(rootDirectory)) {
                return@forEach
            }
            discoverSkillDirectories(rootDirectory, root).forEach { directory ->
                val definition = directory.resolve("SKILL.md")
                val relativeDirectory = root.relativize(directory).toString().replace(File.separatorChar, '/')
                fingerprintFiles += relativeDirectory to directory
                try {
                    val metadata = readSkillMetadata(definition, directory.fileName.toString())
                    skillsByName.putIfAbsent(
                        metadata.name,
                        SkillConfig(
                            id = "project:${skillRoot.id}:${metadata.name}",
                            name = metadata.name,
                            description = metadata.description,
                            source = SkillSource.PROJECT_FILESYSTEM,
                            scope = "project:${root.toString()}",
                            path = directory.toFile().absolutePath,
                            tags = listOf(PROJECT_SKILL_TAG, "source:${skillRoot.id}"),
                            files = listSkillFiles(directory, root),
                            contentFingerprint = fingerprint(directory, listOf(relativeDirectory to directory)),
                        ),
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    log.warn { "Failed to scan project skill ${directory}: ${error.message}" }
                }
            }
        }

        ProjectSkillSnapshot(
            fingerprint = fingerprint(root, fingerprintFiles),
            skills = skillsByName.values.toList(),
        )
    }

    private fun discoverSkillDirectories(root: Path, projectRoot: Path): List<Path> {
        val discovered = mutableListOf<Path>()
        val pending = ArrayDeque<Pair<Path, Int>>()
        val visited = mutableSetOf<Path>()
        pending += root to 0
        while (pending.isNotEmpty()) {
            val (directory, depth) = pending.removeFirst()
            val normalized = directory.toAbsolutePath().normalize()
            if (!normalized.startsWith(projectRoot) || !visited.add(normalized)) continue
            if (Files.isSymbolicLink(normalized)) continue
            if (Files.isRegularFile(normalized.resolve("SKILL.md"))) {
                discovered.add(normalized)
                continue
            }
            if (depth >= MAX_SKILL_DEPTH) continue
            Files.list(normalized).use { entries ->
                entries.sorted().forEach { child ->
                    if (Files.isDirectory(child) && !Files.isSymbolicLink(child)) {
                        pending += child to depth + 1
                    }
                }
            }
        }
        return discovered
    }

    private fun listSkillFiles(skillDirectory: Path, projectRoot: Path): List<String> {
        val files = mutableListOf<String>()
        Files.walk(skillDirectory).use { paths ->
            paths.filter { path ->
                path != skillDirectory &&
                    !Files.isSymbolicLink(path) &&
                    Files.isRegularFile(path) &&
                    path.toAbsolutePath().normalize().startsWith(projectRoot)
            }.sorted().forEach { path ->
                if (files.size < MAX_SKILL_FILES) {
                    files += skillDirectory.relativize(path).toString().replace(File.separatorChar, '/')
                }
            }
        }
        return files
    }

    private fun readSkillMetadata(definition: Path, fallbackName: String): SkillMetadata {
        val lines = definition.toFile().readBoundedUtf8(maxMetadataBytes)
            .lineSequence()
            .take(MAX_SKILL_METADATA_LINES)
            .toList()
        val frontmatter = if (lines.firstOrNull()?.trim() == "---") {
            lines.drop(1).takeWhile { it.trim() != "---" }
        } else {
            emptyList()
        }
        val values = frontmatter.mapNotNull { line ->
            val separator = line.indexOf(':')
            if (separator <= 0) return@mapNotNull null
            line.substring(0, separator).trim() to line.substring(separator + 1).trim().trim('"', '\'')
        }.toMap()
        val name = values["name"]?.takeIf(String::isNotBlank) ?: fallbackName
        val description = values["description"]?.takeIf(String::isNotBlank)
            ?: lines.dropWhile { it.trim() == "---" || it.contains(':') || it.isBlank() || it.startsWith("#") }
                .firstOrNull()
                ?.trim()
                .orEmpty()
        return SkillMetadata(name, description)
    }

    private fun fingerprint(projectRoot: Path, directories: List<Pair<String, Path>>): String {
        val digest = MessageDigest.getInstance("SHA-256")
        directories.sortedBy { it.first }.forEach { (relativeDirectory, directory) ->
            digest.update(relativeDirectory.toByteArray(Charsets.UTF_8))
            digest.update(0)
            Files.walk(directory).use { paths ->
                paths.filter { path ->
                    !Files.isSymbolicLink(path) &&
                        Files.isRegularFile(path) &&
                        path.toAbsolutePath().normalize().startsWith(projectRoot)
                }.sorted().forEach { path ->
                    digest.update(directory.relativize(path).toString().replace(File.separatorChar, '/').toByteArray())
                    digest.update(0)
                    Files.newInputStream(path).use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            digest.update(buffer, 0, count)
                        }
                    }
                    digest.update(0)
                }
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

    private data class SkillMetadata(val name: String, val description: String)

    private companion object {
        const val MAX_SKILL_FILES = 200
        const val MAX_SKILL_DEPTH = 5
        const val MAX_SKILL_METADATA_LINES = 80
        const val PROJECT_SKILL_TAG = "discovered:project"
        val PROJECT_ROOTS = listOf(
            ProjectSkillRoot("claude", ".claude/skills"),
            ProjectSkillRoot("github", ".github/skills"),
            ProjectSkillRoot("gemini", ".gemini/skills"),
            ProjectSkillRoot("pi", ".pi/agent/skills"),
            ProjectSkillRoot("agents", ".agents/skills"),
        )
    }
}

private data class ProjectSkillRoot(val id: String, val relativePath: String)
