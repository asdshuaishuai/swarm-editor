package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BubblewrapPiToolBrokerTest {
    @Test
    fun `environment configuration stays disabled without agent authorization`() {
        assertNull(BubblewrapPiToolBrokerFactory.fromEnvironment(emptyMap(), PiToolAuditStore {}))
    }

    @Test
    fun `explicit Bubblewrap configuration fails clearly when runtime is unavailable`() {
        assertFailsWith<IllegalStateException> {
            BubblewrapPiToolBrokerFactory.fromEnvironment(
                environment = mapOf(
                    "SWARM_PI_TOOL_SANDBOX" to "bubblewrap",
                    "SWARM_PI_TOOL_BROKER_AGENTS" to "reviewer",
                    "PATH" to "",
                ),
                auditStore = PiToolAuditStore {},
                osName = "Linux",
            )
        }
    }

    @Test
    fun `environment enables lightweight Bubblewrap without container configuration`() {
        val tools = Files.createTempDirectory("pi-tool-bwrap-env")
        try {
            tools.resolve("bwrap").toFile().apply { writeText(""); setExecutable(true) }
            tools.resolve("node").toFile().apply { writeText(""); setExecutable(true) }
            val environment = mapOf(
                "SWARM_PI_TOOL_BROKER_AGENTS" to "reviewer",
                "PATH" to tools.toString(),
            )

            assertTrue(
                BubblewrapPiToolBrokerFactory.fromEnvironment(
                    environment = environment,
                    auditStore = PiToolAuditStore {},
                    osName = "Linux",
                ) != null
            )
        } finally {
            tools.toFile().deleteRecursively()
        }
    }

    @Test
    fun `authorized broker reuses one isolated worker without exposing home`() = runTest {
        val root = Files.createTempDirectory("pi-tool-bwrap")
        val tools = Files.createTempDirectory("pi-tool-bwrap-runtime")
        val runtime = tools.resolve("bwrap").toFile().apply { writeText(""); setExecutable(true) }
        val node = tools.resolve("node").toFile().apply { writeText(""); setExecutable(true) }
        try {
            var workerStarts = 0
            var workerCloses = 0
            var capturedCommand = emptyList<String>()
            val factory = BubblewrapPiToolBrokerFactory(
                runtimeExecutable = runtime.path,
                nodeExecutable = node,
                authorizedAgentIds = setOf("reviewer"),
                auditStore = PiToolAuditStore {},
                workerFactory = PiToolWorkerFactory { command, workingDirectory, environment ->
                    workerStarts += 1
                    capturedCommand = command
                    assertEquals(root.toFile(), workingDirectory)
                    assertTrue(environment.isEmpty())
                    object : PiToolWorker {
                        override suspend fun execute(request: PiToolBrokerRequest) =
                            PiToolCapabilityResult(buildJsonObject { put("base64", "b2s=") })

                        override suspend fun close() {
                            workerCloses += 1
                        }
                    }
                },
            )

            assertNull(factory.create(AgentConfig("other", "Other"), root.toFile()))
            val broker = factory.create(AgentConfig("reviewer", "Reviewer"), root.toFile())!!
            broker.execute(request("tr-1"))
            broker.execute(request("tr-2"))
            broker.close()

            assertEquals(1, workerStarts)
            assertEquals(1, workerCloses)
            assertContains(capturedCommand, "--unshare-all")
            assertContains(capturedCommand, "--unshare-user")
            assertContains(capturedCommand, "--disable-userns")
            assertContains(capturedCommand, "--clearenv")
            assertContains(capturedCommand, "--cap-drop")
            assertContains(capturedCommand, "--ro-bind")
            assertContains(capturedCommand, "--bind")
            assertContains(capturedCommand, "/workspace")
            assertContains(capturedCommand, "/swarm-toolchains/node")
            assertFalse(capturedCommand.windowed(3).any { it == listOf("--ro-bind", System.getProperty("user.home"), System.getProperty("user.home")) })
            assertEquals(listOf("/swarm-toolchains/node/node", "-e", PI_TOOL_WORKER_SCRIPT), capturedCommand.takeLast(3))
        } finally {
            root.toFile().deleteRecursively()
            tools.toFile().deleteRecursively()
        }
    }

    @Test
    fun `worker failure discards sandbox and next request restarts it`() = runTest {
        val root = Files.createTempDirectory("pi-tool-bwrap-restart")
        val runtime = root.resolve("bwrap").toFile().apply { writeText(""); setExecutable(true) }
        val node = root.resolve("node").toFile().apply { writeText(""); setExecutable(true) }
        try {
            var starts = 0
            var closes = 0
            val factory = BubblewrapPiToolBrokerFactory(
                runtimeExecutable = runtime.path,
                nodeExecutable = node,
                authorizedAgentIds = setOf("reviewer"),
                auditStore = PiToolAuditStore {},
                workerFactory = PiToolWorkerFactory { _, _, _ ->
                    starts += 1
                    object : PiToolWorker {
                        override suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult {
                            if (starts == 1) error("worker crashed")
                            return PiToolCapabilityResult(buildJsonObject { put("base64", "b2s=") })
                        }

                        override suspend fun close() {
                            closes += 1
                        }
                    }
                },
            )
            val broker = factory.create(AgentConfig("reviewer", "Reviewer"), root.toFile())!!

            assertFailsWith<IllegalStateException> { broker.execute(request("tr-1")) }
            broker.execute(request("tr-2"))
            broker.close()

            assertEquals(2, starts)
            assertEquals(2, closes)
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `systemd user scope adds lightweight resource limits`() = runTest {
        val root = Files.createTempDirectory("pi-tool-bwrap-scope")
        val tools = Files.createTempDirectory("pi-tool-bwrap-scope-runtime")
        val runtime = tools.resolve("bwrap").toFile().apply { writeText(""); setExecutable(true) }
        val systemdRun = tools.resolve("systemd-run").toFile().apply { writeText(""); setExecutable(true) }
        val node = tools.resolve("node").toFile().apply { writeText(""); setExecutable(true) }
        try {
            var command = emptyList<String>()
            val broker = BubblewrapPiToolBrokerFactory(
                runtimeExecutable = runtime.path,
                nodeExecutable = node,
                authorizedAgentIds = setOf("reviewer"),
                auditStore = PiToolAuditStore {},
                systemdRunExecutable = systemdRun,
                workerFactory = PiToolWorkerFactory { captured, _, _ ->
                    command = captured
                    object : PiToolWorker {
                        override suspend fun execute(request: PiToolBrokerRequest) =
                            PiToolCapabilityResult(buildJsonObject { put("base64", "b2s=") })

                        override suspend fun close() = Unit
                    }
                },
            ).create(AgentConfig("reviewer", "Reviewer"), root.toFile())!!

            broker.execute(request("tr-1"))
            broker.close()

            assertEquals(systemdRun.path, command.first())
            assertContains(command, "MemoryMax=2G")
            assertContains(command, "TasksMax=256")
            assertContains(command, "CPUQuota=200%")
            assertContains(command, runtime.path)
        } finally {
            root.toFile().deleteRecursively()
            tools.toFile().deleteRecursively()
        }
    }

    @Test
    fun `WASM requests bypass the Node worker and remain audited`() = runTest {
        val root = Files.createTempDirectory("pi-tool-bwrap-wasm")
        val runtime = root.resolve("bwrap").toFile().apply { writeText(""); setExecutable(true) }
        val node = root.resolve("node").toFile().apply { writeText(""); setExecutable(true) }
        try {
            var workerStarts = 0
            var wasmCalls = 0
            val audits = mutableListOf<PiToolAuditRecord>()
            val broker = BubblewrapPiToolBrokerFactory(
                runtimeExecutable = runtime.path,
                nodeExecutable = node,
                authorizedAgentIds = setOf("reviewer"),
                auditStore = PiToolAuditStore(audits::add),
                wasmExecutor = PiToolCapabilityExecutor {
                    wasmCalls += 1
                    PiToolCapabilityResult(buildJsonObject { put("runtimeAvailable", true) })
                },
                workerFactory = PiToolWorkerFactory { _, _, _ ->
                    workerStarts += 1
                    error("Node worker must not start for WASM requests")
                },
            ).create(AgentConfig("reviewer", "Reviewer"), root.toFile())!!

            val result = broker.execute(request("tr-1").copy(tool = "wasm", operation = "list"))

            assertEquals(0, workerStarts)
            assertEquals(1, wasmCalls)
            assertEquals("wasm", audits.single().tool)
            assertEquals(result.auditId, audits.single().auditId)
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    private fun request(requestId: String) = PiToolBrokerRequest(
        requestId = requestId,
        sessionNonce = "0123456789abcdef",
        tool = "read",
        operation = "readFile",
        arguments = buildJsonObject { put("path", "README.md") },
        argumentsHash = "a".repeat(64),
        deadlineMillis = System.currentTimeMillis() + 5_000,
    )
}
