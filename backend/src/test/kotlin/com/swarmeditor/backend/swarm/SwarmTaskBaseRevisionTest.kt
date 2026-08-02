package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRevisionContract
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskAttemptRecord
import com.swarmeditor.common.model.SwarmTaskStatus
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmTaskBaseRevisionTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `single dependency artifact becomes the downstream task base`() = runTest {
        val root = Files.createTempDirectory("swarm-dependency-single")
        try {
            val fixture = Fixture.create(root.toFile())
            val dependency = fixture.capture("first") { workspace ->
                File(workspace.directory, "a.txt").writeText("first\n")
            }
            val downstream = fixture.pendingTask("second", dependsOn = listOf(dependency.id))
            val run = fixture.run(listOf(dependency, downstream))

            val revision = fixture.resolver.resolve(run, downstream)
            val evidenceId = dependency.attemptRecords.single().workspaceDeltaEvidenceId!!
            assertEquals(fixture.evidenceStore.getWorkspaceDelta(evidenceId)?.artifactRevision, revision)
            assertEquals("first", git(fixture.repository, "show", "$revision:a.txt").trim())
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `revision contract is enforced against the exact dependency artifact`() = runTest {
        val root = Files.createTempDirectory("swarm-revision-contract")
        try {
            val fixture = Fixture.create(root.toFile())
            val dependency = fixture.capture("source") { workspace ->
                File(workspace.directory, "a.txt").writeText("verified source\n")
            }
            val evidenceId = dependency.attemptRecords.single().workspaceDeltaEvidenceId!!
            val evidence = fixture.evidenceStore.getWorkspaceDelta(evidenceId) ?: error("evidence missing")
            val contract = SwarmArtifactRevisionContract(
                id = "revision-contract-test",
                sourcePlanId = "integration-test",
                sourceTaskId = dependency.id,
                sourceAttempt = dependency.attempt,
                sourceArtifactRevision = evidence.artifactRevision ?: error("revision missing"),
                sourceArtifactTree = evidence.afterTree,
                rejectionReason = SwarmArtifactRejectionReason.ROOT_CAUSE_NOT_FIXED,
                targetHunkIds = listOf("hunk-${"a".repeat(20)}"),
                targetPaths = listOf("a.txt"),
                createdAt = Clock.System.now(),
            )
            val revisionTask = fixture.pendingTask("revision", dependsOn = listOf(dependency.id)).copy(
                revisionContract = contract,
            )
            val run = fixture.run(listOf(dependency, revisionTask))

            assertEquals(contract.sourceArtifactRevision, fixture.resolver.resolve(run, revisionTask))

            val staleTask = revisionTask.copy(
                revisionContract = contract.copy(sourceArtifactTree = "0".repeat(40)),
            )
            assertFailsWith<SwarmRevisionContractViolationException> {
                fixture.resolver.resolve(fixture.run(listOf(dependency, staleTask)), staleTask)
            }
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `multiple independent dependency artifacts merge into one pinned base`() = runTest {
        val root = Files.createTempDirectory("swarm-dependency-merge")
        try {
            val fixture = Fixture.create(root.toFile())
            val first = fixture.capture("first") { workspace ->
                File(workspace.directory, "a.txt").writeText("first\n")
            }
            val second = fixture.capture("second") { workspace ->
                File(workspace.directory, "b.txt").writeText("second\n")
            }
            val downstream = fixture.pendingTask("integrate", dependsOn = listOf(first.id, second.id))
            val run = fixture.run(listOf(first, second, downstream))

            val revision = fixture.resolver.resolve(run, downstream)

            assertEquals("first", git(fixture.repository, "show", "$revision:a.txt").trim())
            assertEquals("second", git(fixture.repository, "show", "$revision:b.txt").trim())
            assertEquals(2, git(fixture.repository, "show", "-s", "--format=%P", revision).trim().split(' ').size)
            assertTrue(
                git(fixture.repository, "for-each-ref", "--format=%(objectname)", "refs/swarm-editor/dependency-bases")
                    .lineSequence()
                    .any { it.trim() == revision }
            )
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `conflicting dependency artifacts fail before downstream execution`() = runTest {
        val root = Files.createTempDirectory("swarm-dependency-conflict")
        try {
            val fixture = Fixture.create(root.toFile())
            val first = fixture.capture("first") { workspace ->
                File(workspace.directory, "shared.txt").writeText("first\n")
            }
            val second = fixture.capture("second") { workspace ->
                File(workspace.directory, "shared.txt").writeText("second\n")
            }
            val downstream = fixture.pendingTask("integrate", dependsOn = listOf(first.id, second.id))
            val run = fixture.run(listOf(first, second, downstream))

            val error = assertFailsWith<SwarmDependencyArtifactConflictException> {
                fixture.resolver.resolve(run, downstream)
            }

            assertEquals(listOf("first", "second"), error.dependencyTaskIds)
            assertTrue(error.details.isNotBlank())
        } finally {
            root.deleteRecursively()
        }
    }

    private class Fixture(
        val repository: File,
        val evidenceStore: SwarmEvidenceStore,
        val manager: GitSwarmTaskWorkspaceManager,
        val capturer: GitSwarmWorkspaceDeltaCapturer,
        val resolver: GitDependencyAwareSwarmTaskBaseRevisionResolver,
        val baseline: SwarmRepositoryBaseline,
    ) {
        suspend fun capture(taskId: String, mutate: (SwarmTaskWorkspace) -> Unit): SwarmTask {
            val task = pendingTask(taskId).copy(
                attempt = 1,
                writePaths = listOf("**"),
            )
            val captured = manager.withWorkspace(
                runId = RUN_ID,
                taskId = task.id,
                attempt = task.attempt,
                baseRevision = baseline.revision,
            ) { workspace ->
                mutate(workspace)
                capturer.capture(workspace, task)
            }
            val timestamp = Clock.System.now()
            return task.copy(
                status = SwarmTaskStatus.SUCCEEDED,
                startedAt = timestamp,
                completedAt = timestamp,
                attemptRecords = listOf(
                    SwarmTaskAttemptRecord(
                        id = "$taskId-attempt-1",
                        schedulingDecisionId = "schedule-0001",
                        attempt = 1,
                        outcome = SwarmTaskAttemptOutcome.SUCCEEDED,
                        startedAt = timestamp,
                        completedAt = timestamp,
                        workspaceDeltaEvidenceId = captured.id,
                    )
                ),
            )
        }

        fun pendingTask(id: String, dependsOn: List<String> = emptyList()) = SwarmTask(
            id = id,
            title = id,
            prompt = "Complete $id",
            dependsOn = dependsOn,
        )

        fun run(tasks: List<SwarmTask>): SwarmRun {
            val timestamp = Clock.System.now()
            return SwarmRun(
                id = RUN_ID,
                title = "Dependency artifacts",
                objective = "Connect dependency code changes",
                createdAt = timestamp,
                updatedAt = timestamp,
                repositoryBaseline = baseline,
                tasks = tasks,
            )
        }

        companion object {
            fun create(root: File): Fixture {
                val repository = File(root, "repository").apply { mkdirs() }
                git(repository, "init")
                git(repository, "config", "user.email", "tests@swarm.local")
                git(repository, "config", "user.name", "Swarm Tests")
                File(repository, "a.txt").writeText("base-a\n")
                File(repository, "b.txt").writeText("base-b\n")
                File(repository, "shared.txt").writeText("base-shared\n")
                git(repository, "add", ".")
                git(repository, "commit", "-m", "baseline")
                val revision = git(repository, "rev-parse", "HEAD").trim()
                val tree = git(repository, "rev-parse", "HEAD^{tree}").trim()
                val timestamp = Clock.System.now()
                val baseline = SwarmRepositoryBaseline(
                    revision = revision,
                    baseRevision = revision,
                    treeHash = tree,
                    dirty = false,
                    capturedAt = timestamp,
                )
                val evidenceStore = SwarmEvidenceStore(File(root, "evidence"))
                return Fixture(
                    repository = repository,
                    evidenceStore = evidenceStore,
                    manager = GitSwarmTaskWorkspaceManager(repository, File(root, "worktrees")),
                    capturer = GitSwarmWorkspaceDeltaCapturer(File(root, "indexes"), evidenceStore),
                    resolver = GitDependencyAwareSwarmTaskBaseRevisionResolver(repository, evidenceStore),
                    baseline = baseline,
                )
            }
        }
    }

    private companion object {
        const val RUN_ID = "run-dependencies"
    }
}

private fun git(directory: File, vararg arguments: String): String {
    val process = ProcessBuilder(listOf("git") + arguments)
        .directory(directory)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText()
    check(process.waitFor() == 0) { "git ${arguments.joinToString(" ")} failed: $output" }
    return output
}
