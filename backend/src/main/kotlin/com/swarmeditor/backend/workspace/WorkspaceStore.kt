package com.swarmeditor.backend.workspace

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.ProjectWorkspaceState
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val workspaceStoreLog = KotlinLogging.logger {}

@Serializable
private data class WorkspaceFile(
    val projects: List<ProjectWorkspaceState> = emptyList(),
)

class WorkspaceStore(
    private val file: File,
    private val maxFileBytes: Long = 4L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val projects = linkedMapOf<String, ProjectWorkspaceState>()
    private var loaded = false

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun get(projectPath: String): ProjectWorkspaceState? = mutex.withLock {
        loadIfNeeded()
        projects[projectPath]
    }

    suspend fun put(state: ProjectWorkspaceState) = mutex.withLock {
        loadIfNeeded()
        val previous = projects.put(state.projectPath, state)
        try {
            persist()
        } catch (error: CancellationException) {
            restore(state.projectPath, previous)
            throw error
        } catch (error: Throwable) {
            restore(state.projectPath, previous)
            throw error
        }
    }

    suspend fun remove(projectPath: String) = mutex.withLock {
        loadIfNeeded()
        val previous = projects.remove(projectPath) ?: return@withLock
        try {
            persist()
        } catch (error: CancellationException) {
            projects[projectPath] = previous
            throw error
        } catch (error: Throwable) {
            projects[projectPath] = previous
            throw error
        }
    }

    private suspend fun loadIfNeeded() {
        if (loaded) return
        val persisted = withContext(Dispatchers.IO) {
            if (!file.exists()) {
                WorkspaceFile()
            } else {
                try {
                    require(file.isFile) { "Workspace path is not a regular file: ${file.path}" }
                    json.decodeFromString(WorkspaceFile.serializer(), file.readBoundedUtf8(maxFileBytes))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    val quarantined = try {
                        file.quarantineCorruptFile()
                    } catch (quarantineError: Throwable) {
                        quarantineError.addSuppressed(error)
                        throw quarantineError
                    }
                    workspaceStoreLog.warn {
                        "Quarantined unreadable workspaces from ${file.path} to ${quarantined.path}: ${error.message}"
                    }
                    WorkspaceFile()
                }
            }
        }
        projects.clear()
        persisted.projects.forEach { projects[it.projectPath] = it }
        loaded = true
    }

    private suspend fun persist() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            WorkspaceFile.serializer(),
            WorkspaceFile(projects.values.sortedBy(ProjectWorkspaceState::projectPath)),
        ).requireUtf8Size(maxFileBytes, "Workspace data")
        file.atomicWriteText(content)
    }

    private fun restore(projectPath: String, previous: ProjectWorkspaceState?) {
        if (previous == null) projects.remove(projectPath) else projects[projectPath] = previous
    }
}
