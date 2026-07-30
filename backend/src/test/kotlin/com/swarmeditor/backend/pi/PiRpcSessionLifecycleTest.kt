package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class PiRpcSessionLifecycleTest {
    @Test
    fun `closed stdout fails requests without waiting for their timeout`() = runBlocking {
        val fixture = runtimeFixture(
            """
            require("node:fs").closeSync(1);
            setInterval(() => {}, 1_000);
            """.trimIndent(),
        )
        val session = fixture.session(timeoutSeconds = 30)

        try {
            val error = assertFailsWith<Throwable> {
                withTimeout(2_000) { session.validate(30) }
            }

            assertFalse(error is TimeoutCancellationException)
            assertContains(error.message.orEmpty(), "pi")
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `failed abort can be retried for the same active run`() = runBlocking {
        val fixture = runtimeFixture(RETRYABLE_ABORT_SERVER)
        val session = fixture.session(timeoutSeconds = 5)

        try {
            session.validate(5)
            val prompt = async { session.prompt("stop me", emptyList()) {} }
            withTimeout(2_000) { session.state.first { it?.isStreaming == true } }

            val firstFailure = assertFailsWith<IllegalStateException> { session.abort() }
            assertContains(firstFailure.message.orEmpty(), "first abort failed")

            session.abort()
            assertEquals("stopped", withTimeout(2_000) { prompt.await() })
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `close does not wait for an unresponsive abort`() = runBlocking {
        val fixture = runtimeFixture(UNRESPONSIVE_ABORT_SERVER)
        val session = fixture.session(timeoutSeconds = 30)

        try {
            supervisorScope {
                session.validate(5)
                val prompt = async { session.prompt("stop me", emptyList()) {} }
                withTimeout(2_000) { session.state.first { it?.isStreaming == true } }

                withTimeout(3_000) { session.close() }
                assertFailsWith<IllegalStateException> { prompt.await() }
            }
            Unit
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `json line reader preserves final records and rejects oversized lines`() = runBlocking {
        val lines = mutableListOf<String>()
        readJsonLines(
            ByteArrayInputStream("first\r\nsecond".toByteArray()),
            lines::add,
            maxLineBytes = 16,
        )

        assertEquals(listOf("first", "second"), lines)
        val error = assertFailsWith<IllegalStateException> {
            readJsonLines(
                ByteArrayInputStream("123456789".toByteArray()),
                onLine = {},
                maxLineBytes = 8,
            )
        }
        assertContains(error.message.orEmpty(), "8B")
    }

    private fun runtimeFixture(script: String): RuntimeFixture {
        val root = Files.createTempDirectory("pi-rpc-lifecycle")
        val entrypoint = root.resolve("pi-0.80.10/packages/coding-agent/dist/rpc-entry.js")
        Files.createDirectories(entrypoint.parent)
        Files.writeString(entrypoint, script)
        return RuntimeFixture(root, PiRuntimeDistribution(root.toFile()))
    }

    private data class RuntimeFixture(
        val root: Path,
        val distribution: PiRuntimeDistribution,
    ) {
        fun session(timeoutSeconds: Int): PiRpcSession = PiRpcSession(
            distribution = distribution,
            config = AgentConfig(
                id = "lifecycle-test",
                name = "Lifecycle Test",
                timeoutSeconds = timeoutSeconds,
            ),
            workingDirectory = root.toFile(),
            remoteSessionId = null,
        )

        fun close() {
            root.toFile().deleteRecursively()
        }
    }

    private companion object {
        val UNRESPONSIVE_ABORT_SERVER =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            const state = {
              sessionId: "remote-unresponsive",
              thinkingLevel: "medium",
              isStreaming: false,
              isCompacting: false,
              autoCompactionEnabled: true,
              messageCount: 0,
              pendingMessageCount: 0,
              tools: []
            };
            function respond(id, data) {
              process.stdout.write(JSON.stringify({ type: "response", id, success: true, data }) + "\n");
            }
            input.on("line", (line) => {
              const command = JSON.parse(line);
              switch (command.type) {
                case "get_state":
                  respond(command.id, state);
                  break;
                case "prompt":
                  respond(command.id, {});
                  process.stdout.write(JSON.stringify({ type: "agent_start" }) + "\n");
                  break;
                case "abort":
                  break;
              }
            });
            """.trimIndent()

        val RETRYABLE_ABORT_SERVER =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            let abortCount = 0;
            const state = {
              sessionId: "remote-lifecycle",
              thinkingLevel: "medium",
              isStreaming: false,
              isCompacting: false,
              autoCompactionEnabled: true,
              messageCount: 0,
              pendingMessageCount: 0,
              tools: []
            };
            function respond(id, success, data, error) {
              const payload = { type: "response", id, success, data };
              if (error) payload.error = error;
              process.stdout.write(JSON.stringify(payload) + "\n");
            }
            input.on("line", (line) => {
              const command = JSON.parse(line);
              switch (command.type) {
                case "get_state":
                  respond(command.id, true, state);
                  break;
                case "prompt":
                  respond(command.id, true, {});
                  break;
                case "abort":
                  abortCount += 1;
                  if (abortCount === 1) {
                    respond(command.id, false, {}, "first abort failed");
                  } else {
                    respond(command.id, true, {});
                    process.stdout.write(JSON.stringify({ type: "agent_end" }) + "\n");
                  }
                  break;
                case "get_last_assistant_text":
                  respond(command.id, true, { text: "stopped" });
                  break;
                case "get_session_stats":
                  respond(command.id, true, {
                    sessionId: "remote-lifecycle",
                    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    cost: 0
                  });
                  break;
                default:
                  respond(command.id, false, {}, "unsupported: " + command.type);
              }
            });
            """.trimIndent()
    }
}
