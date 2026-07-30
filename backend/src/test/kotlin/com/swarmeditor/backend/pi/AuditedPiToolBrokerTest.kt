package com.swarmeditor.backend.pi

import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class AuditedPiToolBrokerTest {
    @Test
    fun `successful execution persists metadata without raw arguments or results`() = runTest {
        val root = Files.createTempDirectory("pi-tool-audit-success")
        try {
            val times = ArrayDeque(listOf(100L, 145L))
            val broker = AuditedPiToolBroker(
                agentId = "reviewer",
                workspace = root.toFile(),
                executor = PiToolCapabilityExecutor {
                    PiToolCapabilityResult(
                        result = buildJsonObject { put("base64", "c2VjcmV0LXJlc3VsdA==") },
                        exitCode = 0,
                        outputTruncated = true,
                    )
                },
                auditStore = FilePiToolAuditStore(root.resolve("audit").toFile()),
                currentTimeMillis = { times.removeFirst() },
            )

            val result = broker.execute(request(argumentsHash = "a".repeat(64)))
            val auditFile = root.resolve("audit/${result.auditId}.json")
            val content = Files.readString(auditFile)
            val record = Json.decodeFromString<PiToolAuditRecord>(content)

            assertEquals(PiToolAuditOutcome.SUCCEEDED, record.outcome)
            assertEquals("reviewer", record.agentId)
            assertTrue(record.brokerSessionId.matches(Regex("broker-[0-9a-f]{32}")))
            assertEquals(45, record.durationMillis)
            assertEquals(0, record.exitCode)
            assertTrue(record.outputTruncated)
            assertEquals("a".repeat(64), record.argumentsHash)
            assertNotEquals(root.toFile().canonicalPath, record.workspaceHash)
            assertFalse(content.contains("sensitive/path"))
            assertFalse(content.contains("secret-result"))
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `failed and canceled executions are audited before propagation`() = runTest {
        val failedWorkspace = Files.createTempDirectory("pi-tool-audit-failed")
        val canceledWorkspace = Files.createTempDirectory("pi-tool-audit-canceled")
        val records = mutableListOf<PiToolAuditRecord>()
        val failed = AuditedPiToolBroker(
            agentId = "reviewer",
            workspace = failedWorkspace.toFile(),
            executor = PiToolCapabilityExecutor { error("container unavailable") },
            auditStore = PiToolAuditStore(records::add),
        )
        val canceled = AuditedPiToolBroker(
            agentId = "reviewer",
            workspace = canceledWorkspace.toFile(),
            executor = PiToolCapabilityExecutor { throw CancellationException("stopped") },
            auditStore = PiToolAuditStore(records::add),
        )

        try {
            assertFailsWith<IllegalStateException> { failed.execute(request()) }
            assertFailsWith<CancellationException> { canceled.execute(request(requestId = "tr-2")) }

            assertEquals(listOf(PiToolAuditOutcome.FAILED, PiToolAuditOutcome.CANCELED), records.map { it.outcome })
            assertEquals(listOf("IllegalStateException", "CancellationException"), records.map { it.errorCategory })
        } finally {
            failedWorkspace.toFile().deleteRecursively()
            canceledWorkspace.toFile().deleteRecursively()
        }
    }

    private fun request(
        requestId: String = "tr-1",
        argumentsHash: String = "b".repeat(64),
    ) = PiToolBrokerRequest(
        requestId = requestId,
        sessionNonce = "0123456789abcdef",
        tool = "read",
        operation = "readFile",
        arguments = buildJsonObject { put("path", "sensitive/path") },
        argumentsHash = argumentsHash,
        deadlineMillis = System.currentTimeMillis() + 5_000,
    )
}
