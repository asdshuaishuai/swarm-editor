package com.swarmeditor.backend.swarm

import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest

class SwarmTaskWorkspaceTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `creates detached task worktree without modifying the main workspace`() = runTest {
        val directory = Files.createTempDirectory("swarm-task-worktree")
        try {
            val repository = createRepository(directory.resolve("repository").toFile())
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()
            val manager = GitSwarmTaskWorkspaceManager(
                repositoryRoot = repository,
                worktreeRoot = directory.resolve("worktrees").toFile(),
            )
            lateinit var workspaceDirectory: File

            manager.withWorkspace("run-test", "implement", 1, baseRevision) { workspace ->
                workspaceDirectory = workspace.directory
                assertEquals(baseRevision, workspace.baseRevision)
                assertEquals(baseRevision, git(workspace.directory, "rev-parse", "HEAD").trim())
                assertTrue(workspace.directory.isDirectory)
                File(workspace.directory, "modified.txt").writeText("task change\n")
                assertEquals("base", File(repository, "modified.txt").readText().trim())
            }

            assertFalse(workspaceDirectory.exists())
            assertFalse(git(repository, "worktree", "list", "--porcelain").contains(workspaceDirectory.path))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `captures tracked deleted and untracked paths without staging them`() = runTest {
        val directory = Files.createTempDirectory("swarm-task-delta")
        try {
            val repository = createRepository(directory.resolve("repository").toFile())
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()
            val evidenceStore = SwarmEvidenceStore(directory.resolve("evidence").toFile())
            val manager = GitSwarmTaskWorkspaceManager(
                repositoryRoot = repository,
                worktreeRoot = directory.resolve("worktrees").toFile(),
            )
            val capturer = GitSwarmWorkspaceDeltaCapturer(
                indexRoot = directory.resolve("indexes").toFile(),
                evidenceStore = evidenceStore,
            )
            val workspace = manager.create("run-test", "implement", 1, baseRevision)
            lateinit var captured: StoredSwarmWorkspaceDelta
            try {
                File(workspace.directory, "modified.txt").writeText("changed\n")
                File(workspace.directory, "deleted.txt").delete()
                File(workspace.directory, "added.txt").writeText("added\n")
                File(workspace.directory, "line\nbreak.txt").writeText("nul-safe\n")
                File(workspace.directory, "ignored.tmp").writeText("ignored\n")

                captured = capturer.capture(workspace)

                assertEquals(4, captured.evidence.changedPathCount)
                assertNotEquals(captured.evidence.beforeTree, captured.evidence.afterTree)
                assertEquals(captured.evidence, evidenceStore.getWorkspaceDelta(captured.id))
                val artifactRevision = checkNotNull(captured.evidence.artifactRevision)
                val pinnedReference = checkNotNull(captured.evidence.pinnedReference)
                assertEquals(artifactRevision, git(repository, "rev-parse", pinnedReference).trim())
                assertEquals(captured.evidence.afterTree, git(repository, "rev-parse", "$artifactRevision^{tree}").trim())
                assertEquals(baseRevision, git(repository, "rev-parse", "$artifactRevision^").trim())
                assertEquals("changed", git(repository, "show", "${captured.evidence.afterTree}:modified.txt").trim())
                assertEquals("added", git(repository, "show", "${captured.evidence.afterTree}:added.txt").trim())
                assertFalse(git(repository, "ls-tree", "-r", "--name-only", captured.evidence.afterTree).contains("ignored.tmp"))
                git(workspace.directory, "diff", "--cached", "--quiet")
                assertTrue(directory.resolve("indexes").toFile().listFiles().orEmpty().isEmpty())
                assertEquals("base", File(repository, "modified.txt").readText().trim())
                assertTrue(File(repository, "deleted.txt").isFile)
            } finally {
                manager.release(workspace)
            }

            git(repository, "gc", "--prune=now")
            val stored = checkNotNull(evidenceStore.getWorkspaceDelta(captured.id))
            git(repository, "cat-file", "-e", "${stored.artifactRevision}^{commit}")
            assertEquals("changed", git(repository, "show", "${stored.artifactRevision}:modified.txt").trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `removes pinned artifact reference when evidence persistence fails`() = runTest {
        val directory = Files.createTempDirectory("swarm-task-delta-persist-failure")
        try {
            val repository = createRepository(directory.resolve("repository").toFile())
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()
            val manager = GitSwarmTaskWorkspaceManager(
                repositoryRoot = repository,
                worktreeRoot = directory.resolve("worktrees").toFile(),
            )
            val capturer = GitSwarmWorkspaceDeltaCapturer(
                indexRoot = directory.resolve("indexes").toFile(),
                evidenceStore = SwarmEvidenceStore(
                    directory = directory.resolve("evidence").toFile(),
                    maxFileBytes = 1,
                ),
            )
            val workspace = manager.create("run-test", "persist-failure", 1, baseRevision)
            try {
                File(workspace.directory, "modified.txt").writeText("changed\n")

                assertFailsWith<IllegalArgumentException> { capturer.capture(workspace) }

                assertFalse(
                    git(repository, "for-each-ref", "--format=%(refname)", "refs/swarm-editor/task-artifacts")
                        .isNotBlank()
                )
                assertTrue(directory.resolve("indexes").toFile().listFiles().orEmpty().isEmpty())
            } finally {
                manager.release(workspace)
            }
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cleans task worktree when task action fails`() = runTest {
        val directory = Files.createTempDirectory("swarm-task-worktree-failure")
        try {
            val repository = createRepository(directory.resolve("repository").toFile())
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()
            val worktreeRoot = directory.resolve("worktrees").toFile()
            val manager = GitSwarmTaskWorkspaceManager(repository, worktreeRoot)
            lateinit var failedWorkspace: File

            assertFailsWith<IllegalStateException> {
                manager.withWorkspace("run-test", "failing", 1, baseRevision) { workspace ->
                    failedWorkspace = workspace.directory
                    error("task failed")
                }
            }

            assertTrue(worktreeRoot.listFiles().orEmpty().isEmpty())
            assertFalse(git(repository, "worktree", "list", "--porcelain").contains(failedWorkspace.path))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cleans task worktree when task action is cancelled`() = runTest {
        val directory = Files.createTempDirectory("swarm-task-worktree-cancel")
        try {
            val repository = createRepository(directory.resolve("repository").toFile())
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()
            val worktreeRoot = directory.resolve("worktrees").toFile()
            val manager = GitSwarmTaskWorkspaceManager(repository, worktreeRoot)
            lateinit var cancelledWorkspace: File

            assertFailsWith<CancellationException> {
                manager.withWorkspace("run-test", "cancelled", 1, baseRevision) { workspace ->
                    cancelledWorkspace = workspace.directory
                    throw CancellationException("cancelled")
                }
            }

            assertTrue(worktreeRoot.listFiles().orEmpty().isEmpty())
            assertFalse(git(repository, "worktree", "list", "--porcelain").contains(cancelledWorkspace.path))
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun createRepository(repository: File): File {
        repository.mkdirs()
        git(repository, "init")
        git(repository, "config", "user.email", "tests@swarm.local")
        git(repository, "config", "user.name", "Swarm Tests")
        File(repository, ".gitignore").writeText("*.tmp\n")
        File(repository, "modified.txt").writeText("base\n")
        File(repository, "deleted.txt").writeText("delete me\n")
        git(repository, "add", ".")
        git(repository, "commit", "-m", "baseline")
        return repository
    }

    private fun git(directory: File, vararg arguments: String): String {
        val process = ProcessBuilder(listOf("git") + arguments)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        check(process.waitFor() == 0) { "git ${arguments.joinToString(" ")} failed: $output" }
        return output
    }
}
