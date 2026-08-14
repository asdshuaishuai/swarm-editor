package com.swarmeditor.backend.service

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.backend.workspace.WorkspaceStore
import com.swarmeditor.common.model.ProjectWorkspace
import com.swarmeditor.common.model.ProjectWorkspaceKind
import com.swarmeditor.common.model.ProjectWorkspaceState
import java.io.File
import java.util.UUID
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

@OptIn(ExperimentalTime::class)
class WorkspaceService(
    private val store: WorkspaceStore,
    private val worktreeRoot: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val clock: Clock = Clock.System,
) {
    private val mutex = Mutex()

    suspend fun list(projectRoot: File): ProjectWorkspaceState = mutex.withLock {
        val root = canonicalDirectory(projectRoot)
        val existing = store.get(root.path)
        if (existing != null) return@withLock ensureDefault(existing, root)
        val now = clock.now()
        val default = defaultWorkspace(root, now)
        ProjectWorkspaceState(
            projectPath = root.path,
            activeWorkspaceId = default.id,
            workspaces = listOf(default),
            updatedAt = now,
        ).also { store.put(it) }
    }

    suspend fun select(projectRoot: File, workspaceId: String): ProjectWorkspace = mutex.withLock {
        val state = listUnlocked(projectRoot)
        val workspace = requireNotNull(state.workspaces.firstOrNull { it.id == workspaceId }) {
            "Workspace not found: $workspaceId"
        }
        val updated = state.copy(activeWorkspaceId = workspace.id)
        store.put(updated)
        workspace
    }

    suspend fun createManagedWorktree(projectRoot: File, branch: String): ProjectWorkspace = mutex.withLock {
        val root = canonicalDirectory(projectRoot)
        validateBranch(branch)
        val state = listUnlocked(root)
        val id = "workspace-${UUID.randomUUID()}"
        val directory = File(worktreeRoot, "${safePathPart(root.name)}-$id").absoluteFile.normalize()
        require(directory.toPath().startsWith(worktreeRoot.absoluteFile.normalize().toPath())) {
            "Unsafe workspace path"
        }
        withContext(Dispatchers.IO) {
            worktreeRoot.mkdirs()
            runGit(root, listOf("worktree", "add", "-b", branch, directory.path, "HEAD"))
        }
        val now = clock.now()
        val workspace = ProjectWorkspace(
            id = id,
            projectPath = root.path,
            cwd = directory.canonicalPath,
            branch = branch,
            kind = ProjectWorkspaceKind.MANAGED_WORKTREE,
            createdAt = now,
            updatedAt = now,
        )
        try {
            store.put(state.copy(workspaces = state.workspaces + workspace, updatedAt = now))
        } catch (error: CancellationException) {
            removeWorktreeAfterStoreFailure(root, directory, error)
            throw error
        } catch (error: Throwable) {
            removeWorktreeAfterStoreFailure(root, directory, error)
            throw error
        }
        workspace
    }

    suspend fun attachExistingWorktree(projectRoot: File, worktree: File): ProjectWorkspace = mutex.withLock {
        val root = canonicalDirectory(projectRoot)
        val directory = canonicalDirectory(worktree)
        require(directory.path != root.path) { "The project root is the default workspace" }
        val knownWorktrees = withContext(Dispatchers.IO) { listWorktrees(root) }
        require(directory.path in knownWorktrees) { "Directory is not a worktree of this project: ${directory.path}" }
        val state = listUnlocked(root)
        state.workspaces.firstOrNull { it.cwd == directory.path }?.let { return@withLock it }
        val branch = withContext(Dispatchers.IO) {
            runGit(root, listOf("-C", directory.path, "branch", "--show-current")).trim().ifBlank { null }
        }
        val now = clock.now()
        val workspace = ProjectWorkspace(
            id = "workspace-${UUID.randomUUID()}",
            projectPath = root.path,
            cwd = directory.path,
            branch = branch,
            kind = ProjectWorkspaceKind.ATTACHED_WORKTREE,
            createdAt = now,
            updatedAt = now,
        )
        store.put(state.copy(workspaces = state.workspaces + workspace, updatedAt = now))
        workspace
    }

    suspend fun remove(projectRoot: File, workspaceId: String) = mutex.withLock {
        val root = canonicalDirectory(projectRoot)
        val state = listUnlocked(root)
        val workspace = requireNotNull(state.workspaces.firstOrNull { it.id == workspaceId }) {
            "Workspace not found: $workspaceId"
        }
        require(workspace.kind != ProjectWorkspaceKind.DEFAULT) { "The default workspace cannot be removed" }
        if (workspace.kind == ProjectWorkspaceKind.MANAGED_WORKTREE) {
            withContext(Dispatchers.IO) {
                runGit(root, listOf("worktree", "remove", "--force", workspace.cwd))
                runGit(root, listOf("worktree", "prune"))
            }
        }
        val remaining = state.workspaces.filterNot { it.id == workspaceId }
        val active = if (state.activeWorkspaceId == workspaceId) {
            remaining.first { it.kind == ProjectWorkspaceKind.DEFAULT }.id
        } else {
            state.activeWorkspaceId
        }
        store.put(state.copy(activeWorkspaceId = active, workspaces = remaining, updatedAt = clock.now()))
    }

    private suspend fun listUnlocked(projectRoot: File): ProjectWorkspaceState {
        val root = canonicalDirectory(projectRoot)
        val existing = store.get(root.path)
        if (existing != null) return ensureDefault(existing, root)
        val now = clock.now()
        val default = defaultWorkspace(root, now)
        return ProjectWorkspaceState(
            projectPath = root.path,
            activeWorkspaceId = default.id,
            workspaces = listOf(default),
            updatedAt = now,
        ).also { store.put(it) }
    }

    private suspend fun ensureDefault(
        state: ProjectWorkspaceState,
        root: File,
    ): ProjectWorkspaceState {
        val default = state.workspaces.firstOrNull { it.kind == ProjectWorkspaceKind.DEFAULT }
        if (default != null && default.cwd == root.path && state.projectPath == root.path) return state
        val now = clock.now()
        val replacement = defaultWorkspace(root, now)
        val workspaces = state.workspaces.filterNot { it.kind == ProjectWorkspaceKind.DEFAULT } + replacement
        val active = state.activeWorkspaceId.takeIf { id -> workspaces.any { it.id == id } } ?: replacement.id
        return state.copy(
            projectPath = root.path,
            activeWorkspaceId = active,
            workspaces = workspaces,
            updatedAt = now,
        ).also {
            store.put(it)
        }
    }

    private suspend fun listWorktrees(root: File): Set<String> = runGit(root, listOf("worktree", "list", "--porcelain"))
        .lineSequence()
        .filter { it.startsWith("worktree ") }
        .map { it.removePrefix("worktree ").trim() }
        .map { File(it).canonicalPath }
        .toSet()

    private suspend fun runGit(root: File, arguments: List<String>): String {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf("git") + arguments,
                workingDirectory = root,
                timeout = 60.seconds,
                maxOutputChars = 256 * 1024,
            ),
        )
        check(result.exitCode == 0 && !result.timedOut) {
            "Git workspace command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
        return result.output
    }

    private suspend fun removeWorktreeAfterStoreFailure(root: File, directory: File, primary: Throwable) {
        try {
            withContext(Dispatchers.IO) {
                runGit(root, listOf("worktree", "remove", "--force", directory.path))
                runGit(root, listOf("worktree", "prune"))
            }
        } catch (cleanupError: Throwable) {
            primary.addSuppressed(cleanupError)
        }
    }

    private fun canonicalDirectory(directory: File): File {
        require(directory.isDirectory) { "Directory does not exist: ${directory.path}" }
        return directory.canonicalFile
    }

    private fun defaultWorkspace(root: File, now: kotlin.time.Instant) = ProjectWorkspace(
        id = "default",
        projectPath = root.path,
        cwd = root.path,
        kind = ProjectWorkspaceKind.DEFAULT,
        createdAt = now,
        updatedAt = now,
    )

    private fun validateBranch(branch: String) {
        require(branch.matches(BRANCH_PATTERN)) { "Invalid Git branch name" }
        require(".." !in branch && !branch.endsWith('.') && !branch.endsWith('/')) {
            "Invalid Git branch name"
        }
    }

    private fun safePathPart(value: String): String = value
        .replace(Regex("[^A-Za-z0-9._-]"), "-")
        .trim('-')
        .ifBlank { "project" }

    private companion object {
        val BRANCH_PATTERN = Regex("[A-Za-z0-9._/-]+")
    }
}
