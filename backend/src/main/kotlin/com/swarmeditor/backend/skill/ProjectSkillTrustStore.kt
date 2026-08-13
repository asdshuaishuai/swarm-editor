package com.swarmeditor.backend.skill

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val log = KotlinLogging.logger {}

@Serializable
private data class ProjectSkillTrustFile(val records: List<ProjectSkillTrustRecord> = emptyList())

@Serializable
private data class ProjectSkillTrustRecord(
    val projectPath: String,
    val fingerprint: String,
    val grantedAtEpochMillis: Long,
)

data class ProjectSkillTrustStatus(
    val projectPath: String,
    val fingerprint: String,
    val trusted: Boolean,
)

class ProjectSkillTrustStore(
    private val file: File,
    private val maxFileBytes: Long = 2L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val records = mutableMapOf<String, ProjectSkillTrustRecord>()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            mutex.withLock { records.clear() }
            return@withContext
        }
        val loaded = try {
            json.decodeFromString(ProjectSkillTrustFile.serializer(), file.readBoundedUtf8(maxFileBytes))
                .records
                .associateBy(ProjectSkillTrustRecord::projectPath)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val quarantined = file.quarantineCorruptFile()
            log.warn { "Quarantined unreadable project skill trust file to ${quarantined.name}: ${error.message}" }
            emptyMap()
        }
        mutex.withLock {
            records.clear()
            records.putAll(loaded)
        }
    }

    suspend fun status(projectRoot: File, fingerprint: String): ProjectSkillTrustStatus {
        val projectPath = canonicalProjectPath(projectRoot)
        val trusted = mutex.withLock { records[projectPath]?.fingerprint == fingerprint }
        return ProjectSkillTrustStatus(projectPath, fingerprint, trusted)
    }

    suspend fun trust(projectRoot: File, fingerprint: String) = update(projectRoot, fingerprint)

    suspend fun revoke(projectRoot: File) = mutex.withLock {
        val projectPath = canonicalProjectPath(projectRoot)
        val previous = records.remove(projectPath)
        try {
            save()
        } catch (error: Throwable) {
            if (previous != null) records[projectPath] = previous
            throw error
        }
    }

    private suspend fun update(projectRoot: File, fingerprint: String) = mutex.withLock {
        val projectPath = canonicalProjectPath(projectRoot)
        val previous = records.put(
            projectPath,
            ProjectSkillTrustRecord(projectPath, fingerprint, System.currentTimeMillis()),
        )
        try {
            save()
        } catch (error: Throwable) {
            if (previous == null) records.remove(projectPath) else records[projectPath] = previous
            throw error
        }
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            ProjectSkillTrustFile.serializer(),
            ProjectSkillTrustFile(records.values.sortedBy(ProjectSkillTrustRecord::projectPath)),
        ).requireUtf8Size(maxFileBytes, "Project skill trust configuration")
        file.atomicWriteText(content)
    }

    private fun canonicalProjectPath(projectRoot: File): String = projectRoot.canonicalFile.absolutePath
}
