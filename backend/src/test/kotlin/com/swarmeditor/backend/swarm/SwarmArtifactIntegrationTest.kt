package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmTask
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
