package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmChangedPath
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmWorkspaceDeltaEvidence
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.UUID
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class SwarmTaskWorkspace(
    val id: String,
    val runId: String,
    val taskId: String,
    val attempt: Int,
    val directory: File,
    val baseRevision: String,
    val beforeTree: String,
)

data class StoredSwarmWorkspaceDelta(
    val id: String,
    val evidence: SwarmWorkspaceDeltaEvidence,
)

interface SwarmTaskWorkspaceManager {
    suspend fun create(runId: String, taskId: String, attempt: Int, baseRevision: String): SwarmTaskWorkspace
    suspend fun release(workspace: SwarmTaskWorkspace)

    suspend fun <T> withWorkspace(
        runId: String,
        taskId: String,
        attempt: Int,
        baseRevision: String,
        action: suspend (SwarmTaskWorkspace) -> T,
    ): T
}

class GitSwarmTaskWorkspaceManager(
    private val repositoryRoot: File,
    private val worktreeRoot: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
) : SwarmTaskWorkspaceManager {
    private val gitMutex = Mutex()
    private val normalizedRepositoryRoot = repositoryRoot.canonicalFile
    private val normalizedWorktreeRoot = worktreeRoot.canonicalFile

    init {
        require(!normalizedWorktreeRoot.toPath().startsWith(normalizedRepositoryRoot.toPath())) {
            "Task worktree root must be outside the repository"
        }
        normalizedWorktreeRoot.mkdirs()
        require(normalizedWorktreeRoot.isDirectory) { "Task worktree root cannot be created" }
    }

    override suspend fun create(
        runId: String,
        taskId: String,
        attempt: Int,
        baseRevision: String,
    ): SwarmTaskWorkspace {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm task execution")
        requireLabel(runId, "runId")
        requireLabel(taskId, "taskId")
        require(attempt > 0) { "Task workspace attempt must be positive" }
        require(baseRevision.matches(GIT_OBJECT_PATTERN)) { "Task base revision must be a full Git object id" }
        return gitMutex.withLock {
            val resolvedRevision = runGitOutput(
                arguments = listOf("rev-parse", "--verify", "$baseRevision^{commit}"),
                workingDirectory = normalizedRepositoryRoot,
            ).trim()
            require(resolvedRevision.matches(GIT_OBJECT_PATTERN)) { "Task base revision is not a commit" }
            val beforeTree = runGitOutput(
                arguments = listOf("rev-parse", "$resolvedRevision^{tree}"),
                workingDirectory = normalizedRepositoryRoot,
            ).trim()
            require(beforeTree.matches(GIT_OBJECT_PATTERN)) { "Task base tree is invalid" }
            val workspaceId = "task-${sha256("$runId\u0000$taskId\u0000$attempt\u0000${UUID.randomUUID()}")}"
            val workspaceDirectory = File(normalizedWorktreeRoot, workspaceId).canonicalFile
            require(workspaceDirectory.toPath().startsWith(normalizedWorktreeRoot.toPath())) {
                "Unsafe task workspace path"
            }
            try {
                runGit(
                    arguments = listOf("worktree", "add", "--detach", workspaceDirectory.path, resolvedRevision),
                    workingDirectory = normalizedRepositoryRoot,
                )
                val actualRevision = runGitOutput(listOf("rev-parse", "HEAD"), workspaceDirectory).trim()
                check(actualRevision == resolvedRevision) { "Task workspace revision changed during creation" }
                SwarmTaskWorkspace(
                    id = workspaceId,
                    runId = runId,
                    taskId = taskId,
                    attempt = attempt,
                    directory = workspaceDirectory,
                    baseRevision = resolvedRevision,
                    beforeTree = beforeTree,
                )
            } catch (error: Throwable) {
                withContext(NonCancellable) { cleanupFailedCreation(workspaceDirectory, error) }
                throw error
            }
        }
    }

    override suspend fun release(workspace: SwarmTaskWorkspace) {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm task cleanup")
        validateWorkspace(workspace)
        gitMutex.withLock {
            runGit(
                arguments = listOf("worktree", "remove", "--force", workspace.directory.path),
                workingDirectory = normalizedRepositoryRoot,
            )
            runGit(listOf("worktree", "prune"), normalizedRepositoryRoot)
        }
    }

    override suspend fun <T> withWorkspace(
        runId: String,
        taskId: String,
        attempt: Int,
        baseRevision: String,
        action: suspend (SwarmTaskWorkspace) -> T,
    ): T {
        val workspace = create(runId, taskId, attempt, baseRevision)
        var primaryFailure: Throwable? = null
        try {
            return action(workspace)
        } catch (error: Throwable) {
            primaryFailure = error
            throw error
        } finally {
            try {
                withContext(NonCancellable) { release(workspace) }
            } catch (cleanupError: Throwable) {
                val primary = primaryFailure
                if (primary != null) primary.addSuppressed(cleanupError) else throw cleanupError
            }
        }
    }

    private suspend fun cleanupFailedCreation(workspaceDirectory: File, primary: Throwable) {
        try {
            if (workspaceDirectory.exists()) {
                runGit(
                    arguments = listOf("worktree", "remove", "--force", workspaceDirectory.path),
                    workingDirectory = normalizedRepositoryRoot,
                )
            }
            runGit(listOf("worktree", "prune"), normalizedRepositoryRoot)
        } catch (cleanupError: Throwable) {
            primary.addSuppressed(cleanupError)
        }
    }

    private fun validateWorkspace(workspace: SwarmTaskWorkspace) {
        require(workspace.id.matches(WORKSPACE_ID_PATTERN)) { "Invalid task workspace id" }
        require(workspace.attempt > 0) { "Task workspace attempt must be positive" }
        require(workspace.baseRevision.matches(GIT_OBJECT_PATTERN)) { "Invalid task workspace revision" }
        require(workspace.beforeTree.matches(GIT_OBJECT_PATTERN)) { "Invalid task workspace tree" }
        val normalizedDirectory = workspace.directory.canonicalFile
        require(normalizedDirectory.parentFile == normalizedWorktreeRoot && normalizedDirectory.name == workspace.id) {
            "Task workspace is outside the configured root"
        }
    }

    private suspend fun runGit(
        arguments: List<String>,
        workingDirectory: File,
        environment: Map<String, String> = emptyMap(),
    ) {
        runGitOutput(arguments, workingDirectory, environment)
    }

    private suspend fun runGitOutput(
        arguments: List<String>,
        workingDirectory: File,
        environment: Map<String, String> = emptyMap(),
    ): String {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf("git") + arguments,
                workingDirectory = workingDirectory,
                timeout = GIT_COMMAND_TIMEOUT,
                environment = environment,
            )
        )
        check(result.exitCode == 0 && !result.timedOut) {
            "Git task workspace command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
        return result.output
    }
}

fun interface SwarmWorkspaceDeltaCapturer {
    suspend fun capture(workspace: SwarmTaskWorkspace, task: SwarmTask): StoredSwarmWorkspaceDelta
}

class GitSwarmWorkspaceDeltaCapturer(
    private val indexRoot: File,
    private val evidenceStore: SwarmEvidenceStore,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val maxDiffBytes: Long = 8L * 1024 * 1024,
    private val maxCaptureAttempts: Int = 2,
) : SwarmWorkspaceDeltaCapturer {
    private val captureMutex = Mutex()
    private val normalizedIndexRoot = indexRoot.canonicalFile

    init {
        require(maxDiffBytes > 0) { "maxDiffBytes must be positive" }
        require(maxCaptureAttempts > 1) { "maxCaptureAttempts must be greater than one" }
        normalizedIndexRoot.mkdirs()
        require(normalizedIndexRoot.isDirectory) { "Task index root cannot be created" }
    }

    suspend fun capture(workspace: SwarmTaskWorkspace): StoredSwarmWorkspaceDelta = captureInternal(workspace, task = null)

    override suspend fun capture(
        workspace: SwarmTaskWorkspace,
        task: SwarmTask,
    ): StoredSwarmWorkspaceDelta = captureInternal(workspace, task)

    private suspend fun captureInternal(
        workspace: SwarmTaskWorkspace,
        task: SwarmTask?,
    ): StoredSwarmWorkspaceDelta = captureMutex.withLock {
        validateWorkspaceForCapture(workspace)
        val indexFile = File(normalizedIndexRoot, "${workspace.id}-${UUID.randomUUID()}.index")
        val diffFile = File(normalizedIndexRoot, "${workspace.id}-${UUID.randomUUID()}.diff")
        try {
            val afterTree = captureStableTree(workspace, indexFile)
            runGit(
                arguments = listOf(
                    "diff-tree",
                    "--no-commit-id",
                    "--name-status",
                    "--no-renames",
                    "-r",
                    "-z",
                    "--output=${diffFile.absolutePath}",
                    workspace.beforeTree,
                    afterTree,
                ),
                workingDirectory = workspace.directory,
            )
            val diffBytes = readBoundedBytes(diffFile, maxDiffBytes)
            val changedPaths = parseNameStatusRecords(diffBytes)
            val ownershipAudit = task
                ?.takeIf { it.readPaths.isNotEmpty() || it.writePaths.isNotEmpty() }
                ?.let { auditChangedPaths(it, changedPaths) }
            val gitVersion = runGitOutput(listOf("--version"), workspace.directory).trim()
            val createdAt = Clock.System.now()
            val artifactRevision = createArtifactCommit(workspace, afterTree, createdAt)
            val pinnedReference = "$TASK_ARTIFACT_REFERENCE_PREFIX/${workspace.id}"
            runGit(listOf("update-ref", pinnedReference, artifactRevision), workspace.directory)
            val evidence = SwarmWorkspaceDeltaEvidence(
                runId = workspace.runId,
                taskId = workspace.taskId,
                attempt = workspace.attempt,
                worktreeId = workspace.id,
                baseRevision = workspace.baseRevision,
                beforeTree = workspace.beforeTree,
                afterTree = afterTree,
                artifactRevision = artifactRevision,
                pinnedReference = pinnedReference,
                nameStatusSha256 = sha256(diffBytes),
                changedPathCount = changedPaths.size,
                changedPaths = changedPaths,
                declaredWritePaths = task?.writePaths.orEmpty(),
                ownershipCompliant = ownershipAudit?.compliant,
                ownershipViolations = ownershipAudit?.violations.orEmpty(),
                ownershipPolicyVersion = ownershipAudit?.policyVersion,
                gitVersion = gitVersion,
                capturePolicyVersion = CAPTURE_POLICY_VERSION,
                createdAt = createdAt,
            )
            try {
                StoredSwarmWorkspaceDelta(
                    id = evidenceStore.putWorkspaceDelta(evidence),
                    evidence = evidence,
                )
            } catch (error: Throwable) {
                withContext(NonCancellable) {
                    try {
                        runGit(
                            listOf("update-ref", "-d", pinnedReference, artifactRevision),
                            workspace.directory,
                        )
                    } catch (cleanupError: Throwable) {
                        error.addSuppressed(cleanupError)
                    }
                }
                throw error
            }
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                indexFile.delete()
                File(indexFile.path + ".lock").delete()
                diffFile.delete()
            }
        }
    }

    private suspend fun captureStableTree(workspace: SwarmTaskWorkspace, indexFile: File): String {
        var previous = captureTree(workspace, indexFile)
        repeat(maxCaptureAttempts - 1) {
            val current = captureTree(workspace, indexFile)
            if (current == previous) return current
            previous = current
        }
        error("Task workspace changed repeatedly while capturing evidence")
    }

    private suspend fun createArtifactCommit(
        workspace: SwarmTaskWorkspace,
        afterTree: String,
        createdAt: kotlin.time.Instant,
    ): String {
        val gitDate = "@${createdAt.epochSeconds} +0000"
        val environment = mapOf(
            "GIT_AUTHOR_NAME" to ARTIFACT_AUTHOR_NAME,
            "GIT_AUTHOR_EMAIL" to ARTIFACT_AUTHOR_EMAIL,
            "GIT_AUTHOR_DATE" to gitDate,
            "GIT_COMMITTER_NAME" to ARTIFACT_AUTHOR_NAME,
            "GIT_COMMITTER_EMAIL" to ARTIFACT_AUTHOR_EMAIL,
            "GIT_COMMITTER_DATE" to gitDate,
        )
        return runGitOutput(
            arguments = listOf("commit-tree", afterTree, "-p", workspace.baseRevision),
            workingDirectory = workspace.directory,
            environment = environment,
            stdin = "Swarm task artifact ${workspace.runId}/${workspace.taskId}/${workspace.attempt}\n",
        ).trim().also { revision ->
            require(revision.matches(GIT_OBJECT_PATTERN)) { "Created task artifact revision is invalid" }
        }
    }

    private suspend fun captureTree(workspace: SwarmTaskWorkspace, indexFile: File): String {
        val environment = mapOf("GIT_INDEX_FILE" to indexFile.absolutePath)
        runGit(listOf("read-tree", workspace.baseRevision), workspace.directory, environment)
        runGit(listOf("add", "-A", "--", "."), workspace.directory, environment)
        return runGitOutput(listOf("write-tree"), workspace.directory, environment).trim().also { tree ->
            require(tree.matches(GIT_OBJECT_PATTERN)) { "Captured task tree is invalid" }
        }
    }

    private fun validateWorkspaceForCapture(workspace: SwarmTaskWorkspace) {
        val normalizedWorkspace = workspace.directory.canonicalFile
        require(workspace.id.matches(WORKSPACE_ID_PATTERN)) { "Invalid task workspace id" }
        require(normalizedWorkspace.isDirectory && File(normalizedWorkspace, ".git").isFile) {
            "Task workspace is not an active linked Git worktree"
        }
        require(!normalizedIndexRoot.toPath().startsWith(normalizedWorkspace.toPath())) {
            "Task index root must be outside the captured workspace"
        }
        require(workspace.baseRevision.matches(GIT_OBJECT_PATTERN)) { "Invalid task base revision" }
        require(workspace.beforeTree.matches(GIT_OBJECT_PATTERN)) { "Invalid task before tree" }
    }

    private suspend fun runGit(
        arguments: List<String>,
        workingDirectory: File,
        environment: Map<String, String> = emptyMap(),
    ) {
        runGitOutput(arguments, workingDirectory, environment)
    }

    private suspend fun runGitOutput(
        arguments: List<String>,
        workingDirectory: File,
        environment: Map<String, String> = emptyMap(),
        stdin: String? = null,
    ): String {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf("git") + arguments,
                workingDirectory = workingDirectory,
                timeout = GIT_COMMAND_TIMEOUT,
                environment = environment,
                stdin = stdin,
            )
        )
        check(result.exitCode == 0 && !result.timedOut) {
            "Git task evidence command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
        return result.output
    }
}

private fun readBoundedBytes(file: File, maxBytes: Long): ByteArray {
    require(file.isFile) { "Git diff output is missing" }
    require(Files.size(file.toPath()) <= maxBytes) { "Git diff output exceeds $maxBytes bytes" }
    return Files.readAllBytes(file.toPath()).also { bytes ->
        require(bytes.size.toLong() <= maxBytes) { "Git diff output exceeds $maxBytes bytes" }
    }
}

internal fun parseNameStatusRecords(bytes: ByteArray): List<SwarmChangedPath> {
    if (bytes.isEmpty()) return emptyList()
    require(bytes.last() == 0.toByte()) { "Git name-status output is not NUL terminated" }
    val fields = mutableListOf<String>()
    var start = 0
    bytes.forEachIndexed { index, byte ->
        if (byte == 0.toByte()) {
            fields += bytes.copyOfRange(start, index).toString(Charsets.UTF_8)
            start = index + 1
        }
    }
    require(fields.size % 2 == 0) { "Git name-status output has incomplete records" }
    return fields.chunked(2).map { (status, path) ->
        require(status.matches(GIT_CHANGE_STATUS_PATTERN)) { "Git name-status output has invalid status: $status" }
        SwarmChangedPath(status = status, path = validateOwnershipScope(path))
    }
}

private fun requireLabel(value: String, field: String) {
    require(value.isNotBlank() && value.length <= 512 && value.none { it.isISOControl() }) { "$field is invalid" }
}

private fun sha256(value: String): String = sha256(value.toByteArray(Charsets.UTF_8))

private fun sha256(value: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(value)
    .joinToString("") { byte -> "%02x".format(byte) }

private val GIT_COMMAND_TIMEOUT = 2.minutes
private const val CAPTURE_POLICY_VERSION = "git-tree-name-status-ownership-v2"
private const val TASK_ARTIFACT_REFERENCE_PREFIX = "refs/swarm-editor/task-artifacts"
private const val ARTIFACT_AUTHOR_NAME = "Swarm Editor"
private const val ARTIFACT_AUTHOR_EMAIL = "swarm-editor@localhost"
private val GIT_OBJECT_PATTERN = Regex("(?:[0-9a-f]{40}|[0-9a-f]{64})")
private val WORKSPACE_ID_PATTERN = Regex("task-[0-9a-f]{64}")
private val GIT_CHANGE_STATUS_PATTERN = Regex("[ACDMTUXB]")
