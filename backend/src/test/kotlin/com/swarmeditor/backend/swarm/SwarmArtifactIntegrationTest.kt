package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmArtifactHunkApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import com.swarmeditor.common.model.SwarmVerificationEvidence
import com.swarmeditor.common.model.SwarmVerificationStatus
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmArtifactIntegrationTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `prepares a pinned integration plan from passed verification evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-integration")
        try {
            val fixture = createFixture(directory.toFile())
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "artifact.txt").writeText("artifact\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)

            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verificationId,
            )

            assertEquals(captured.evidence.afterTree, plan.integratedTree)
            assertEquals(plan.integratedRevision, git(fixture.repository, "rev-parse", plan.pinnedReference).trim())
            assertEquals("artifact", git(fixture.repository, "show", "${plan.integratedRevision}:artifact.txt").trim())
            assertEquals("base-current", git(fixture.repository, "show", "${plan.integratedRevision}:current.txt").trim())
            assertEquals("base-artifact", File(fixture.repository, "artifact.txt").readText().trim())
            val preview = fixture.integrator.preview(plan)
            assertEquals(listOf("artifact.txt"), preview.changedPaths.map { it.path })
            assertTrue(preview.unifiedDiff.contains("+artifact"))
            assertFalse(preview.truncated)
            assertEquals(1, preview.hunks.size)
            assertEquals(listOf(preview.hunks.single().id), preview.hunkDependencyComponents.single().hunkIds)
            assertFalse(preview.hunkDependencyComponents.single().cyclic)
            assertEquals(
                SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE,
                preview.hunkApplicability.single().status,
            )
            assertEquals(plan.currentTree, preview.hunkApplicability.single().checkedAgainstTree)
            val selection = fixture.integrator.previewSelection(plan, listOf(preview.hunks.single().id))
            assertEquals(SwarmArtifactSelectionApplicabilityStatus.APPLICABLE, selection.applicabilityStatus)
            assertEquals(listOf(preview.hunks.single().id), selection.requestedHunkIds)
            assertEquals(selection.requestedHunkIds, selection.effectiveHunkIds)
            assertTrue(selection.prerequisiteHunkIds.isEmpty())
            assertEquals(listOf("artifact.txt"), selection.changedPaths)
            assertEquals(plan.currentTree, selection.checkedAgainstTree)

            val applied = fixture.integrator.apply(plan)

            assertEquals(SwarmArtifactIntegrationStatus.APPLIED, applied.status)
            assertEquals("artifact", File(fixture.repository, "artifact.txt").readText().trim())
            assertEquals("base-current", File(fixture.repository, "current.txt").readText().trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `selection preview automatically includes symbol prerequisites`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-selection")
        try {
            val fixture = createFixture(directory.toFile())
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "Calculator.kt").writeText("fun calculateTotal() = 42\n")
                File(workspace.directory, "Usage.kt").writeText("val total = calculateTotal()\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)
            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verificationId,
            )
            val preview = fixture.integrator.preview(plan)
            val declarationHunk = preview.hunks.single { it.path == "Calculator.kt" }
            val usageHunk = preview.hunks.single { it.path == "Usage.kt" }

            val selection = fixture.integrator.previewSelection(plan, listOf(usageHunk.id))

            assertEquals(SwarmArtifactSelectionApplicabilityStatus.APPLICABLE, selection.applicabilityStatus)
            assertEquals(listOf(usageHunk.id), selection.requestedHunkIds)
            assertEquals(listOf(declarationHunk.id), selection.prerequisiteHunkIds)
            assertEquals(listOf(declarationHunk.id, usageHunk.id), selection.effectiveHunkIds)
            assertEquals(listOf("Calculator.kt", "Usage.kt"), selection.changedPaths)
            assertTrue(selection.unifiedDiff.contains("calculateTotal"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects a stale plan without changing the newer workspace`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-stale-plan")
        try {
            val fixture = createFixture(directory.toFile())
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "artifact.txt").writeText("artifact\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)
            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verificationId,
            )
            File(fixture.repository, "current.txt").writeText("newer user edit\n")

            assertFailsWith<SwarmArtifactIntegrationStaleException> {
                fixture.integrator.apply(plan)
            }

            assertEquals("base-artifact", File(fixture.repository, "artifact.txt").readText().trim())
            assertEquals("newer user edit", File(fixture.repository, "current.txt").readText().trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rolls back workspace patch when applied plan persistence fails`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-apply-rollback")
        try {
            val fixture = createFixture(directory.toFile())
            File(fixture.repository, "current.txt").writeText("preserved user edit\n")
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "artifact.txt").writeText("artifact\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)
            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verificationId,
            )

            assertFailsWith<IllegalStateException> {
                fixture.integrator.apply(plan) { error("persistence unavailable") }
            }

            assertEquals("base-artifact", File(fixture.repository, "artifact.txt").readText().trim())
            assertEquals("preserved user edit", File(fixture.repository, "current.txt").readText().trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `integrates a verified artifact built on dependency artifacts`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-dependency-base")
        try {
            val fixture = createFixture(directory.toFile())
            val baseline = checkNotNull(fixture.run.repositoryBaseline)
            val upstream = fixture.workspaceManager.withWorkspace(
                runId = fixture.run.id,
                taskId = fixture.task.id,
                attempt = fixture.task.attempt,
                baseRevision = baseline.revision,
            ) { workspace ->
                File(workspace.directory, "upstream.txt").writeText("upstream\n")
                fixture.deltaCapturer.capture(workspace)
            }
            val downstream = fixture.workspaceManager.withWorkspace(
                runId = fixture.run.id,
                taskId = fixture.task.id,
                attempt = fixture.task.attempt,
                baseRevision = checkNotNull(upstream.evidence.artifactRevision),
            ) { workspace ->
                assertEquals("upstream", File(workspace.directory, "upstream.txt").readText().trim())
                File(workspace.directory, "downstream.txt").writeText("downstream\n")
                fixture.deltaCapturer.capture(workspace)
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, downstream)

            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = downstream.id,
                verificationEvidenceId = verificationId,
            )

            assertEquals("upstream", git(fixture.repository, "show", "${plan.integratedRevision}:upstream.txt").trim())
            assertEquals(
                "downstream",
                git(fixture.repository, "show", "${plan.integratedRevision}:downstream.txt").trim(),
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `three way merges non overlapping current and artifact changes`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-three-way")
        try {
            val fixture = createFixture(directory.toFile())
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "artifact.txt").writeText("artifact\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)
            File(fixture.repository, "current.txt").writeText("current\n")

            val plan = fixture.integrator.prepare(
                run = fixture.run,
                task = fixture.task,
                workspaceDeltaEvidenceId = captured.id,
                verificationEvidenceId = verificationId,
            )

            assertEquals("artifact", git(fixture.repository, "show", "${plan.integratedRevision}:artifact.txt").trim())
            assertEquals("current", git(fixture.repository, "show", "${plan.integratedRevision}:current.txt").trim())
            assertEquals("current", File(fixture.repository, "current.txt").readText().trim())
            assertEquals("base-artifact", File(fixture.repository, "artifact.txt").readText().trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects conflicting current and artifact changes without pinning a plan`() = runTest {
        val directory = Files.createTempDirectory("swarm-artifact-conflict")
        try {
            val fixture = createFixture(directory.toFile())
            val captured = captureArtifact(fixture) { workspace ->
                File(workspace.directory, "artifact.txt").writeText("artifact\n")
            }
            val verificationId = storePassedVerification(fixture.evidenceStore, captured)
            File(fixture.repository, "artifact.txt").writeText("current\n")

            val error = assertFailsWith<SwarmArtifactMergeConflictException> {
                fixture.integrator.prepare(
                    run = fixture.run,
                    task = fixture.task,
                    workspaceDeltaEvidenceId = captured.id,
                    verificationEvidenceId = verificationId,
                )
            }

            assertEquals(fixture.run.id, error.runId)
            assertEquals(fixture.task.id, error.taskId)
            assertTrue(error.details.isNotBlank())
            assertFalse(referenceExists(fixture.repository, "refs/swarm-editor/integration-plans"))
            assertEquals("current", File(fixture.repository, "artifact.txt").readText().trim())
        } finally {
            directory.deleteRecursively()
        }
    }

    private suspend fun createFixture(root: File): Fixture {
        val repository = File(root, "repository").apply { mkdirs() }
        git(repository, "init")
        git(repository, "config", "user.email", "tests@swarm.local")
        git(repository, "config", "user.name", "Swarm Tests")
        File(repository, "artifact.txt").writeText("base-artifact\n")
        File(repository, "current.txt").writeText("base-current\n")
        git(repository, "add", ".")
        git(repository, "commit", "-m", "baseline")

        val snapshotter = GitContentAddressedSnapshotter(
            repositoryRoot = repository,
            indexRoot = File(root, "snapshot-indexes"),
        )
        val snapshot = snapshotter.snapshot()
        val task = SwarmTask(
            id = "implement",
            title = "Implement",
            prompt = "Change the artifact",
            attempt = 1,
        )
        val now = Clock.System.now()
        val run = SwarmRun(
            id = "run-test",
            title = "Run",
            objective = "Integrate a verified artifact",
            createdAt = now,
            updatedAt = now,
            repositoryBaseline = SwarmRepositoryBaseline(
                revision = snapshot.revision,
                baseRevision = snapshot.baseRevision,
                treeHash = snapshot.treeHash,
                dirty = snapshot.dirty,
                pinnedReference = snapshot.pinnedReference,
                capturedAt = now,
            ),
            tasks = listOf(task),
        )
        val evidenceStore = SwarmEvidenceStore(File(root, "evidence"))
        return Fixture(
            repository = repository,
            run = run,
            task = task,
            workspaceManager = GitSwarmTaskWorkspaceManager(repository, File(root, "worktrees")),
            deltaCapturer = GitSwarmWorkspaceDeltaCapturer(File(root, "task-indexes"), evidenceStore),
            evidenceStore = evidenceStore,
            integrator = GitSwarmArtifactIntegrator(repository, evidenceStore, snapshotter),
        )
    }

    private suspend fun captureArtifact(
        fixture: Fixture,
        mutate: (SwarmTaskWorkspace) -> Unit,
    ): StoredSwarmWorkspaceDelta {
        val baseline = checkNotNull(fixture.run.repositoryBaseline)
        return fixture.workspaceManager.withWorkspace(
            runId = fixture.run.id,
            taskId = fixture.task.id,
            attempt = fixture.task.attempt,
            baseRevision = baseline.revision,
        ) { workspace ->
            mutate(workspace)
            fixture.deltaCapturer.capture(workspace)
        }
    }

    private suspend fun storePassedVerification(
        store: SwarmEvidenceStore,
        captured: StoredSwarmWorkspaceDelta,
    ): String {
        val preflightId = store.putSandboxPreflight(
            SwarmSandboxPreflightReport(
                provider = "bubblewrap",
                providerVersion = "test",
                binarySha256 = "1".repeat(64),
                osName = "Linux",
                osVersion = "test",
                architecture = "x86_64",
                requiredProtections = emptySet(),
                activeProtections = emptySet(),
                policyVersion = "test-v1",
                policySha256 = "2".repeat(64),
                passed = true,
                createdAt = Clock.System.now(),
            )
        )
        val evidence = captured.evidence
        return store.putVerification(
            SwarmVerificationEvidence(
                runId = evidence.runId,
                taskId = evidence.taskId,
                attempt = evidence.attempt,
                workspaceDeltaEvidenceId = captured.id,
                sandboxPreflightEvidenceId = preflightId,
                status = SwarmVerificationStatus.PASSED,
                policyId = "test",
                policyVersion = "1",
                commandSha256 = "3".repeat(64),
                beforeTree = evidence.beforeTree,
                afterTree = evidence.afterTree,
                exitCode = 0,
                durationMillis = 1,
                environmentFingerprint = "4".repeat(64),
                verifierVersion = "test-v1",
                createdAt = Clock.System.now(),
            )
        )
    }

    private fun referenceExists(repository: File, prefix: String): Boolean {
        val process = ProcessBuilder("git", "for-each-ref", "--format=%(refname)", prefix)
            .directory(repository)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        check(process.waitFor() == 0) { output }
        return output.isNotBlank()
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

    private data class Fixture(
        val repository: File,
        val run: SwarmRun,
        val task: SwarmTask,
        val workspaceManager: GitSwarmTaskWorkspaceManager,
        val deltaCapturer: GitSwarmWorkspaceDeltaCapturer,
        val evidenceStore: SwarmEvidenceStore,
        val integrator: GitSwarmArtifactIntegrator,
    )
}
