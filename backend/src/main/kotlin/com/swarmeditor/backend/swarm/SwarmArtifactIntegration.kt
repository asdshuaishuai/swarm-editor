package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmVerificationStatus
import java.io.File
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class SwarmArtifactIntegrationPlan(
    val runId: String,
    val taskId: String,
    val attempt: Int,
    val workspaceDeltaEvidenceId: String,
    val verificationEvidenceId: String,
    val baselineRevision: String,
    val baselineTree: String,
    val currentRevision: String,
    val currentTree: String,
    val artifactRevision: String,
    val artifactTree: String,
    val integratedRevision: String,
    val integratedTree: String,
    val pinnedReference: String,
)

class SwarmArtifactMergeConflictException(
    val runId: String,
    val taskId: String,
    val details: String,
) : IllegalStateException("Verified task artifact conflicts with the current repository state")

class GitSwarmArtifactIntegrator(
    private val repositoryRoot: File,
    private val evidenceStore: SwarmEvidenceStore,
    private val repositorySnapshotter: SwarmRepositorySnapshotter,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
) {
    private val integrationMutex = Mutex()
    private val normalizedRepositoryRoot = repositoryRoot.canonicalFile

    init {
        require(File(normalizedRepositoryRoot, ".git").exists()) { "Artifact repository must be a Git worktree" }
    }

    suspend fun prepare(
        run: SwarmRun,
        task: SwarmTask,
        workspaceDeltaEvidenceId: String,
        verificationEvidenceId: String,
    ): SwarmArtifactIntegrationPlan = integrationMutex.withLock {
        require(run.tasks.any { it.id == task.id }) { "Task does not belong to the Swarm run" }
        val baseline = requireNotNull(run.repositoryBaseline) { "Swarm run has no repository baseline" }
        val workspace = requireNotNull(evidenceStore.getWorkspaceDelta(workspaceDeltaEvidenceId)) {
            "Workspace delta evidence is missing"
        }
        val verification = requireNotNull(evidenceStore.getVerification(verificationEvidenceId)) {
            "Verification evidence is missing"
        }
        require(verification.status == SwarmVerificationStatus.PASSED) {
            "Only passed verification evidence can be integrated"
        }
        require(verification.workspaceDeltaEvidenceId == workspaceDeltaEvidenceId) {
            "Verification references a different workspace delta"
        }
        require(workspace.runId == run.id && verification.runId == run.id) { "Artifact run does not match" }
        require(workspace.taskId == task.id && verification.taskId == task.id) { "Artifact task does not match" }
        require(workspace.attempt == task.attempt && verification.attempt == task.attempt) {
            "Artifact attempt does not match"
        }
        require(workspace.baseRevision == baseline.revision) { "Artifact does not start from the run baseline" }
        require(workspace.beforeTree == baseline.treeHash) { "Artifact base tree does not match the run baseline" }
        val artifactRevision = requireNotNull(workspace.artifactRevision) {
            "Workspace evidence has no durable artifact revision"
        }
        val artifactReference = requireNotNull(workspace.pinnedReference) {
            "Workspace evidence has no durable artifact reference"
        }

        requireCommitTree(baseline.revision, baseline.treeHash, "run baseline")
        requireCommitTree(artifactRevision, workspace.afterTree, "task artifact")
        require(runGitOutput(listOf("rev-parse", "--verify", "$artifactReference^{commit}")).trim() == artifactRevision) {
            "Task artifact reference no longer resolves to the recorded revision"
        }
        require(runGitOutput(listOf("rev-parse", "$artifactRevision^")).trim() == baseline.revision) {
            "Task artifact parent does not match the run baseline"
        }

        val current = repositorySnapshotter.snapshot()
        requireCommitTree(current.revision, current.treeHash, "current repository snapshot")
        val integratedTree = mergeTrees(
            baselineRevision = baseline.revision,
            baselineTree = baseline.treeHash,
            currentTree = current.treeHash,
            artifactRevision = artifactRevision,
            artifactTree = workspace.afterTree,
            runId = run.id,
            taskId = task.id,
        )
        val integratedRevision = createIntegrationCommit(
            tree = integratedTree,
            currentRevision = current.revision,
            artifactRevision = artifactRevision,
            runId = run.id,
            taskId = task.id,
            attempt = task.attempt,
        )
        val pinnedReference = "$INTEGRATION_REFERENCE_PREFIX/$integratedRevision"
        runGitOutput(listOf("update-ref", pinnedReference, integratedRevision))

        SwarmArtifactIntegrationPlan(
            runId = run.id,
            taskId = task.id,
            attempt = task.attempt,
            workspaceDeltaEvidenceId = workspaceDeltaEvidenceId,
            verificationEvidenceId = verificationEvidenceId,
            baselineRevision = baseline.revision,
            baselineTree = baseline.treeHash,
            currentRevision = current.revision,
            currentTree = current.treeHash,
            artifactRevision = artifactRevision,
            artifactTree = workspace.afterTree,
            integratedRevision = integratedRevision,
            integratedTree = integratedTree,
            pinnedReference = pinnedReference,
        )
    }

    private suspend fun mergeTrees(
        baselineRevision: String,
        baselineTree: String,
        currentTree: String,
        artifactRevision: String,
        artifactTree: String,
        runId: String,
        taskId: String,
    ): String {
        if (currentTree == baselineTree) return artifactTree
        if (artifactTree == baselineTree || currentTree == artifactTree) return currentTree

        val currentSideRevision = createCommit(
            tree = currentTree,
            parents = listOf(baselineRevision),
            message = "Current repository side for Swarm integration\n",
        )
        val result = runGit(listOf("merge-tree", "--write-tree", currentSideRevision, artifactRevision))
        if (result.timedOut) error("Git artifact merge timed out")
        if (result.exitCode == 1) {
            throw SwarmArtifactMergeConflictException(runId, taskId, result.output.take(MAX_CONFLICT_DETAILS))
        }
        check(result.exitCode == 0) { "Git artifact merge failed: ${result.output}" }
        return result.output.lineSequence().firstOrNull()?.trim().orEmpty().also { tree ->
            require(tree.matches(GIT_OBJECT_PATTERN)) { "Git artifact merge did not produce a tree" }
            require(runGitOutput(listOf("cat-file", "-t", tree)).trim() == "tree") {
                "Git artifact merge result is not a tree"
            }
        }
    }

    private suspend fun createIntegrationCommit(
        tree: String,
        currentRevision: String,
        artifactRevision: String,
        runId: String,
        taskId: String,
        attempt: Int,
    ): String = createCommit(
        tree = tree,
        parents = listOf(currentRevision, artifactRevision).distinct(),
        message = "Swarm integration plan $runId/$taskId/$attempt\n",
    )

    private suspend fun createCommit(tree: String, parents: List<String>, message: String): String {
        val now = Clock.System.now()
        val gitDate = "@${now.epochSeconds} +0000"
        val environment = mapOf(
            "GIT_AUTHOR_NAME" to INTEGRATION_AUTHOR_NAME,
            "GIT_AUTHOR_EMAIL" to INTEGRATION_AUTHOR_EMAIL,
            "GIT_AUTHOR_DATE" to gitDate,
            "GIT_COMMITTER_NAME" to INTEGRATION_AUTHOR_NAME,
            "GIT_COMMITTER_EMAIL" to INTEGRATION_AUTHOR_EMAIL,
            "GIT_COMMITTER_DATE" to gitDate,
        )
        val arguments = buildList {
            add("commit-tree")
            add(tree)
            parents.forEach { parent ->
                add("-p")
                add(parent)
            }
        }
        return runGitOutput(arguments, environment = environment, stdin = message).trim().also { revision ->
            require(revision.matches(GIT_OBJECT_PATTERN)) { "Created integration revision is invalid" }
        }
    }

    private suspend fun requireCommitTree(revision: String, expectedTree: String, label: String) {
        require(revision.matches(GIT_OBJECT_PATTERN)) { "$label revision is invalid" }
        require(expectedTree.matches(GIT_OBJECT_PATTERN)) { "$label tree is invalid" }
        val resolvedRevision = runGitOutput(listOf("rev-parse", "--verify", "$revision^{commit}")).trim()
        require(resolvedRevision == revision) { "$label revision is not available" }
        val resolvedTree = runGitOutput(listOf("rev-parse", "$revision^{tree}")).trim()
        require(resolvedTree == expectedTree) { "$label tree does not match its revision" }
    }

    private suspend fun runGitOutput(
        arguments: List<String>,
        environment: Map<String, String> = emptyMap(),
        stdin: String? = null,
    ): String {
        val result = runGit(arguments, environment, stdin)
        check(result.exitCode == 0 && !result.timedOut) {
            "Git artifact integration command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
        return result.output
    }

    private suspend fun runGit(
        arguments: List<String>,
        environment: Map<String, String> = emptyMap(),
        stdin: String? = null,
    ): CommandResult = commandRunner.run(
        CommandRequest(
            command = listOf("git") + arguments,
            workingDirectory = normalizedRepositoryRoot,
            stdin = stdin,
            timeout = GIT_COMMAND_TIMEOUT,
            environment = environment,
        )
    )
}


private val GIT_OBJECT_PATTERN = Regex("(?:[0-9a-f]{40}|[0-9a-f]{64})")
private val GIT_COMMAND_TIMEOUT = 2.minutes
private const val INTEGRATION_REFERENCE_PREFIX = "refs/swarm-editor/integration-plans"
private const val INTEGRATION_AUTHOR_NAME = "Swarm Editor"
private const val INTEGRATION_AUTHOR_EMAIL = "swarm-editor@localhost"
private const val MAX_CONFLICT_DETAILS = 16 * 1024
