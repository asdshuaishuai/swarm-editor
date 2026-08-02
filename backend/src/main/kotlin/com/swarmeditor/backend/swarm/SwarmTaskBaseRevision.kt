package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import java.io.File
import java.security.MessageDigest
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

fun interface SwarmTaskBaseRevisionResolver {
    suspend fun resolve(run: SwarmRun, task: SwarmTask): String
}

class SwarmDependencyArtifactConflictException(
    val runId: String,
    val taskId: String,
    val dependencyTaskIds: List<String>,
    val details: String,
) : IllegalStateException("Dependency artifacts conflict before task $taskId can start")

class SwarmRevisionContractViolationException(
    val runId: String,
    val taskId: String,
    val contractId: String,
    val details: String,
) : IllegalStateException("Revision contract $contractId does not match the resolved source artifact: $details")

class GitDependencyAwareSwarmTaskBaseRevisionResolver(
    private val repositoryRoot: File,
    private val evidenceStore: SwarmEvidenceStore,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) : SwarmTaskBaseRevisionResolver {
    private val mutex = Mutex()
    private val normalizedRepositoryRoot = repositoryRoot.canonicalFile

    init {
        require(File(normalizedRepositoryRoot, ".git").exists()) { "Dependency artifact repository must be a Git worktree" }
    }

    override suspend fun resolve(run: SwarmRun, task: SwarmTask): String = mutex.withLock {
        val baseline = requireNotNull(run.repositoryBaseline) { "Swarm run has no repository baseline" }
        val resolvedRevision = if (task.dependsOn.isEmpty()) {
            baseline.revision
        } else {
            val tasksById = run.tasks.associateBy(SwarmTask::id)
            val dependencyRevisions = task.dependsOn.map { dependencyId ->
                val dependency = requireNotNull(tasksById[dependencyId]) { "Missing dependency task: $dependencyId" }
                val successfulAttempt = dependency.attemptRecords.lastOrNull { attempt ->
                    attempt.outcome == SwarmTaskAttemptOutcome.SUCCEEDED && attempt.workspaceDeltaEvidenceId != null
                } ?: error("Dependency $dependencyId has no successful workspace artifact")
                task.revisionContract
                    ?.takeIf { it.sourceTaskId == dependencyId && it.sourceAttempt != successfulAttempt.attempt }
                    ?.let { contract ->
                        throw SwarmRevisionContractViolationException(
                            runId = run.id,
                            taskId = task.id,
                            contractId = contract.id,
                            details = "expected source attempt ${contract.sourceAttempt}, resolved ${successfulAttempt.attempt}",
                        )
                    }
                val evidenceId = checkNotNull(successfulAttempt.workspaceDeltaEvidenceId)
                val evidence = requireNotNull(evidenceStore.getWorkspaceDelta(evidenceId)) {
                    "Dependency workspace evidence is missing: $evidenceId"
                }
                require(evidence.runId == run.id && evidence.taskId == dependency.id) {
                    "Dependency workspace evidence does not belong to this run"
                }
                require(evidence.attempt == successfulAttempt.attempt) { "Dependency workspace attempt does not match" }
                require(evidence.ownershipCompliant != false) { "Dependency artifact violates declared write ownership" }
                val revision = requireNotNull(evidence.artifactRevision) { "Dependency artifact revision is missing" }
                val reference = requireNotNull(evidence.pinnedReference) { "Dependency artifact reference is missing" }
                require(runGitOutput(listOf("rev-parse", "--verify", "$reference^{commit}")).trim() == revision) {
                    "Dependency artifact reference no longer resolves to its revision"
                }
                require(isAncestor(baseline.revision, revision)) { "Dependency artifact is outside the run baseline lineage" }
                revision
            }.distinct()
            dependencyRevisions.drop(1).fold(dependencyRevisions.first()) { merged, revision ->
                mergeDependencyRevisions(run, task, merged, revision)
            }
        }
        enforceRevisionContract(run, task, resolvedRevision)
        resolvedRevision
    }

    private suspend fun enforceRevisionContract(run: SwarmRun, task: SwarmTask, resolvedRevision: String) {
        val contract = task.revisionContract ?: return
        if (resolvedRevision != contract.sourceArtifactRevision) {
            throw SwarmRevisionContractViolationException(
                runId = run.id,
                taskId = task.id,
                contractId = contract.id,
                details = "expected revision ${contract.sourceArtifactRevision}, resolved $resolvedRevision",
            )
        }
        val resolvedTree = runGitOutput(listOf("rev-parse", "$resolvedRevision^{tree}")).trim()
        if (resolvedTree != contract.sourceArtifactTree) {
            throw SwarmRevisionContractViolationException(
                runId = run.id,
                taskId = task.id,
                contractId = contract.id,
                details = "expected tree ${contract.sourceArtifactTree}, resolved $resolvedTree",
            )
        }
    }

    private suspend fun mergeDependencyRevisions(
        run: SwarmRun,
        task: SwarmTask,
        firstRevision: String,
        secondRevision: String,
    ): String {
        if (isAncestor(firstRevision, secondRevision)) return secondRevision
        if (isAncestor(secondRevision, firstRevision)) return firstRevision
        val merge = runGit(listOf("merge-tree", "--write-tree", firstRevision, secondRevision))
        if (merge.exitCode == 1) {
            throw SwarmDependencyArtifactConflictException(
                runId = run.id,
                taskId = task.id,
                dependencyTaskIds = task.dependsOn,
                details = merge.output.take(MAX_CONFLICT_DETAILS),
            )
        }
        check(merge.exitCode == 0 && !merge.timedOut) { "Git dependency merge failed: ${merge.output}" }
        val tree = merge.output.lineSequence().firstOrNull()?.trim().orEmpty()
        require(tree.matches(GIT_OBJECT_PATTERN)) { "Git dependency merge did not produce a tree" }
        val timestamp = now()
        val gitDate = "@${timestamp.epochSeconds} +0000"
        val revision = runGitOutput(
            arguments = listOf(
                "commit-tree", tree,
                "-p", firstRevision,
                "-p", secondRevision,
            ),
            stdin = "Swarm dependency base ${run.id}/${task.id}\n",
            environment = mapOf(
                "GIT_AUTHOR_NAME" to DEPENDENCY_BASE_AUTHOR_NAME,
                "GIT_AUTHOR_EMAIL" to DEPENDENCY_BASE_AUTHOR_EMAIL,
                "GIT_AUTHOR_DATE" to gitDate,
                "GIT_COMMITTER_NAME" to DEPENDENCY_BASE_AUTHOR_NAME,
                "GIT_COMMITTER_EMAIL" to DEPENDENCY_BASE_AUTHOR_EMAIL,
                "GIT_COMMITTER_DATE" to gitDate,
            ),
        ).trim()
        require(revision.matches(GIT_OBJECT_PATTERN)) { "Git dependency merge did not create a commit" }
        val reference = "$DEPENDENCY_BASE_REFERENCE_PREFIX/${sha256(run.id + "\u0000" + task.id + "\u0000" + revision)}"
        runGitOutput(listOf("update-ref", reference, revision))
        return revision
    }

    private suspend fun isAncestor(ancestor: String, descendant: String): Boolean {
        val result = runGit(listOf("merge-base", "--is-ancestor", ancestor, descendant))
        check(!result.timedOut && result.exitCode in setOf(0, 1)) {
            "Git ancestry check failed: ${result.output}"
        }
        return result.exitCode == 0
    }

    private suspend fun runGitOutput(
        arguments: List<String>,
        stdin: String? = null,
        environment: Map<String, String> = emptyMap(),
    ): String {
        val result = runGit(arguments, stdin, environment)
        check(result.exitCode == 0 && !result.timedOut) {
            "Git dependency artifact command failed: git ${arguments.joinToString(" ")}\n${result.output}"
        }
        return result.output
    }

    private suspend fun runGit(
        arguments: List<String>,
        stdin: String? = null,
        environment: Map<String, String> = emptyMap(),
    ): CommandResult = commandRunner.run(
        CommandRequest(
            command = listOf("git") + arguments,
            workingDirectory = normalizedRepositoryRoot,
            stdin = stdin,
            environment = environment,
            timeout = 2.minutes,
            maxOutputChars = 512 * 1024,
        )
    )
}

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

private const val DEPENDENCY_BASE_REFERENCE_PREFIX = "refs/swarm-editor/dependency-bases"
private const val DEPENDENCY_BASE_AUTHOR_NAME = "Swarm Editor Dependencies"
private const val DEPENDENCY_BASE_AUTHOR_EMAIL = "dependencies@swarm-editor.local"
private const val MAX_CONFLICT_DETAILS = 16 * 1024
private val GIT_OBJECT_PATTERN = Regex("(?:[0-9a-f]{40}|[0-9a-f]{64})")
