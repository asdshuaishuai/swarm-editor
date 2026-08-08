package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PiRpcSessionToolBrokerTest {
    @Test
    fun `returns broker results with mandatory audit identity`() = runBlocking {
        val fixture = runtimeFixture(SUCCESS_SERVER)
        val requests = mutableListOf<PiToolBrokerRequest>()
        val session = fixture.session(PiToolBroker { request ->
            requests += request
            PiToolBrokerResult(
                result = buildJsonObject { put("base64", "aGVsbG8=") },
                auditId = "audit-1",
            )
        })

        try {
            session.validate(5)

            val commands = session.getCommands()

            assertEquals("broker-ok", commands.single().name)
            assertEquals("read.readFile", commands.single().description)
            assertEquals("README.md", requests.single().arguments["path"].toString().trim('"'))
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `duplicate requests cancel the original and fail closed`() = runBlocking {
        val fixture = runtimeFixture(DUPLICATE_SERVER)
        val brokerStarted = CompletableDeferred<Unit>()
        val brokerCanceled = CompletableDeferred<Unit>()
        val session = fixture.session(PiToolBroker {
            brokerStarted.complete(Unit)
            try {
                awaitCancellation()
            } finally {
                brokerCanceled.complete(Unit)
            }
        })

        try {
            session.validate(5)
            val commands = session.getCommands()

            withTimeout(2_000) { brokerStarted.await() }
            withTimeout(2_000) { brokerCanceled.await() }
            assertEquals("duplicate-rejected", commands.single().name)
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `tool cancel propagates to broker execution`() = runBlocking {
        val fixture = runtimeFixture(CANCEL_SERVER)
        val brokerCanceled = CompletableDeferred<Unit>()
        val session = fixture.session(PiToolBroker {
            try {
                awaitCancellation()
            } catch (_: CancellationException) {
                brokerCanceled.complete(Unit)
                withContext(NonCancellable) { delay(50) }
                PiToolBrokerResult(buildJsonObject { put("base64", "bGF0ZQ==") }, auditId = "late-audit")
            }
        })

        try {
            session.validate(5)
            assertEquals("cancel-sent", session.getCommands().single().name)
            withTimeout(2_000) { brokerCanceled.await() }
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `host enforces broker request deadlines`() = runBlocking {
        val fixture = runtimeFixture(DEADLINE_SERVER)
        val session = fixture.session(PiToolBroker { awaitCancellation() })

        try {
            session.validate(5)

            val command = session.getCommands().single()

            assertEquals("deadline-rejected", command.name)
            assertTrue(command.description.contains("deadline"))
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `runtime manager creates broker for the resolved workspace`() = runBlocking {
        val fixture = runtimeFixture(SUCCESS_SERVER)
        val createdFor = CompletableDeferred<Pair<AgentConfig, java.io.File>>()
        val manager = PiRuntimeManager(
            distribution = fixture.distribution,
            defaultWorkingDirectory = fixture.root.toFile(),
            toolBrokerFactory = PiToolBrokerFactory { config, workingDirectory ->
                createdFor.complete(config to workingDirectory)
                PiToolBroker {
                    PiToolBrokerResult(
                        result = buildJsonObject { put("base64", "aGVsbG8=") },
                        auditId = "audit-1",
                    )
                }
            },
        )

        try {
            val config = AgentConfig(id = "managed-broker", name = "Managed Broker", timeoutSeconds = 5)
            manager.getOrCreate("session-1", config, null)

            assertEquals("broker-ok", manager.getCommands("session-1").single().name)
            assertEquals(config, createdFor.await().first)
            assertEquals(fixture.root.toFile(), createdFor.await().second)
        } finally {
            manager.shutdown()
            fixture.close()
        }
    }

    @Test
    fun `runtime manager skips broker for model catalog sessions`() = runBlocking {
        val fixture = runtimeFixture(SUCCESS_SERVER)
        var brokerCreations = 0
        val manager = PiRuntimeManager(
            distribution = fixture.distribution,
            defaultWorkingDirectory = fixture.root.toFile(),
            toolBrokerFactory = PiToolBrokerFactory { _, _ ->
                brokerCreations++
                PiToolBroker { error("model catalog must not execute broker tools") }
            },
        )

        try {
            val config = AgentConfig(
                id = "model-catalog",
                name = "Model Catalog",
                timeoutSeconds = 5,
                env = mapOf(SWARM_PI_MODEL_CATALOG_ENV to "1"),
            )
            manager.getOrCreate("catalog-session", config, null)

            assertEquals(0, brokerCreations)
        } finally {
            manager.shutdown()
            fixture.close()
        }
    }

    @Test
    fun `closing rpc session closes its tool broker`() = runBlocking {
        val fixture = runtimeFixture(SUCCESS_SERVER)
        val brokerClosed = CompletableDeferred<Unit>()
        val session = fixture.session(object : PiToolBroker {
            override suspend fun execute(request: PiToolBrokerRequest) =
                PiToolBrokerResult(buildJsonObject { put("base64", "aGVsbG8=") }, auditId = "audit-1")

            override suspend fun close() {
                brokerClosed.complete(Unit)
            }
        })

        try {
            session.validate(5)
            session.close()
            withTimeout(2_000) { brokerClosed.await() }
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `missing audit identity becomes a broker failure`() = runBlocking {
        val fixture = runtimeFixture(MISSING_AUDIT_SERVER)
        val session = fixture.session(PiToolBroker {
            PiToolBrokerResult(buildJsonObject { put("base64", "aGVsbG8=") }, auditId = "")
        })

        try {
            session.validate(5)

            val command = session.getCommands().single()

            assertEquals("audit-rejected", command.name)
            assertTrue(command.description.contains("audit id"))
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `oversized broker results become bounded failures`() = runBlocking {
        val fixture = runtimeFixture(OVERSIZED_RESPONSE_SERVER)
        val session = fixture.session(PiToolBroker {
            PiToolBrokerResult(
                buildJsonObject { put("data", "x".repeat(MAX_PI_TOOL_BROKER_RESPONSE_BYTES)) },
                auditId = "audit-large",
            )
        })

        try {
            session.validate(5)

            val command = session.getCommands().single()

            assertEquals("size-rejected", command.name)
            assertTrue(command.description.contains("limit"))
        } finally {
            session.close()
            fixture.close()
        }
    }

    private fun runtimeFixture(script: String): RuntimeFixture {
        val root = Files.createTempDirectory("pi-rpc-tool-broker")
        val entrypoint = root.resolve("pi-0.83.0/packages/coding-agent/dist/rpc-entry.js")
        Files.createDirectories(entrypoint.parent)
        Files.writeString(entrypoint, script)
        return RuntimeFixture(root, PiRuntimeDistribution(root.toFile()))
    }

    private data class RuntimeFixture(
        val root: Path,
        val distribution: PiRuntimeDistribution,
    ) {
        fun session(toolBroker: PiToolBroker): PiRpcSession = PiRpcSession(
            distribution = distribution,
            config = AgentConfig(
                id = "tool-broker-test",
                name = "Tool Broker Test",
                timeoutSeconds = 5,
            ),
            workingDirectory = root.toFile(),
            remoteSessionId = null,
            toolBroker = toolBroker,
        )

        fun close() {
            root.toFile().deleteRecursively()
        }
    }

    private companion object {
        val SERVER_PREAMBLE =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            const nonce = process.env.SWARM_PI_TOOL_BROKER_NONCE;
            const state = {
              sessionId: "remote-tool-broker",
              thinkingLevel: "medium",
              isStreaming: false,
              isCompacting: false,
              autoCompactionEnabled: true,
              messageCount: 0,
              pendingMessageCount: 0,
              tools: []
            };
            let pendingCommandId;
            function respond(id, data) {
              process.stdout.write(JSON.stringify({ type: "response", id, success: true, data }) + "\n");
            }
            function command(name, description = "") {
              respond(pendingCommandId, { commands: [{ name, description, source: "test" }] });
            }
            function request() {
              process.stdout.write(JSON.stringify({
                type: "tool_request",
                requestId: "tr-1",
                sessionNonce: nonce,
                tool: "read",
                operation: "readFile",
                arguments: { path: "README.md" },
                deadlineMillis: Date.now() + 5000
              }) + "\n");
            }
            """.trimIndent()

        val SUCCESS_SERVER =
            SERVER_PREAMBLE +
                """

                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_session_stats") {
                    return respond(message.id, {
                      sessionId: state.sessionId,
                      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                      cost: 0
                    });
                  }
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    return;
                  }
                  if (message.type === "tool_response") {
                    const valid = message.success === true && message.auditId === "audit-1" &&
                      message.result?.base64 === "aGVsbG8=" && message.sessionNonce === nonce;
                    command(valid ? "broker-ok" : "broker-invalid", "read.readFile");
                  }
                });
                """.trimIndent()

        val DUPLICATE_SERVER =
            SERVER_PREAMBLE +
                """

                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    setTimeout(request, 100);
                    return;
                  }
                  if (message.type === "tool_response" && message.success === false) {
                    command(message.error?.includes("Duplicate") ? "duplicate-rejected" : "duplicate-invalid");
                  }
                });
                """.trimIndent()

        val CANCEL_SERVER =
            SERVER_PREAMBLE +
                """

                let lateResponse = false;
                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    setTimeout(() => {
                      process.stdout.write(JSON.stringify({
                        type: "tool_cancel",
                        requestId: "tr-1",
                        sessionNonce: nonce,
                        reason: "aborted"
                      }) + "\n");
                      setTimeout(() => command(lateResponse ? "cancel-invalid" : "cancel-sent"), 200);
                    }, 100);
                    return;
                  }
                  if (message.type === "tool_response") lateResponse = true;
                });
                """.trimIndent()

        val DEADLINE_SERVER =
            SERVER_PREAMBLE.replace("Date.now() + 5000", "Date.now() + 100") +
                """

                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    return;
                  }
                  if (message.type === "tool_response" && message.success === false) {
                    command("deadline-rejected", message.error || "");
                  }
                });
                """.trimIndent()

        val MISSING_AUDIT_SERVER =
            SERVER_PREAMBLE +
                """

                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    return;
                  }
                  if (message.type === "tool_response" && message.success === false) {
                    command("audit-rejected", message.error || "");
                  }
                });
                """.trimIndent()

        val OVERSIZED_RESPONSE_SERVER =
            SERVER_PREAMBLE +
                """

                input.on("line", (line) => {
                  const message = JSON.parse(line);
                  if (message.type === "get_state") return respond(message.id, state);
                  if (message.type === "get_commands") {
                    pendingCommandId = message.id;
                    request();
                    return;
                  }
                  if (message.type === "tool_response" && message.success === false) {
                    command("size-rejected", message.error || "");
                  }
                });
                """.trimIndent()
    }
}
