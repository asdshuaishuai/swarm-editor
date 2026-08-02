package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmSandboxProtection
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.SwarmWorkspaceDeltaEvidence
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmTaskVerificationTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `executes structured verification commands in order and stores passed evidence`() = runTest {
        val fixture = fixture(
            results = listOf(
                CommandResult(exitCode = 0, output = "compiled", durationMillis = 12),
                CommandResult(exitCode = 0, output = "tests passed", durationMillis = 18),
            ),
            commands = listOf(
                listOf("./gradlew", ":backend:compileKotlin"),
                listOf("./gradlew", ":backend:test"),
            ),
        )
        try {
            val result = fixture.verifier.verify(fixture.request)

            assertEquals(SwarmVerificationStatus.PASSED, result.status)
            assertEquals(fixture.request.task.verificationCommands, fixture.commands)
            assertTrue(result.output.contains("compiled"))
            assertTrue(result.output.contains("tests passed"))
            val evidence = assertNotNull(fixture.store.getVerification(result.evidenceId))
            assertEquals(SwarmVerificationStatus.PASSED, evidence.status)
            assertEquals(0, evidence.exitCode)
            assertFalse(evidence.timedOut)
            assertNotNull(fixture.store.getSandboxPreflight(evidence.sandboxPreflightEvidenceId))
        } finally {
            fixture.close()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `stops verification after the first failing command`() = runTest {
        val commands = listOf(
            listOf("check-one"),
            listOf("check-two"),
            listOf("check-three"),
        )
        val fixture = fixture(
            results = listOf(
                CommandResult(exitCode = 0, output = "one passed", durationMillis = 5),
                CommandResult(exitCode = 7, output = "two failed", durationMillis = 6),
            ),
            commands = commands,
        )
        try {
            val result = fixture.verifier.verify(fixture.request)

            assertEquals(SwarmVerificationStatus.FAILED, result.status)
            assertEquals(commands.take(2), fixture.commands)
            assertEquals(7, result.exitCode)
            assertFalse(result.output.contains("check-three"))
            assertEquals(SwarmVerificationStatus.FAILED, fixture.store.getVerification(result.evidenceId)?.status)
        } finally {
            fixture.close()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `stores timeout as failed verification evidence`() = runTest {
        val fixture = fixture(
            results = listOf(CommandResult(exitCode = -1, output = "timed out", durationMillis = 500, timedOut = true)),
            commands = listOf(listOf("slow-check")),
        )
        try {
            val result = fixture.verifier.verify(fixture.request)

            assertEquals(SwarmVerificationStatus.FAILED, result.status)
            assertTrue(result.timedOut)
            val evidence = assertNotNull(fixture.store.getVerification(result.evidenceId))
            assertTrue(evidence.timedOut)
            assertEquals(-1, evidence.exitCode)
        } finally {
            fixture.close()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `stores preflight failure without starting task commands`() = runTest {
        val fixture = fixture(
            results = emptyList(),
            commands = listOf(listOf("must-not-run")),
            provider = TestVerificationProvider(passed = false),
        )
        try {
            val result = fixture.verifier.verify(fixture.request)

            assertEquals(SwarmVerificationStatus.FAILED, result.status)
            assertTrue(fixture.commands.isEmpty())
            assertTrue(result.output.contains("sandbox unavailable"))
            val evidence = assertNotNull(fixture.store.getVerification(result.evidenceId))
            assertEquals(null, evidence.exitCode)
            assertFalse(assertNotNull(fixture.store.getSandboxPreflight(evidence.sandboxPreflightEvidenceId)).passed)
        } finally {
            fixture.close()
        }
    }

    private suspend fun fixture(
        results: List<CommandResult>,
        commands: List<List<String>>,
        provider: SwarmVerificationProvider = TestVerificationProvider(passed = true),
    ): VerificationFixture {
        val root = Files.createTempDirectory("swarm-task-verification")
        val workspaceDirectory = Files.createDirectory(root.resolve("workspace")).toFile()
        val evidenceDirectory = Files.createDirectory(root.resolve("evidence")).toFile()
        val store = SwarmEvidenceStore(evidenceDirectory)
        val task = SwarmTask(
            id = "verify-task",
            title = "Verify task",
            prompt = "Run focused checks",
            attempt = 1,
            verificationCommands = commands,
        )
        val workspaceEvidence = SwarmWorkspaceDeltaEvidence(
            runId = RUN_ID,
            taskId = task.id,
            attempt = task.attempt,
            worktreeId = "verify-task-worktree",
            baseRevision = "1".repeat(40),
            beforeTree = "2".repeat(40),
            afterTree = "3".repeat(40),
            nameStatusSha256 = "4".repeat(64),
            changedPathCount = 0,
            ownershipCompliant = true,
            ownershipPolicyVersion = "ownership-v1",
            gitVersion = "git version 2.51.0",
            capturePolicyVersion = "git-tree-v1",
            createdAt = NOW,
        )
        val workspaceEvidenceId = store.putWorkspaceDelta(workspaceEvidence)
        val capturedCommands = mutableListOf<List<String>>()
        val pendingResults = ArrayDeque(results)
        val runner = CommandRunner { commandRequest ->
            capturedCommands += commandRequest.command
            pendingResults.removeFirstOrNull() ?: error("Unexpected verification command: ${commandRequest.command}")
        }
        val verifier = EvidenceBackedSwarmTaskVerifier(
            evidenceStore = store,
            commandRunner = runner,
            providerOverride = provider,
            now = { NOW },
        )
        val workspace = SwarmTaskWorkspace(
            id = "task-${"5".repeat(64)}",
            runId = RUN_ID,
            taskId = task.id,
            attempt = task.attempt,
            directory = workspaceDirectory,
            baseRevision = workspaceEvidence.baseRevision,
            beforeTree = workspaceEvidence.beforeTree,
        )
        return VerificationFixture(
            root = root.toFile(),
            store = store,
            verifier = verifier,
            request = SwarmTaskVerificationRequest(
                runId = RUN_ID,
                task = task,
                workspace = workspace,
                workspaceDeltaEvidenceId = workspaceEvidenceId,
                beforeTree = workspaceEvidence.beforeTree,
                afterTree = workspaceEvidence.afterTree,
            ),
            commands = capturedCommands,
        )
    }

    private data class VerificationFixture(
        val root: File,
        val store: SwarmEvidenceStore,
        val verifier: EvidenceBackedSwarmTaskVerifier,
        val request: SwarmTaskVerificationRequest,
        val commands: List<List<String>>,
    ) {
        @OptIn(kotlin.io.path.ExperimentalPathApi::class)
        fun close() = root.toPath().deleteRecursively()
    }

    private class TestVerificationProvider(
        private val passed: Boolean,
    ) : SwarmVerificationProvider {
        override val policyId: String = "test-verifier"

        override suspend fun preflight(
            commandRunner: CommandRunner,
            workspace: File,
            createdAt: Instant,
        ): SwarmSandboxPreflightReport = SwarmSandboxPreflightReport(
            provider = policyId,
            providerVersion = "1",
            binarySha256 = "6".repeat(64),
            osName = "Test OS",
            osVersion = "1",
            architecture = "test",
            requiredProtections = setOf(SwarmSandboxProtection.PROCESS),
            activeProtections = if (passed) setOf(SwarmSandboxProtection.PROCESS) else emptySet(),
            unsupportedProtections = if (passed) emptySet() else setOf(SwarmSandboxProtection.PROCESS),
            policyVersion = "swarm-task-verification-v1",
            policySha256 = "7".repeat(64),
            passed = passed,
            failureReasons = if (passed) emptyList() else listOf("sandbox unavailable"),
            createdAt = createdAt,
        )

        override fun wrap(command: List<String>, workspace: File): List<String> = command
    }
}

private val NOW = Instant.fromEpochMilliseconds(1_000)
private const val RUN_ID = "run-verification"
