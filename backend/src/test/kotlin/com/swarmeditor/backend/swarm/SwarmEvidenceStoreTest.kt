package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmSandboxProtection
import com.swarmeditor.common.model.SwarmChangedPath
import com.swarmeditor.common.model.SwarmVerificationEvidence
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.common.model.SwarmVerificationTestSummary
import com.swarmeditor.common.model.SwarmWorkspaceDeltaEvidence
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmEvidenceStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `deduplicates workspace evidence by content digest`() = runTest {
        val directory = Files.createTempDirectory("swarm-evidence-deduplicate")
        try {
            val store = SwarmEvidenceStore(directory.toFile())
            val evidence = workspaceEvidence()

            val firstId = store.putWorkspaceDelta(evidence)
            val secondId = store.putWorkspaceDelta(evidence)

            assertEquals(firstId, secondId)
            assertTrue(firstId.matches(Regex("[0-9a-f]{64}")))
            assertEquals(evidence, store.getWorkspaceDelta(firstId))
            assertEquals(
                1,
                directory.resolve("workspace-delta/${firstId.take(2)}").toFile()
                    .listFiles().orEmpty().count { it.extension == "json" },
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `quarantines evidence whose content no longer matches its digest`() = runTest {
        val directory = Files.createTempDirectory("swarm-evidence-tamper")
        try {
            val store = SwarmEvidenceStore(directory.toFile())
            val id = store.putWorkspaceDelta(workspaceEvidence())
            val evidenceDirectory = directory.resolve("workspace-delta/${id.take(2)}").toFile()
            evidenceDirectory.resolve("$id.json").writeText("{}")

            assertNull(store.getWorkspaceDelta(id))
            assertTrue(evidenceDirectory.listFiles().orEmpty().any { it.name.startsWith("$id.json.corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `stores linked preflight and passed verification evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-evidence-linked")
        try {
            val store = SwarmEvidenceStore(directory.toFile())
            val workspaceId = store.putWorkspaceDelta(workspaceEvidence())
            val preflight = preflightEvidence()
            val preflightId = store.putSandboxPreflight(preflight)
            val verification = verificationEvidence(workspaceId, preflightId)

            val verificationId = store.putVerification(verification)

            assertEquals(preflight, store.getSandboxPreflight(preflightId))
            assertEquals(verification, store.getVerification(verificationId))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects passed verification with a failing exit code`() = runTest {
        val directory = Files.createTempDirectory("swarm-evidence-invalid-pass")
        try {
            val store = SwarmEvidenceStore(directory.toFile())
            val invalid = verificationEvidence(
                workspaceId = "d".repeat(64),
                preflightId = "e".repeat(64),
            ).copy(exitCode = 1)

            assertFailsWith<IllegalArgumentException> { store.putVerification(invalid) }
            assertTrue(directory.toFile().walkTopDown().none { it.isFile })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects verification that references missing evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-evidence-missing-reference")
        try {
            val store = SwarmEvidenceStore(directory.toFile())
            val verification = verificationEvidence(
                workspaceId = "d".repeat(64),
                preflightId = "e".repeat(64),
            )

            assertFailsWith<IllegalStateException> { store.putVerification(verification) }
            assertTrue(directory.toFile().walkTopDown().none { it.isFile })
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun workspaceEvidence() = SwarmWorkspaceDeltaEvidence(
        runId = "run-test",
        taskId = "implement",
        attempt = 1,
        worktreeId = "run-test-implement-1",
        baseRevision = "1".repeat(40),
        beforeTree = "2".repeat(40),
        afterTree = "3".repeat(40),
        nameStatusSha256 = "4".repeat(64),
        changedPathCount = 2,
        changedPaths = listOf(
            SwarmChangedPath("M", "src/Main.kt"),
            SwarmChangedPath("A", "src/New.kt"),
        ),
        gitVersion = "git version 2.51.0",
        capturePolicyVersion = "git-tree-v1",
        createdAt = Clock.System.now(),
    )

    private fun preflightEvidence() = SwarmSandboxPreflightReport(
        provider = "bubblewrap",
        providerVersion = "0.11.0",
        binarySha256 = "5".repeat(64),
        osName = "Linux",
        osVersion = "Fedora 44",
        architecture = "x86_64",
        kernelVersion = "7.0.12",
        requiredProtections = setOf(
            SwarmSandboxProtection.FILESYSTEM,
            SwarmSandboxProtection.NETWORK,
            SwarmSandboxProtection.PROCESS,
        ),
        activeProtections = setOf(
            SwarmSandboxProtection.FILESYSTEM,
            SwarmSandboxProtection.NETWORK,
            SwarmSandboxProtection.PROCESS,
        ),
        policyVersion = "bubblewrap-native-v1",
        policySha256 = "6".repeat(64),
        passed = true,
        createdAt = Clock.System.now(),
    )

    private fun verificationEvidence(
        workspaceId: String,
        preflightId: String,
    ) = SwarmVerificationEvidence(
        runId = "run-test",
        taskId = "implement",
        attempt = 1,
        workspaceDeltaEvidenceId = workspaceId,
        sandboxPreflightEvidenceId = preflightId,
        status = SwarmVerificationStatus.PASSED,
        policyId = "gradle-test",
        policyVersion = "1",
        commandSha256 = "7".repeat(64),
        beforeTree = "2".repeat(40),
        afterTree = "3".repeat(40),
        exitCode = 0,
        durationMillis = 1_250,
        stdoutSha256 = "8".repeat(64),
        stdoutBytes = 128,
        testSummary = SwarmVerificationTestSummary(total = 4, passed = 3, failed = 0, skipped = 1),
        environmentFingerprint = "9".repeat(64),
        verifierVersion = "local-bubblewrap-v1",
        createdAt = Clock.System.now(),
    )
}
