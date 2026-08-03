package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmVerificationStatus
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmTaskIsolationIntegrationTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `executor runs pi inside a worktree and persists compliant ownership evidence`() = runTest {
        val root = Files.createTempDirectory("swarm-executor-isolated")
        try {
            val fixture = fixture(root.toFile()) { workingDirectory ->
                File(workingDirectory, "allowed.txt").writeText("changed\n")
                "implemented"
            }
            val task = fixture.task.copy(
                readPaths = listOf("**"),
                writePaths = listOf("allowed.txt"),
            )

            val execution = fixture.executor.execute(fixture.run.copy(tasks = listOf(task)), task)

            assertEquals("implemented", execution.output)
            assertEquals(1, execution.changedFileCount)
            val evidence = assertNotNull(execution.workspaceDeltaEvidenceId)
                .let { fixture.evidenceStore.getWorkspaceDelta(it) }
            assertNotNull(evidence)
            assertEquals(true, evidence.ownershipCompliant)
            assertEquals(listOf("allowed.txt"), evidence.changedPaths.map { it.path })
            assertEquals(listOf("allowed.txt"), evidence.declaredWritePaths)
            assertTrue(evidence.ownershipViolations.isEmpty())
            assertEquals("base", File(fixture.repository, "allowed.txt").readText().trim())
            assertTrue(fixture.worktreeRoot.listFiles().orEmpty().isEmpty())
            assertContains(fixture.prompt(), "the resulting Git delta is audited")
            assertContains(fixture.config().workingDirectory, fixture.worktreeRoot.canonicalPath)
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `executor rejects and records changes outside declared write ownership`() = runTest {
        val root = Files.createTempDirectory("swarm-executor-ownership")
        try {
            val fixture = fixture(root.toFile()) { workingDirectory ->
                File(workingDirectory, "forbidden.txt").writeText("unexpected\n")
                "done"
            }
            val task = fixture.task.copy(
                readPaths = listOf("**"),
                writePaths = listOf("allowed.txt"),
            )

            val error = assertFailsWith<SwarmTaskExecutionException> {
                fixture.executor.execute(fixture.run.copy(tasks = listOf(task)), task)
            }

            val violation = assertIs<SwarmOwnershipViolationException>(error.cause)
            assertEquals(task.id, violation.taskId)
            assertEquals(SwarmVerificationStatus.FAILED, error.verificationStatus)
            assertEquals(1, error.changedFileCount)
            val evidence = assertNotNull(error.workspaceDeltaEvidenceId)
                .let { fixture.evidenceStore.getWorkspaceDelta(it) }
            assertNotNull(evidence)
            assertEquals(false, evidence.ownershipCompliant)
            assertEquals(listOf("forbidden.txt"), evidence.ownershipViolations.map { it.path })
            assertFalse(File(fixture.repository, "forbidden.txt").exists())
            assertTrue(fixture.worktreeRoot.listFiles().orEmpty().isEmpty())
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `executor verifies captured task artifact before releasing worktree`() = runTest {
        val root = Files.createTempDirectory("swarm-executor-verification-pass")
        try {
            val fixture = fixture(root.toFile()) { workingDirectory ->
                File(workingDirectory, "allowed.txt").writeText("changed\n")
                "implemented"
            }
            val task = fixture.task.copy(
                writePaths = listOf("allowed.txt"),
                verificationCommands = listOf(listOf("grep", "-qx", "changed", "allowed.txt")),
            )

            val execution = fixture.executor.execute(fixture.run.copy(tasks = listOf(task)), task)

            assertEquals(SwarmVerificationStatus.PASSED, execution.verificationStatus)
            val verification = assertNotNull(execution.verificationEvidenceId)
                .let { fixture.evidenceStore.getVerification(it) }
            assertNotNull(verification)
            assertEquals(SwarmVerificationStatus.PASSED, verification.status)
            assertEquals(execution.workspaceDeltaEvidenceId, verification.workspaceDeltaEvidenceId)
            assertTrue(fixture.worktreeRoot.listFiles().orEmpty().isEmpty())
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `executor persists failed verification and rejects task result`() = runTest {
        val root = Files.createTempDirectory("swarm-executor-verification-fail")
        try {
            val fixture = fixture(root.toFile()) { workingDirectory ->
                File(workingDirectory, "allowed.txt").writeText("changed\n")
                "implemented"
            }
            val task = fixture.task.copy(
                writePaths = listOf("allowed.txt"),
                verificationCommands = listOf(listOf("grep", "-qx", "missing", "allowed.txt")),
            )

            val error = assertFailsWith<SwarmTaskExecutionException> {
                fixture.executor.execute(fixture.run.copy(tasks = listOf(task)), task)
            }

            assertIs<SwarmTaskVerificationFailedException>(error.cause)
            assertEquals(SwarmVerificationStatus.FAILED, error.verificationStatus)
            val verification = assertNotNull(error.verificationEvidenceId)
                .let { fixture.evidenceStore.getVerification(it) }
            assertNotNull(verification)
            assertEquals(SwarmVerificationStatus.FAILED, verification.status)
            assertEquals(error.workspaceDeltaEvidenceId, verification.workspaceDeltaEvidenceId)
            assertTrue(fixture.worktreeRoot.listFiles().orEmpty().isEmpty())
        } finally {
            root.deleteRecursively()
        }
    }

    private fun fixture(
        root: File,
        action: (File) -> String,
    ): Fixture {
        val repository = File(root, "repository").apply { mkdirs() }
        git(repository, "init")
        git(repository, "config", "user.email", "tests@swarm.local")
        git(repository, "config", "user.name", "Swarm Tests")
        File(repository, "allowed.txt").writeText("base\n")
        git(repository, "add", ".")
        git(repository, "commit", "-m", "baseline")
        val revision = git(repository, "rev-parse", "HEAD").trim()
        val tree = git(repository, "rev-parse", "HEAD^{tree}").trim()
        val timestamp = Clock.System.now()
        val task = SwarmTask(
            id = "implement",
            title = "Implement",
            prompt = "Update the requested file",
            attempt = 1,
        )
        val run = SwarmRun(
            id = "run-isolated",
            title = "Isolated run",
            objective = "Verify isolated Pi execution",
            createdAt = timestamp,
            updatedAt = timestamp,
            repositoryBaseline = SwarmRepositoryBaseline(
                revision = revision,
                baseRevision = revision,
                treeHash = tree,
                dirty = false,
                capturedAt = timestamp,
            ),
            tasks = listOf(task),
        )
        val worktreeRoot = File(root, "worktrees")
        val evidenceStore = SwarmEvidenceStore(File(root, "evidence"))
        var launchedConfig: AgentConfig? = null
        var prompt: String? = null
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "remote-isolated"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                prompt = message
                return action(File(checkNotNull(launchedConfig).workingDirectory))
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = error("Validated session creation is required")

            override suspend fun getOrCreateValidated(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
                isConfigCurrent: suspend () -> Boolean,
            ): PiSession {
                assertTrue(isConfigCurrent())
                launchedConfig = config
                return session
            }

            override suspend fun abort(sessionId: String) = Unit
            override suspend fun close(sessionId: String) = Unit
        }
        val executor = PiSwarmTaskExecutor(
            sessions = sessions,
            workspaceManager = GitSwarmTaskWorkspaceManager(repository, worktreeRoot),
            workspaceDeltaCapturer = GitSwarmWorkspaceDeltaCapturer(File(root, "indexes"), evidenceStore),
            taskVerifier = EvidenceBackedSwarmTaskVerifier(evidenceStore),
            agentResolver = SwarmAgentResolver {
                SwarmAgentAllocation(AgentConfig(id = "pi", name = "Pi"))
            },
        )
        return Fixture(
            repository = repository,
            worktreeRoot = worktreeRoot,
            evidenceStore = evidenceStore,
            run = run,
            task = task,
            executor = executor,
            config = { checkNotNull(launchedConfig) },
            prompt = { checkNotNull(prompt) },
        )
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

    private data class Fixture(
        val repository: File,
        val worktreeRoot: File,
        val evidenceStore: SwarmEvidenceStore,
        val run: SwarmRun,
        val task: SwarmTask,
        val executor: PiSwarmTaskExecutor,
        val config: () -> AgentConfig,
        val prompt: () -> String,
    )
}
