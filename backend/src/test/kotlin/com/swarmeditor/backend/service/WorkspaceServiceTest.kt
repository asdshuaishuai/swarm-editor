package com.swarmeditor.backend.service

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.workspace.WorkspaceStore
import com.swarmeditor.common.model.ProjectWorkspaceKind
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class WorkspaceServiceTest {
    @Test
    fun `creates selects and removes managed worktrees without removing default workspace`() = runTest {
        val directory = Files.createTempDirectory("workspace-service")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val worktreeRoot = directory.resolve("worktrees").toFile()
        val runner = RecordingWorkspaceCommandRunner(projectRoot)
        val service = WorkspaceService(
            store = WorkspaceStore(directory.resolve("workspaces.json").toFile()),
            worktreeRoot = worktreeRoot,
            commandRunner = runner,
        )

        val initial = service.list(projectRoot)
        val managed = service.createManagedWorktree(projectRoot, "feature/workspace")
        val selected = service.select(projectRoot, managed.id)

        assertEquals(ProjectWorkspaceKind.DEFAULT, initial.workspaces.single().kind)
        assertEquals(managed.id, selected.id)
        assertTrue(runner.commands.any { it.startsWith("git worktree add -b feature/workspace") })

        service.remove(projectRoot, managed.id)
        val afterRemoval = service.list(projectRoot)

        assertEquals(listOf("default"), afterRemoval.workspaces.map { it.id })
        assertEquals("default", afterRemoval.activeWorkspaceId)
        assertTrue(runner.commands.any { it.contains("git worktree remove --force") })
    }

    @Test
    fun `attaches only an existing git worktree and preserves it on removal`() = runTest {
        val directory = Files.createTempDirectory("workspace-attach")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val attached = directory.resolve("attached").toFile().apply { mkdirs() }
        val runner = RecordingWorkspaceCommandRunner(projectRoot, attached)
        val service = WorkspaceService(
            store = WorkspaceStore(directory.resolve("workspaces.json").toFile()),
            worktreeRoot = directory.resolve("worktrees").toFile(),
            commandRunner = runner,
        )

        val workspace = service.attachExistingWorktree(projectRoot, attached)
        service.remove(projectRoot, workspace.id)

        assertEquals(ProjectWorkspaceKind.ATTACHED_WORKTREE, workspace.kind)
        assertTrue(attached.isDirectory)
        assertTrue(runner.commands.none { it.contains("worktree remove") })
    }

    @Test
    fun `rejects invalid branch names before invoking git`() = runTest {
        val directory = Files.createTempDirectory("workspace-branch")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val runner = RecordingWorkspaceCommandRunner(projectRoot)
        val service = WorkspaceService(
            store = WorkspaceStore(directory.resolve("workspaces.json").toFile()),
            worktreeRoot = directory.resolve("worktrees").toFile(),
            commandRunner = runner,
        )

        assertFailsWith<IllegalArgumentException> {
            service.createManagedWorktree(projectRoot, "../escape")
        }
        assertTrue(runner.commands.isEmpty())
    }
}

private class RecordingWorkspaceCommandRunner(
    private val projectRoot: File,
    private val attachedWorktree: File? = null,
) : CommandRunner {
    val commands = mutableListOf<String>()

    override suspend fun run(request: CommandRequest): CommandResult {
        val command = request.command.joinToString(" ")
        commands += command
        return when {
            request.command.contains("worktree") && request.command.contains("add") -> {
                val path = request.command[request.command.indexOf("-b") + 2]
                File(path).mkdirs()
                success()
            }
            request.command.contains("worktree") && request.command.contains("list") -> {
                val paths = buildList {
                    add(projectRoot.canonicalPath)
                    attachedWorktree?.let { add(it.canonicalPath) }
                }
                success(paths.joinToString("\n") { "worktree $it" })
            }
            request.command.contains("branch") && request.command.contains("--show-current") -> success("feature/attached\n")
            request.command.contains("worktree") && request.command.contains("remove") -> {
                request.command.lastOrNull()?.let { File(it).deleteRecursively() }
                success()
            }
            else -> success()
        }
    }

    private fun success(output: String = "") = CommandResult(0, output, 0)
}
