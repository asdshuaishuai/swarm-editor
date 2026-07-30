package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.File
import java.util.UUID
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

interface SwarmEvaluationWorkspaceManager {
    suspend fun <T> withWorkspace(
        revision: String,
        patch: String,
        action: suspend (File) -> T,
    ): T
}

class GitWorktreeEvaluationWorkspaceManager(
    private val repositoryRoot: File,
    private val worktreeRoot: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val maxPatchBytes: Int = 8 * 1024 * 1024,
) : SwarmEvaluationWorkspaceManager {
    private val gitMutex = Mutex()

    init {
        require(File(repositoryRoot, ".git").exists()) { "Evaluation repository must be a Git worktree" }
        require(maxPatchBytes > 0) { "maxPatchBytes must be positive" }
        worktreeRoot.mkdirs()
    }

    override suspend fun <T> withWorkspace(
        revision: String,
        patch: String,
        action: suspend (File) -> T,
    ): T {
        require(revision.matches(commitPattern)) { "Evaluation revision must be a commit hash" }
        require(patch.toByteArray(Charsets.UTF_8).size <= maxPatchBytes) { "Evaluation patch is too large" }
        val workspace = File(worktreeRoot, "eval-${UUID.randomUUID()}").absoluteFile.normalize()
        require(workspace.toPath().startsWith(worktreeRoot.absoluteFile.normalize().toPath())) {
            "Unsafe evaluation workspace path"
        }
        gitMutex.withLock {
            runGit(listOf("worktree", "add", "--detach", workspace.path, revision), repositoryRoot)
        }
        var primaryFailure: Throwable? = null
        try {
            if (patch.isNotBlank()) {
                runGit(listOf("apply", "--whitespace=nowarn", "-"), workspace, stdin = patch)
            }
            return action(workspace)
        } catch (error: Throwable) {
            primaryFailure = error
            throw error
        } finally {
            try {
                withContext(NonCancellable) {
                    gitMutex.withLock {
                        runGit(listOf("worktree", "remove", "--force", workspace.path), repositoryRoot)
                        runGit(listOf("worktree", "prune"), repositoryRoot)
                    }
                }
            } catch (cleanupError: Throwable) {
                val primary = primaryFailure
                if (primary != null) primary.addSuppressed(cleanupError) else throw cleanupError
            }
        }
    }

    private suspend fun runGit(arguments: List<String>, directory: File, stdin: String? = null) {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf("git") + arguments,
                workingDirectory = directory,
                stdin = stdin,
                timeout = GIT_TIMEOUT_SECONDS.seconds,
            )
        )
        check(result.exitCode == 0) {
            "Git evaluation workspace command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
    }
}

private val commitPattern = Regex("[0-9a-fA-F]{7,40}")
private const val GIT_TIMEOUT_SECONDS = 60
