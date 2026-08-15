package com.swarmeditor.backend.skill

import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.nio.file.Path
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val log = KotlinLogging.logger {}

data class UserSkillRoot(
    val id: String,
    val directory: File,
)

class SkillScanner(
    private val globalPaths: List<File> = defaultUserSkillRoots().map(UserSkillRoot::directory),
    private val roots: List<UserSkillRoot> = globalPaths.mapIndexed { index, directory ->
        UserSkillRoot(defaultRootId(directory, index), directory)
    },
    private val maxMetadataBytes: Long = 2L * 1024 * 1024,
) {
    init {
        require(maxMetadataBytes > 0) { "maxMetadataBytes must be positive" }
    }

    suspend fun scanGlobal(): List<SkillConfig> = withContext(Dispatchers.IO) {
        val skillsByName = linkedMapOf<String, SkillConfig>()
        roots.forEach { root ->
            val rootBoundary = root.directory.canonicalPathOrNull() ?: return@forEach
            discoverSkillDirectories(root.directory, rootBoundary).forEach { directory ->
                try {
                    val definition = File(directory, "SKILL.md")
                    require(definition.isFile && definition.isWithin(rootBoundary)) {
                        "Skill definition escapes root: ${definition.path}"
                    }
                    val metadata = readSkillMetadata(definition, directory.name, maxMetadataBytes)
                    val files = listSkillFiles(directory, rootBoundary)
                    skillsByName.putIfAbsent(
                        metadata.name,
                        SkillConfig(
                            id = "fs:${metadata.name}",
                            name = metadata.name,
                            description = metadata.description,
                            source = SkillSource.FILESYSTEM,
                            scope = "user:${root.id}",
                            path = directory.absolutePath,
                            tags = listOf(USER_SKILL_TAG, "source:${root.id}"),
                            files = files,
                            contentFingerprint = fingerprint(directory, rootBoundary),
                        )
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    log.warn { "Failed to scan skill ${directory.path}: ${error.message}" }
                }
            }
        }
        log.info { "Scanned ${skillsByName.size} user skills from ${roots.size} roots" }
        skillsByName.values.toList()
    }
}

fun defaultUserSkillRoots(homeDirectory: File = File(System.getProperty("user.home"))): List<UserSkillRoot> = listOf(
    UserSkillRoot("swarm", File(homeDirectory, ".swarm-editor/skills")),
    UserSkillRoot("agents", File(homeDirectory, ".agents/skills")),
    UserSkillRoot("pi", File(homeDirectory, ".pi/agent/skills")),
    UserSkillRoot("claude", File(homeDirectory, ".claude/skills")),
    UserSkillRoot("codex", File(homeDirectory, ".codex/skills")),
    UserSkillRoot("gemini", File(homeDirectory, ".gemini/skills")),
)

private data class SkillMetadata(val name: String, val description: String)

private fun discoverSkillDirectories(root: File, rootBoundary: Path): List<File> {
    if (!root.isDirectory) return emptyList()
    val discovered = mutableListOf<File>()
    val pending = ArrayDeque<Pair<File, Int>>()
    val visited = mutableSetOf<String>()
    pending.add(root to 0)
    while (pending.isNotEmpty()) {
        val (directory, depth) = pending.removeFirst()
        val canonicalPath = directory.canonicalPathOrNull() ?: continue
        if (!canonicalPath.startsWith(rootBoundary) || !visited.add(canonicalPath.toString())) continue
        if (File(directory, "SKILL.md").isFile) {
            discovered += directory
            continue
        }
        if (depth >= MAX_SKILL_DEPTH) continue
        directory.listFiles()
            ?.asSequence()
            ?.filter(File::isDirectory)
            ?.filterNot { it.name == "node_modules" || it.name == ".git" }
            ?.sortedBy { it.name }
            ?.forEach { child -> pending.add(child to depth + 1) }
    }
    return discovered
}

private fun listSkillFiles(skillDirectory: File, rootBoundary: Path): List<String> {
    val files = mutableListOf<String>()
    val pending = ArrayDeque<Pair<File, Int>>()
    val visited = mutableSetOf<String>()
    skillDirectory.canonicalPathOrNull()?.let { visited += it.toString() }
    pending.add(skillDirectory to 0)
    while (pending.isNotEmpty() && files.size < MAX_SKILL_FILES) {
        val (directory, depth) = pending.removeFirst()
        directory.listFiles()
            ?.sortedBy(File::getName)
            ?.forEach { child ->
                if (files.size >= MAX_SKILL_FILES) return@forEach
                val isDirectory = child.isDirectory
                files += child.relativeTo(skillDirectory).invariantSeparatorsPath + if (isDirectory) "/" else ""
                if (!isDirectory || depth >= MAX_SKILL_FILE_DEPTH) return@forEach
                val canonicalPath = child.canonicalPathOrNull() ?: return@forEach
                if (canonicalPath.startsWith(rootBoundary) && visited.add(canonicalPath.toString())) {
                    pending.add(child to depth + 1)
                }
            }
    }
    return files
}

private fun fingerprint(skillDirectory: File, rootBoundary: Path): String {
    val digest = MessageDigest.getInstance("SHA-256")
    skillDirectory.walkTopDown()
        .filter(File::isFile)
        .filter { file -> file.canonicalPathOrNull()?.startsWith(rootBoundary) == true }
        .sortedBy { file -> file.relativeTo(skillDirectory).invariantSeparatorsPath }
        .forEach { file ->
            digest.update(file.relativeTo(skillDirectory).invariantSeparatorsPath.toByteArray(Charsets.UTF_8))
            digest.update(0)
            file.inputStream().use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
        }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private fun readSkillMetadata(definition: File, fallbackName: String, maxBytes: Long): SkillMetadata {
    val lines = definition.readBoundedUtf8(maxBytes).lineSequence().take(MAX_SKILL_METADATA_LINES).toList()
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

private fun File.canonicalPathOrNull(): Path? = try {
    canonicalFile.toPath()
} catch (_: Exception) {
    null
}

private fun File.isWithin(rootBoundary: Path): Boolean = canonicalPathOrNull()?.startsWith(rootBoundary) == true

private fun defaultRootId(directory: File, index: Int): String =
    defaultUserSkillRoots().firstOrNull { it.directory.absoluteFile == directory.absoluteFile }?.id ?: "custom-$index"

internal const val USER_SKILL_TAG = "discovered:user"
private const val MAX_SKILL_FILES = 200
private const val MAX_SKILL_DEPTH = 5
private const val MAX_SKILL_FILE_DEPTH = 8
private const val MAX_SKILL_METADATA_LINES = 80
