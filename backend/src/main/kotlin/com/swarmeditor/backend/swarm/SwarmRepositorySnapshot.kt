package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.File
import java.util.UUID
import kotlin.time.Duration.Companion.minutes
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class SwarmRepositorySnapshot(
    val revision: String,
    val baseRevision: String,
    val treeHash: String,
    val dirty: Boolean,
    val pinnedReference: String?,
)

fun interface SwarmRepositorySnapshotter {
    suspend fun snapshot(): SwarmRepositorySnapshot
}

class GitContentAddressedSnapshotter(
    private val repositoryRoot: File,
    private val indexRoot: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val maxCaptureAttempts: Int = 3,
) : SwarmRepositorySnapshotter {
    private val snapshotMutex = Mutex()

    init {
        require(repositoryRoot.isDirectory) { "Snapshot repository does not exist" }
        require(maxCaptureAttempts >= 2) { "Snapshot capture requires at least two attempts" }
    }

    override suspend fun snapshot(): SwarmRepositorySnapshot = snapshotMutex.withLock {
        indexRoot.mkdirs()
        require(indexRoot.isDirectory) { "Snapshot index directory cannot be created" }
        val baseRevision = runGit(listOf("rev-parse", "--verify", "HEAD")).trim()
        require(baseRevision.matches(snapshotCommitPattern)) { "Repository HEAD is not a commit" }
        val baseTree = runGit(listOf("rev-parse", "$baseRevision^{tree}")).trim()
        val indexFile = File(indexRoot, "snapshot-${UUID.randomUUID()}.index")
        try {
            val treeHash = captureStableTree(indexFile, baseRevision)
            if (treeHash == baseTree) {
                return@withLock SwarmRepositorySnapshot(
                    revision = baseRevision,
                    baseRevision = baseRevision,
                    treeHash = treeHash,
                    dirty = false,
                    pinnedReference = null,
                )
            }
            val revision = createSnapshotCommit(treeHash, baseRevision)
            val reference = "$SNAPSHOT_REFERENCE_PREFIX/$revision"
            runGit(listOf("update-ref", reference, revision))
            SwarmRepositorySnapshot(
                revision = revision,
                baseRevision = baseRevision,
                treeHash = treeHash,
                dirty = true,
                pinnedReference = reference,
            )
        } finally {
            withContext(NonCancellable) {
                indexFile.delete()
                File(indexFile.path + ".lock").delete()
            }
        }
    }

    private suspend fun captureStableTree(indexFile: File, baseRevision: String): String {
        var previous = captureTree(indexFile, baseRevision)
        repeat(maxCaptureAttempts - 1) {
            val current = captureTree(indexFile, baseRevision)
            if (current == previous) return current
            previous = current
        }
        error("Repository changed repeatedly while creating an evaluation snapshot")
    }

    private suspend fun captureTree(indexFile: File, baseRevision: String): String {
        val environment = mapOf("GIT_INDEX_FILE" to indexFile.absolutePath)
        runGit(listOf("read-tree", baseRevision), environment = environment)
        runGit(listOf("add", "-A", "--", "."), environment = environment)
        return runGit(listOf("write-tree"), environment = environment).trim()
    }

    private suspend fun createSnapshotCommit(treeHash: String, baseRevision: String): String {
        val environment = mapOf(
            "GIT_AUTHOR_NAME" to SNAPSHOT_IDENTITY_NAME,
            "GIT_AUTHOR_EMAIL" to SNAPSHOT_IDENTITY_EMAIL,
            "GIT_AUTHOR_DATE" to SNAPSHOT_TIMESTAMP,
            "GIT_COMMITTER_NAME" to SNAPSHOT_IDENTITY_NAME,
            "GIT_COMMITTER_EMAIL" to SNAPSHOT_IDENTITY_EMAIL,
            "GIT_COMMITTER_DATE" to SNAPSHOT_TIMESTAMP,
        )
        val message = "Swarm evaluation snapshot\n\nBase: $baseRevision\nTree: $treeHash\n"
        return runGit(
            arguments = listOf("commit-tree", treeHash, "-p", baseRevision),
            stdin = message,
            environment = environment,
        ).trim().also { revision ->
            require(revision.matches(snapshotCommitPattern)) { "Git returned an invalid snapshot revision" }
        }
    }

    private suspend fun runGit(
        arguments: List<String>,
        stdin: String? = null,
        environment: Map<String, String> = emptyMap(),
    ): String {
        val result = commandRunner.run(
            CommandRequest(
                command = listOf("git") + arguments,
                workingDirectory = repositoryRoot,
                stdin = stdin,
                timeout = 2.minutes,
                environment = environment,
            )
        )
        check(result.exitCode == 0 && !result.timedOut) {
            "git ${arguments.joinToString(" ")} failed: ${result.output}"
        }
        return result.output
    }
}

private const val SNAPSHOT_REFERENCE_PREFIX = "refs/swarm-editor/evaluation-snapshots"
private const val SNAPSHOT_IDENTITY_NAME = "Swarm Editor Evaluation"
private const val SNAPSHOT_IDENTITY_EMAIL = "evaluation@swarm-editor.local"
private const val SNAPSHOT_TIMESTAMP = "2000-01-01T00:00:00Z"
private val snapshotCommitPattern = Regex("(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})")
