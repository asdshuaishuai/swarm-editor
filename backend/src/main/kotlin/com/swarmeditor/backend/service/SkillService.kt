package com.swarmeditor.backend.service

import com.swarmeditor.backend.pi.PiRuntimePaths
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.skill.SyncMethod
import com.swarmeditor.backend.skill.ProjectSkillScanner
import com.swarmeditor.backend.skill.ProjectSkillTrustStatus
import com.swarmeditor.backend.skill.ProjectSkillTrustStore
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes

class SkillService(
    private val store: SkillStore,
    private val scanner: SkillScanner,
    private val skillsRootPath: String = ConfigPaths.SWARM_EDITOR_DIR,
    private val piSkillsPath: String = ConfigPaths.PI_SKILLS_DIR,
    private val agentDirectoryProvider: (String) -> File = PiRuntimePaths::agentDirectory,
    private val agentIdsProvider: suspend () -> List<String> = { emptyList() },
    private val invalidateAgentRuntime: suspend (String) -> Unit = {},
    private val invalidateAllRuntimes: suspend () -> Unit = {},
    private val skillInstaller: (File, File, SyncMethod) -> Unit = ::installSkill,
    private val projectRoot: File? = null,
    private val projectScanner: ProjectSkillScanner? = null,
    private val projectTrustStore: ProjectSkillTrustStore? = null,
) {
    private val _skills = MutableStateFlow<List<SkillConfig>>(emptyList())
    private val syncMutex = Mutex()
    val skills: StateFlow<List<SkillConfig>> = _skills.asStateFlow()

    suspend fun init() {
        store.load()
        store.synchronizeFilesystem(scanner.scanGlobal())
        projectTrustStore?.load()
        synchronizeProjectSkills()
        refresh()
    }

    suspend fun scan(): Result<Unit> = resultOf {
        store.synchronizeFilesystem(scanner.scanGlobal())
        synchronizeProjectSkills()
        refresh()
        invalidateAllRuntimes()
    }

    suspend fun getAll(): List<SkillConfig> = store.getAll()

    suspend fun getProjectSkillTrust(): Result<ProjectSkillTrustStatus?> = resultOfValue {
        val root = projectRoot ?: return@resultOfValue null
        val scanner = projectScanner ?: return@resultOfValue null
        val trustStore = projectTrustStore ?: return@resultOfValue null
        val snapshot = scanner.scan(root)
        trustStore.status(root, snapshot.fingerprint)
    }

    suspend fun trustProjectSkills(): Result<ProjectSkillTrustStatus> = resultOfValue {
        val root = requireNotNull(projectRoot) { "Project skill trust requires a project root" }
        val scanner = requireNotNull(projectScanner) { "Project skill scanner is unavailable" }
        val trustStore = requireNotNull(projectTrustStore) { "Project skill trust store is unavailable" }
        val snapshot = scanner.scan(root)
        trustStore.trust(root, snapshot.fingerprint)
        invalidateAllRuntimes()
        trustStore.status(root, snapshot.fingerprint)
    }

    suspend fun revokeProjectSkillTrust(): Result<Unit> = resultOf {
        val root = requireNotNull(projectRoot) { "Project skill trust requires a project root" }
        val trustStore = requireNotNull(projectTrustStore) { "Project skill trust store is unavailable" }
        trustStore.revoke(root)
        invalidateAllRuntimes()
    }

    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean): Result<Unit> = resultOf {
        val agentIds = agentIdsProvider().ifEmpty { listOf(agentId) }
        require(agentId in agentIds) { "Unknown Pi Agent Profile: $agentId" }
        val skill = store.getAll().firstOrNull { it.id == id } ?: error("Skill not found: $id")
        store.upsert(
            skill.copy(
                enabledAgents = skill.enabledAgents.updatedProfileAccess(agentIds, agentId, enabled)
            )
        )
        refresh()
        invalidateAgentRuntime(agentId)
    }

    suspend fun syncSkillsToPi(agentId: String, method: SyncMethod = SyncMethod.Auto) {
        val agentIds = agentIdsProvider()
        require(agentIds.isEmpty() || agentId in agentIds) { "Unknown Pi Agent Profile: $agentId" }
        val skills = store.getAll()
            .filter { it.source == SkillSource.FILESYSTEM || isTrustedProjectSkill(it) }
            .filter { it.enabledAgents.isEmpty() || it.enabledAgents[agentId] == true }
        syncSkillsToPi(skills, method, agentDirectoryProvider(agentId).resolve("skills"))
    }

    suspend fun syncSkillsToPi(
        skillNames: List<String>,
        method: SyncMethod = SyncMethod.Auto
    ) {
        val sourceDirectory = File(skillsRootPath, "skills")
        val skills = skillNames.map { name ->
            SkillConfig(
                id = "fs:$name",
                name = name,
                source = SkillSource.FILESYSTEM,
                path = File(sourceDirectory, name).absolutePath
            )
        }
        syncSkillsToPi(skills, method, File(piSkillsPath))
    }

    private suspend fun syncSkillsToPi(
        skills: List<SkillConfig>,
        method: SyncMethod,
        piDirectory: File
    ) = syncMutex.withLock {
        withContext(Dispatchers.IO) {
            val entries = prepareSkillSync(skills, piDirectory)
            require(piDirectory.isDirectory || piDirectory.mkdirs()) {
                "Cannot create Pi skills directory: ${piDirectory.path}"
            }
            val parent = requireNotNull(piDirectory.absoluteFile.parentFile) {
                "Pi skills directory must have a parent: ${piDirectory.path}"
            }
            val transactionDirectory = Files.createTempDirectory(
                parent.toPath(),
                ".${piDirectory.name}.sync-",
            ).toFile()
            try {
                val stagedDirectory = File(transactionDirectory, "staged").apply { mkdirs() }
                val staged = entries.map { entry ->
                    val destination = managedSkillDestination(stagedDirectory, entry.skill.name)
                    skillInstaller(entry.source, destination, method)
                    StagedSkill(entry.destination, destination)
                }
                commitSkillSync(piDirectory, staged, File(transactionDirectory, "backup"))
            } finally {
                deleteManagedPath(transactionDirectory)
            }
        }
    }

    suspend fun scanPiSkills(): List<String> = withContext(Dispatchers.IO) {
        File(piSkillsPath).listFiles { file -> file.isDirectory }?.map { it.name }.orEmpty()
    }

    private suspend fun refresh() {
        _skills.value = store.getAll()
    }

    private suspend fun synchronizeProjectSkills() {
        val root = projectRoot ?: return
        val scanner = projectScanner ?: return
        store.synchronizeFilesystem(scanner.scan(root).skills, SkillSource.PROJECT_FILESYSTEM)
    }

    private suspend fun isTrustedProjectSkill(skill: SkillConfig): Boolean {
        if (skill.source != SkillSource.PROJECT_FILESYSTEM) return false
        val root = projectRoot ?: return false
        val scanner = projectScanner ?: return false
        val trustStore = projectTrustStore ?: return false
        val snapshot = scanner.scan(root)
        return trustStore.status(root, snapshot.fingerprint).trusted
    }
}

private data class SkillSyncEntry(
    val skill: SkillConfig,
    val source: File,
    val destination: File,
)

private data class StagedSkill(
    val destination: File,
    val staged: File,
)

private fun prepareSkillSync(skills: List<SkillConfig>, piDirectory: File): List<SkillSyncEntry> {
    val candidates = skills.map { skill ->
        SkillSyncEntry(
            skill = skill,
            source = File(skill.path),
            destination = managedSkillDestination(piDirectory, skill.name),
        )
    }
    require(candidates.map { it.destination.name.lowercase() }.distinct().size == candidates.size) {
        "Skill names must be unique when synchronizing to Pi"
    }
    return candidates.filter { entry ->
        entry.source.isDirectory && File(entry.source, "SKILL.md").isFile
    }
}

private fun installSkill(source: File, destination: File, method: SyncMethod) {
    try {
        when (method) {
            SyncMethod.Copy -> copyRecursively(source, destination)
            SyncMethod.Symlink -> Files.createSymbolicLink(destination.toPath(), source.toPath())
            SyncMethod.Auto -> try {
                Files.createSymbolicLink(destination.toPath(), source.toPath())
            } catch (error: CancellationException) {
                throw error
            } catch (_: IOException) {
                copyRecursively(source, destination)
            } catch (_: UnsupportedOperationException) {
                copyRecursively(source, destination)
            }
        }
    } catch (error: Throwable) {
        if (destination.isManagedPath()) deleteManagedPath(destination)
        throw error
    }
}

private fun commitSkillSync(piDirectory: File, staged: List<StagedSkill>, backupDirectory: File) {
    require(backupDirectory.mkdirs()) { "Cannot create Pi skill backup directory: ${backupDirectory.path}" }
    val movedBackups = mutableListOf<Pair<File, File>>()
    val installed = mutableListOf<File>()
    try {
        piDirectory.listFiles().orEmpty().forEach { current ->
            val backup = File(backupDirectory, current.name)
            Files.move(current.toPath(), backup.toPath())
            movedBackups += backup to current
        }
        staged.forEach { skill ->
            Files.move(skill.staged.toPath(), skill.destination.toPath())
            installed += skill.destination
        }
    } catch (error: Throwable) {
        installed.asReversed().forEach { destination ->
            try {
                if (destination.isManagedPath()) deleteManagedPath(destination)
            } catch (rollbackError: Throwable) {
                error.addSuppressed(rollbackError)
            }
        }
        movedBackups.asReversed().forEach { (backup, original) ->
            try {
                if (backup.isManagedPath()) Files.move(backup.toPath(), original.toPath())
            } catch (rollbackError: Throwable) {
                error.addSuppressed(rollbackError)
            }
        }
        throw error
    }
}

private fun managedSkillDestination(piDirectory: File, skillName: String): File {
    require(skillName.isNotBlank()) { "Skill name cannot be blank" }
    require(
        skillName != "." &&
            skillName != ".." &&
            '/' !in skillName &&
            '\\' !in skillName &&
            '\u0000' !in skillName &&
            skillName.none { it in WINDOWS_FORBIDDEN_FILE_NAME_CHARACTERS } &&
            !skillName.endsWith('.') &&
            !skillName.endsWith(' ') &&
            skillName.substringBefore('.').uppercase() !in WINDOWS_RESERVED_FILE_NAMES
    ) {
        "Invalid Skill name: $skillName"
    }
    return File(piDirectory, skillName)
}

private fun deleteManagedPath(path: File) {
    val root = path.toPath()
    if (!path.isManagedPath()) return
    Files.walkFileTree(root, object : SimpleFileVisitor<Path>() {
        override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
            Files.deleteIfExists(file)
            return FileVisitResult.CONTINUE
        }

        override fun postVisitDirectory(directory: Path, error: IOException?): FileVisitResult {
            if (error != null) throw error
            Files.deleteIfExists(directory)
            return FileVisitResult.CONTINUE
        }
    })
}

private fun File.isManagedPath(): Boolean = exists() || Files.isSymbolicLink(toPath())

private fun Map<String, Boolean>.updatedProfileAccess(
    profileIds: List<String>,
    profileId: String,
    enabled: Boolean,
): Map<String, Boolean> {
    val updated = if (isEmpty()) {
        profileIds.associateWith { true }.toMutableMap()
    } else {
        toMutableMap()
    }
    updated[profileId] = enabled
    return if (profileIds.isNotEmpty() && profileIds.all { updated[it] == true }) emptyMap() else updated
}

private suspend fun resultOf(action: suspend () -> Unit): Result<Unit> {
    return try {
        action()
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}

private suspend fun <T> resultOfValue(action: suspend () -> T): Result<T> {
    return try {
        Result.success(action())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}

private fun copyRecursively(source: File, destination: File) {
    val sourcePath = source.toPath()
    require(!Files.isSymbolicLink(sourcePath)) { "Copy synchronization does not follow symbolic links: ${source.path}" }
    when {
        Files.isDirectory(sourcePath, NOFOLLOW_LINKS) -> {
            require(destination.isDirectory || destination.mkdirs()) {
                "Cannot create skill directory: ${destination.path}"
            }
            val children = requireNotNull(source.listFiles()) { "Cannot read skill directory: ${source.path}" }
            children.forEach { child -> copyRecursively(child, File(destination, child.name)) }
        }
        Files.isRegularFile(sourcePath, NOFOLLOW_LINKS) -> {
            destination.parentFile?.let { parent ->
                require(parent.isDirectory || parent.mkdirs()) { "Cannot create skill directory: ${parent.path}" }
            }
            Files.copy(sourcePath, destination.toPath())
        }
        else -> error("Unsupported skill entry: ${source.path}")
    }
}

private const val WINDOWS_FORBIDDEN_FILE_NAME_CHARACTERS = "<>:\"|?*"
private val WINDOWS_RESERVED_FILE_NAMES = buildSet {
    addAll(listOf("CON", "PRN", "AUX", "NUL"))
    (1..9).forEach { suffix ->
        add("COM$suffix")
        add("LPT$suffix")
    }
}
