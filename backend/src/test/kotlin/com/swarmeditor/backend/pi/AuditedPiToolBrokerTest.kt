package com.swarmeditor.backend.pi

import com.swarmeditor.backend.capability.CapabilityRegistry
import com.swarmeditor.common.model.CapabilityDescriptor
import com.swarmeditor.common.model.CapabilityKind
import com.swarmeditor.common.model.CapabilityPermission
import com.swarmeditor.common.model.CapabilityTrust
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
    fun `denied capability requests are persisted as failed tool audits`() = runTest {
        val directory = Files.createTempDirectory("audited-pi-tool-capability")
        try {
            val auditStore = FilePiToolAuditStore(directory.toFile())
            val registry = CapabilityRegistry(
                listOf(
                    CapabilityDescriptor(
                        id = "pi.bash",
                        kind = CapabilityKind.PI_TOOL,
                        version = "1",
                        displayName = "Pi command tool",
                        trust = CapabilityTrust.UNTRUSTED,
                    ),
                ),
            )
            val broker = AuditedPiToolBroker(
                agentId = "agent",
                workspace = directory.toFile(),
                executor = PiToolCapabilityExecutor { error("executor should not run") },
                auditStore = auditStore,
                capabilityRegistry = registry,
            )

            assertFailsWith<IllegalStateException> { broker.execute(request(tool = "bash", operation = "exec")) }

            val record = Json.decodeFromString<PiToolAuditRecord>(
                Files.readString(directory.resolve("${broker.auditIds().single()}.json")),
            )
            assertEquals(PiToolAuditOutcome.FAILED, record.outcome)
            assertEquals("IllegalStateException", record.errorCategory)
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    @Test
    fun `wasm execution requires the selected plugin capability`() = runTest {
        val directory = Files.createTempDirectory("audited-pi-tool-wasm-capability")
        try {
            val registry = CapabilityRegistry(
                listOf(
                    CapabilityDescriptor(
                        id = "wasm.execute",
                        kind = CapabilityKind.WASM_PLUGIN,
                        version = "1",
                        displayName = "WASM plugin execution",
                        trust = CapabilityTrust.USER_APPROVED,
                        permissions = setOf(CapabilityPermission.EXECUTE_PROCESS),
                    ),
                ),
            )
            var executions = 0
            val broker = AuditedPiToolBroker(
                agentId = "agent",
                workspace = directory.toFile(),
                executor = PiToolCapabilityExecutor {
                    executions += 1
                    PiToolCapabilityResult(buildJsonObject { put("ok", true) })
                },
                auditStore = FilePiToolAuditStore(directory.toFile()),
                capabilityRegistry = registry,
            )
            val request = request(tool = "wasm", operation = "execute").copy(
                arguments = buildJsonObject { put("plugin", "formatter") },
            )

            assertFailsWith<IllegalStateException> { broker.execute(request) }
            registry.register(
                CapabilityDescriptor(
                    id = "wasm.plugin.formatter",
                    kind = CapabilityKind.WASM_PLUGIN,
                    version = "hash",
                    displayName = "Formatter",
                    trust = CapabilityTrust.USER_APPROVED,
                    permissions = setOf(CapabilityPermission.EXECUTE_PROCESS),
                    source = "wasm-plugin",
                ),
            )

            broker.execute(request)

            assertEquals(1, executions)
            assertEquals(
                listOf(PiToolAuditOutcome.FAILED, PiToolAuditOutcome.SUCCEEDED),
                broker.auditIds().map { auditId ->
                    Json.decodeFromString<PiToolAuditRecord>(Files.readString(directory.resolve("$auditId.json"))).outcome
                },
            )
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

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
        tool: String = "read",
        operation: String = "readFile",
    ) = PiToolBrokerRequest(
        requestId = requestId,
        sessionNonce = "0123456789abcdef",
        tool = tool,
        operation = operation,
        arguments = buildJsonObject { put("path", "sensitive/path") },
        argumentsHash = argumentsHash,
        deadlineMillis = System.currentTimeMillis() + 5_000,
    )
}
