package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmArtifactHunkApplicability
import com.swarmeditor.common.model.SwarmArtifactHunkApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactIntegrationPlan
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmVerificationStatus
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class SwarmArtifactMergeConflictException(
    val runId: String,
    val taskId: String,
    val details: String,
) : IllegalStateException("Verified task artifact conflicts with the current repository state")

class SwarmArtifactIntegrationStaleException(
    val planId: String,
) : IllegalStateException("Artifact integration plan $planId is stale; prepare a new review plan")

interface SwarmArtifactIntegrator {
    suspend fun prepare(
        run: SwarmRun,
        task: SwarmTask,
        workspaceDeltaEvidenceId: String,
        verificationEvidenceId: String,
    ): SwarmArtifactIntegrationPlan

    suspend fun apply(
        plan: SwarmArtifactIntegrationPlan,
        persist: suspend (SwarmArtifactIntegrationPlan) -> Unit = {},
    ): SwarmArtifactIntegrationPlan

    suspend fun preview(plan: SwarmArtifactIntegrationPlan): SwarmArtifactIntegrationPreview

    suspend fun previewSelection(
        plan: SwarmArtifactIntegrationPlan,
        selectedHunkIds: Collection<String>,
    ): SwarmArtifactSelectionPreview = error("Artifact selection preview is not configured")

    suspend fun releasePreparedPlan(plan: SwarmArtifactIntegrationPlan)
}

class GitSwarmArtifactIntegrator(
    private val repositoryRoot: File,
    private val evidenceStore: SwarmEvidenceStore,
    private val repositorySnapshotter: SwarmRepositorySnapshotter,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val now: () -> Instant = { Clock.System.now() },
) : SwarmArtifactIntegrator {
    private val integrationMutex = Mutex()
    private val normalizedRepositoryRoot = repositoryRoot.canonicalFile
    private val hunkApplicabilityChecker = GitSwarmArtifactHunkApplicabilityChecker(
        repositoryRoot = normalizedRepositoryRoot,
        commandRunner = commandRunner,
    )

    override suspend fun prepare(
        run: SwarmRun,
        task: SwarmTask,
        workspaceDeltaEvidenceId: String,
        verificationEvidenceId: String,
    ): SwarmArtifactIntegrationPlan = integrationMutex.withLock {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm artifact preparation")
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
        val artifactRevision = requireNotNull(workspace.artifactRevision) {
            "Workspace evidence has no durable artifact revision"
        }
        val artifactReference = requireNotNull(workspace.pinnedReference) {
            "Workspace evidence has no durable artifact reference"
        }

        requireCommitTree(baseline.revision, baseline.treeHash, "run baseline")
        requireCommitTree(workspace.baseRevision, workspace.beforeTree, "task dependency base")
        require(isAncestor(baseline.revision, workspace.baseRevision)) {
            "Task dependency base is outside the run baseline lineage"
        }
        requireCommitTree(artifactRevision, workspace.afterTree, "task artifact")
        require(runGitOutput(listOf("rev-parse", "--verify", "$artifactReference^{commit}")).trim() == artifactRevision) {
            "Task artifact reference no longer resolves to the recorded revision"
        }
        require(runGitOutput(listOf("rev-parse", "$artifactRevision^")).trim() == workspace.baseRevision) {
            "Task artifact parent does not match its dependency base"
        }

        val mergeArtifactRevision = if (workspace.baseRevision == baseline.revision) {
            artifactRevision
        } else {
            createCommit(
                tree = workspace.afterTree,
                parents = listOf(baseline.revision),
                message = "Swarm full artifact side ${run.id}/${task.id}/${task.attempt}\n",
            )
        }

        val current = repositorySnapshotter.snapshot()
        requireCommitTree(current.revision, current.treeHash, "current repository snapshot")
        val integratedTree = mergeTrees(
            baselineRevision = baseline.revision,
            baselineTree = baseline.treeHash,
            currentTree = current.treeHash,
            artifactRevision = mergeArtifactRevision,
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
            id = "integration-${sha256("${run.id}\u0000${task.id}\u0000${task.attempt}\u0000$integratedRevision").take(24)}",
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
            createdAt = now(),
        )
    }

    override suspend fun apply(
        plan: SwarmArtifactIntegrationPlan,
        persist: suspend (SwarmArtifactIntegrationPlan) -> Unit,
    ): SwarmArtifactIntegrationPlan = integrationMutex.withLock {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm artifact application")
        require(plan.status == SwarmArtifactIntegrationStatus.PREPARED) {
            "Only prepared artifact integration plans can be applied"
        }
        requirePinnedPlan(plan)
        val current = repositorySnapshotter.snapshot()
        if (current.revision != plan.currentRevision || current.treeHash != plan.currentTree) {
            throw SwarmArtifactIntegrationStaleException(plan.id)
        }
        if (plan.currentTree == plan.integratedTree) {
            return@withLock plan.copy(
                status = SwarmArtifactIntegrationStatus.APPLIED,
                appliedAt = now(),
            ).also { persist(it) }
        }

        val patchFile = Files.createTempFile("swarm-integration-", ".patch").toFile()
        var patchApplied = false
        try {
            runGitOutput(
                listOf(
                    "diff",
                    "--binary",
                    "--full-index",
                    "--output=${patchFile.absolutePath}",
                    plan.currentTree,
                    plan.integratedTree,
                    "--",
                )
            )
            runGitOutput(listOf("apply", "--check", "--whitespace=nowarn", patchFile.absolutePath))
            runGitOutput(listOf("apply", "--whitespace=nowarn", patchFile.absolutePath))
            patchApplied = true
            val appliedSnapshot = repositorySnapshotter.snapshot()
            check(appliedSnapshot.treeHash == plan.integratedTree) {
                "Applied artifact tree does not match the reviewed integration plan"
            }
            val applied = plan.copy(
                status = SwarmArtifactIntegrationStatus.APPLIED,
                appliedAt = now(),
            )
            persist(applied)
            applied
        } catch (error: CancellationException) {
            if (patchApplied) rollbackPatch(patchFile, plan.currentTree, error)
            throw error
        } catch (error: Throwable) {
            if (patchApplied) rollbackPatch(patchFile, plan.currentTree, error)
            throw error
        } finally {
            withContext(NonCancellable + Dispatchers.IO) { patchFile.delete() }
        }
    }

    suspend fun apply(plan: SwarmArtifactIntegrationPlan): SwarmArtifactIntegrationPlan = apply(plan) { }

    override suspend fun preview(plan: SwarmArtifactIntegrationPlan): SwarmArtifactIntegrationPreview =
        integrationMutex.withLock {
            requireGitWorktree(normalizedRepositoryRoot, "Swarm artifact preview")
            previewLocked(plan, includeHunkApplicability = true)
        }

    override suspend fun previewSelection(
        plan: SwarmArtifactIntegrationPlan,
        selectedHunkIds: Collection<String>,
    ): SwarmArtifactSelectionPreview = integrationMutex.withLock {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm artifact selection preview")
        val preview = previewLocked(plan, includeHunkApplicability = false)
        require(!preview.truncated) { "Cannot preview a partial selection from a truncated diff" }
        val requestedHunkIds = selectedHunkIds.distinct()
        require(requestedHunkIds.isNotEmpty()) { "Artifact selection cannot be empty" }
        require(requestedHunkIds.size <= MAX_SELECTION_HUNKS) { "Artifact selection contains too many hunks" }
        val hunksById = preview.hunks.associateBy { it.id }
        require(requestedHunkIds.all(hunksById::containsKey)) { "Artifact selection contains an unknown hunk" }
        val prerequisiteHunkIds = SwarmArtifactRiskAnalyzer.prerequisiteClosure(
            preview.hunkDependencies,
            requestedHunkIds,
        )
        val effectiveSet = (requestedHunkIds + prerequisiteHunkIds).toSet()
        val effectiveHunkIds = preview.hunks.map { it.id }.filter(effectiveSet::contains)
        val effectiveHunks = effectiveHunkIds.map(hunksById::getValue)
        val selectedDiff = extractSelectedHunkPatch(
            unifiedDiff = preview.unifiedDiff,
            hunks = preview.hunks,
            selectedHunkIds = effectiveSet,
        ).orEmpty()
        val applicabilityStatus = hunkApplicabilityChecker.checkSelection(
            baseTree = plan.currentTree,
            unifiedDiff = preview.unifiedDiff,
            hunks = preview.hunks,
            selectedHunkIds = effectiveSet,
        )
        SwarmArtifactSelectionPreview(
            planId = plan.id,
            requestedHunkIds = requestedHunkIds,
            prerequisiteHunkIds = prerequisiteHunkIds,
            effectiveHunkIds = effectiveHunkIds,
            changedPaths = effectiveHunks.map { it.path }.distinct(),
            unifiedDiff = selectedDiff,
            applicabilityStatus = applicabilityStatus,
            checkedAgainstTree = plan.currentTree.takeIf {
                applicabilityStatus == SwarmArtifactSelectionApplicabilityStatus.APPLICABLE ||
                    applicabilityStatus == SwarmArtifactSelectionApplicabilityStatus.NOT_APPLICABLE
            },
        )
    }

    private suspend fun previewLocked(
        plan: SwarmArtifactIntegrationPlan,
        includeHunkApplicability: Boolean,
    ): SwarmArtifactIntegrationPreview {
        requirePinnedPlan(plan)
        val workspace = checkNotNull(evidenceStore.getWorkspaceDelta(plan.workspaceDeltaEvidenceId)) {
            "Integration workspace evidence is missing"
        }
        val result = runGit(
            arguments = listOf(
                "diff",
                "--no-ext-diff",
                "--no-color",
                "--unified=3",
                plan.currentTree,
                plan.integratedTree,
                "--",
            ),
            maxOutputChars = MAX_PREVIEW_DIFF_CHARS,
        )
        check(result.exitCode == 0 && !result.timedOut) {
            "Git integration preview failed: ${result.output}"
        }
        val truncated = result.output.length >= MAX_PREVIEW_DIFF_CHARS
        val hunks = SwarmArtifactRiskAnalyzer.analyze(result.output)
        val hunkDependencies = SwarmArtifactRiskAnalyzer.dependencies(hunks)
        val hunkApplicability = if (!includeHunkApplicability) {
            emptyList()
        } else if (truncated) {
            hunks.map { hunk ->
                SwarmArtifactHunkApplicability(
                    hunkId = hunk.id,
                    status = SwarmArtifactHunkApplicabilityStatus.SKIPPED_TRUNCATED_PREVIEW,
                )
            }
        } else {
            hunkApplicabilityChecker.check(
                baseTree = plan.currentTree,
                unifiedDiff = result.output,
                hunks = hunks,
            )
        }
        return SwarmArtifactIntegrationPreview(
            planId = plan.id,
            runId = plan.runId,
            taskId = plan.taskId,
            status = plan.status,
            verificationEvidenceId = plan.verificationEvidenceId,
            currentRevision = plan.currentRevision,
            integratedRevision = plan.integratedRevision,
            changedPaths = workspace.changedPaths,
            unifiedDiff = result.output,
            truncated = truncated,
            hunks = hunks,
            hunkDependencies = hunkDependencies,
            hunkDependencyComponents = SwarmArtifactRiskAnalyzer.dependencyComponents(hunks, hunkDependencies),
            hunkApplicability = hunkApplicability,
        )
    }

    override suspend fun releasePreparedPlan(plan: SwarmArtifactIntegrationPlan) = integrationMutex.withLock {
        requireGitWorktree(normalizedRepositoryRoot, "Swarm artifact cleanup")
        require(plan.status == SwarmArtifactIntegrationStatus.PREPARED) {
            "Only prepared artifact integration plans can be released"
        }
        val resolved = runGit(listOf("rev-parse", "--verify", "${plan.pinnedReference}^{commit}"))
        if (resolved.exitCode == 1) return@withLock
        check(!resolved.timedOut && resolved.exitCode == 0) {
            "Git integration reference lookup failed: ${resolved.output}"
        }
        require(resolved.output.trim() == plan.integratedRevision) {
            "Integration plan reference points to an unexpected revision"
        }
        runGitOutput(listOf("update-ref", "-d", plan.pinnedReference, plan.integratedRevision))
    }

    private suspend fun rollbackPatch(
        patchFile: File,
        expectedTree: String,
        originalError: Throwable,
    ) = withContext(NonCancellable) {
        try {
            runGitOutput(listOf("apply", "--reverse", "--whitespace=nowarn", patchFile.absolutePath))
            check(repositorySnapshotter.snapshot().treeHash == expectedTree) {
                "Artifact integration rollback did not restore the reviewed repository state"
            }
        } catch (rollbackError: Throwable) {
            originalError.addSuppressed(rollbackError)
        }
    }

    private suspend fun requirePinnedPlan(plan: SwarmArtifactIntegrationPlan) {
        requireCommitTree(plan.integratedRevision, plan.integratedTree, "integration plan")
        require(runGitOutput(listOf("rev-parse", "--verify", "${plan.pinnedReference}^{commit}")).trim() == plan.integratedRevision) {
            "Integration plan reference no longer resolves to the reviewed revision"
        }
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
        val timestamp = now()
        val gitDate = "@${timestamp.epochSeconds} +0000"
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

    private suspend fun isAncestor(ancestor: String, descendant: String): Boolean {
        val result = runGit(listOf("merge-base", "--is-ancestor", ancestor, descendant))
        check(!result.timedOut && result.exitCode in setOf(0, 1)) {
            "Git artifact ancestry check failed: ${result.output}"
        }
        return result.exitCode == 0
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
        maxOutputChars: Int = 256 * 1024,
    ): CommandResult = commandRunner.run(
        CommandRequest(
            command = listOf("git") + arguments,
            workingDirectory = normalizedRepositoryRoot,
            stdin = stdin,
            timeout = GIT_COMMAND_TIMEOUT,
            environment = environment,
            maxOutputChars = maxOutputChars,
        )
    )
}

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private val GIT_OBJECT_PATTERN = Regex("(?:[0-9a-f]{40}|[0-9a-f]{64})")
private val GIT_COMMAND_TIMEOUT = 2.minutes
private const val MAX_PREVIEW_DIFF_CHARS = 512 * 1024
private const val MAX_SELECTION_HUNKS = 20_000
private const val INTEGRATION_REFERENCE_PREFIX = "refs/swarm-editor/integration-plans"
private const val INTEGRATION_AUTHOR_NAME = "Swarm Editor"
private const val INTEGRATION_AUTHOR_EMAIL = "swarm-editor@localhost"
private const val MAX_CONFLICT_DETAILS = 16 * 1024
