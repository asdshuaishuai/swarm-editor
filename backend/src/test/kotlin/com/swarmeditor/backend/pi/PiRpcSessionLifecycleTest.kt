package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PiRpcSessionLifecycleTest {
    @Test
    fun `agent completion preserves normalized and provider stop reasons`() {
        val payload = Json.parseToJsonElement(
            """
            {
              "type": "agent_end",
              "messages": [
                { "role": "user", "content": "hello" },
                {
                  "role": "assistant",
                  "content": [],
                  "stopReason": "length",
                  "rawStopReason": "max_output_tokens",
                  "errorMessage": "provider limit"
                }
              ]
            }
            """.trimIndent(),
        ).jsonObject

        assertEquals(
            PiSessionEvent.AgentCompleted(
                stopReason = "length",
                rawStopReason = "max_output_tokens",
                errorMessage = "provider limit",
            ),
            parsePiAgentCompletion(payload),
        )
    }

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
    fun `steering and follow up messages are delivered while prompt is running`() = runBlocking {
        val fixture = runtimeFixture(LIVE_QUEUE_SERVER)
        val session = fixture.session(timeoutSeconds = 5)

        try {
            session.validate(5)
            val prompt = async { session.prompt("start", emptyList()) {} }
            withTimeout(2_000) { session.state.first { it?.isStreaming == true } }

            session.sendQueuedMessage("redirect", mode = PiQueuedMessageMode.STEER)
            session.sendQueuedMessage("continue", mode = PiQueuedMessageMode.FOLLOW_UP)

            assertEquals("steer:redirect|follow_up:continue", withTimeout(2_000) { prompt.await() })
            assertTrue(session.state.value?.pendingMessageCount == 2)
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `runtime controls use pi capabilities and expose retry lifecycle`() = runBlocking {
        val fixture = runtimeFixture(RUNTIME_CONTROL_SERVER)
        val session = fixture.session(timeoutSeconds = 5)

        try {
            session.validate(5)
            assertEquals(listOf("off", "low", "high"), session.getAvailableThinkingLevels())
            assertFalse(session.setAutoCompaction(false).autoCompactionEnabled)
            assertTrue(session.setAutoRetry(true).autoRetryEnabled)
            assertEquals("all", session.setSteeringMode("all").steeringMode)
            assertEquals("all", session.setFollowUpMode("all").followUpMode)

            val prompt = async { session.prompt("retry", emptyList()) {} }
            val retrying = withTimeout(2_000) { session.state.first { it?.isRetrying == true } }
            assertEquals(1, retrying?.retryAttempt)
            assertEquals(3, retrying?.retryMaxAttempts)
            assertEquals(250L, retrying?.retryDelayMillis)

            session.abortRetry()
            val retryEnded = withTimeout(2_000) {
                session.state.first { it?.isRetrying == false && it.retryErrorMessage == "Retry cancelled" }
            }
            assertEquals("Retry cancelled", retryEnded?.retryErrorMessage)
            assertEquals("retry cancelled", withTimeout(2_000) { prompt.await() })
        } finally {
            session.close()
            fixture.close()
        }
    }

    @Test
    fun `extension ui response is written while prompt holds the operation lock`() = runBlocking {
        val fixture = runtimeFixture(EXTENSION_UI_SERVER)
        val session = fixture.session(timeoutSeconds = 5)

        try {
            session.validate(5)
            val request = CompletableDeferred<PiExtensionUiRequest>()
            val prompt = async {
                session.prompt("choose", emptyList()) { event ->
                    if (event is PiSessionEvent.ExtensionUiRequested) request.complete(event.request)
                }
            }

            val extensionRequest = withTimeout(2_000) { request.await() }
            assertEquals(PiExtensionUiMethod.SELECT, extensionRequest.method)
            assertEquals(listOf("fast", "safe"), extensionRequest.options)
            session.respondToExtensionUi(extensionRequest.id, PiExtensionUiResponse.Value("safe"))

            assertEquals("safe", withTimeout(2_000) { prompt.await() })
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
        val entrypoint = root.resolve("pi-0.83.0/packages/coding-agent/dist/rpc-entry.js")
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
        val EXTENSION_UI_SERVER =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            let selected = "";
            const state = {
              sessionId: "remote-extension-ui",
              thinkingLevel: "medium",
              isStreaming: false,
              isCompacting: false,
              autoCompactionEnabled: true,
              messageCount: 0,
              pendingMessageCount: 0,
              tools: []
            };
            function respond(id, data = {}) {
              process.stdout.write(JSON.stringify({ type: "response", id, success: true, data }) + "\n");
            }
            input.on("line", (line) => {
              const command = JSON.parse(line);
              if (command.type === "get_state") {
                respond(command.id, state);
              } else if (command.type === "prompt") {
                state.isStreaming = true;
                respond(command.id);
                process.stdout.write(JSON.stringify({ type: "agent_start" }) + "\n");
                process.stdout.write(JSON.stringify({
                  type: "extension_ui_request",
                  id: "extension-request-1",
                  method: "select",
                  title: "Execution mode",
                  options: ["fast", "safe"]
                }) + "\n");
              } else if (command.type === "extension_ui_response") {
                selected = command.value;
                state.isStreaming = false;
                process.stdout.write(JSON.stringify({
                  type: "agent_end",
                  messages: [{ role: "assistant", content: [], stopReason: "stop" }]
                }) + "\n");
              } else if (command.type === "get_last_assistant_text") {
                respond(command.id, { text: selected });
              } else if (command.type === "get_session_stats") {
                respond(command.id, {
                  sessionId: state.sessionId,
                  userMessages: 1,
                  assistantMessages: 1,
                  toolCalls: 0,
                  toolResults: 0,
                  totalMessages: 2,
                  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                  cost: 0
                });
              } else if (command.type === "abort") {
                respond(command.id);
              }
            });
            """.trimIndent()

        val RUNTIME_CONTROL_SERVER =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            const state = {
              sessionId: "remote-runtime-controls",
              thinkingLevel: "low",
              isStreaming: false,
              isCompacting: false,
              steeringMode: "one-at-a-time",
              followUpMode: "one-at-a-time",
              autoCompactionEnabled: true,
              autoRetryEnabled: false,
              isRetrying: false,
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
                case "get_available_thinking_levels":
                  respond(command.id, true, { levels: ["off", "low", "high"] });
                  break;
                case "set_auto_compaction":
                  state.autoCompactionEnabled = command.enabled;
                  respond(command.id, true, {});
                  break;
                case "set_auto_retry":
                  state.autoRetryEnabled = command.enabled;
                  respond(command.id, true, {});
                  break;
                case "set_steering_mode":
                  state.steeringMode = command.mode;
                  respond(command.id, true, {});
                  break;
                case "set_follow_up_mode":
                  state.followUpMode = command.mode;
                  respond(command.id, true, {});
                  break;
                case "prompt":
                  state.isStreaming = true;
                  state.isRetrying = true;
                  respond(command.id, true, {});
                  process.stdout.write(JSON.stringify({ type: "agent_start" }) + "\n");
                  process.stdout.write(JSON.stringify({
                    type: "auto_retry_start",
                    attempt: 1,
                    maxAttempts: 3,
                    delayMs: 250,
                    errorMessage: "temporary provider error"
                  }) + "\n");
                  break;
                case "abort_retry":
                  state.isRetrying = false;
                  state.isStreaming = false;
                  respond(command.id, true, {});
                  process.stdout.write(JSON.stringify({
                    type: "auto_retry_end",
                    success: false,
                    attempt: 1,
                    finalError: "Retry cancelled"
                  }) + "\n");
                  process.stdout.write(JSON.stringify({ type: "agent_end" }) + "\n");
                  break;
                case "get_last_assistant_text":
                  respond(command.id, true, { text: "retry cancelled" });
                  break;
                case "get_session_stats":
                  respond(command.id, true, {
                    sessionId: state.sessionId,
                    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    cost: 0
                  });
                  break;
                case "abort":
                  respond(command.id, true, {});
                  break;
                default:
                  respond(command.id, false, {}, "unsupported: " + command.type);
              }
            });
            """.trimIndent()

        val LIVE_QUEUE_SERVER =
            """
            const readline = require("node:readline");
            const input = readline.createInterface({ input: process.stdin });
            const received = [];
            const state = {
              sessionId: "remote-live-queue",
              thinkingLevel: "high",
              isStreaming: false,
              isCompacting: false,
              steeringMode: "all",
              followUpMode: "one-at-a-time",
              autoCompactionEnabled: true,
              messageCount: 1,
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
                  state.isStreaming = true;
                  respond(command.id, true, {});
                  process.stdout.write(JSON.stringify({ type: "agent_start" }) + "\n");
                  break;
                case "steer":
                case "follow_up":
                  received.push(command.type + ":" + command.message);
                  state.pendingMessageCount = received.length;
                  respond(command.id, true, {});
                  if (command.type === "follow_up") {
                    state.isStreaming = false;
                    process.stdout.write(JSON.stringify({ type: "agent_end" }) + "\n");
                  }
                  break;
                case "get_last_assistant_text":
                  respond(command.id, true, { text: received.join("|") });
                  break;
                case "get_session_stats":
                  respond(command.id, true, {
                    sessionId: state.sessionId,
                    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    cost: 0
                  });
                  break;
                case "abort":
                  respond(command.id, true, {});
                  break;
                default:
                  respond(command.id, false, {}, "unsupported: " + command.type);
              }
            });
            """.trimIndent()

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
