package com.swarmeditor.backend.service

import com.swarmeditor.backend.activity.ActivityStore
import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.backend.pi.PiSessionStats
import com.swarmeditor.backend.pi.PiTokenUsage
import com.swarmeditor.backend.pi.PiConversationMessage
import com.swarmeditor.backend.pi.PiSessionMutationResult
import com.swarmeditor.backend.pi.PiSessionSnapshot
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.pi.PiQueuedMessageMode
import com.swarmeditor.backend.pi.PiExtensionUiResponse
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.TokenUsage
import com.swarmeditor.common.model.ToolExecution
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.Session
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.MutableStateFlow
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class ConversationServiceTest {
    private val now = Instant.parse("2026-07-18T00:00:00Z")

    @Test
    fun `first prompt creates pi runtime and persists remote session id`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val piSession = FakePiSession("pi-remote", "world")
        val runtimeProvider = FakePiSessionProvider(piSession)
        val session = Session("local-1", "pi-default", "Test", now, now)
        coEvery { sessionService.get("local-1") } returns session
        stubLaunchableAgent(agentService)

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .sendMessage("local-1", "hello")

        assertTrue(result.isSuccess)
        assertEquals("world", result.getOrNull())
        assertEquals("local-1", runtimeProvider.localSessionId)
        assertEquals(null, runtimeProvider.requestedRemoteSessionId)
        assertTrue(runtimeProvider.configValidated)
        coVerify { sessionService.associateRemoteSession("local-1", "pi-remote") }
        coVerify {
            sessionService.addMessage(
                "local-1",
                MessageRole.USER,
                match<List<ContentBlock>> { blocks -> blocks.single().text == "hello" }
            )
        }
        coVerify { sessionService.addMessage("local-1", MessageRole.ASSISTANT, "world") }
    }

    @Test
    fun `existing pi session id is reused`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(FakePiSession("pi-existing", "done"))
        val session = Session(
            id = "local-1",
            agentId = "pi-default",
            title = "Test",
            createdAt = now,
            updatedAt = now,
            remoteSessionId = "pi-existing"
        )
        coEvery { sessionService.get("local-1") } returns session
        stubLaunchableAgent(agentService)

        newConversationService(sessionService, agentService, runtimeProvider).sendMessage("local-1", "next")

        assertEquals("pi-existing", runtimeProvider.requestedRemoteSessionId)
        coVerify(exactly = 0) { sessionService.associateRemoteSession(any(), any()) }
    }

    @Test
    fun `live steering is delivered before the user message is persisted`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(
            session = FakePiSession("pi-live", ""),
            activeState = PiSessionState(
                pid = 42,
                sessionId = "pi-live",
                thinkingLevel = "high",
                isStreaming = true,
                isCompacting = false,
                autoCompactionEnabled = true,
                messageCount = 2,
                pendingMessageCount = 0,
            ),
        )
        coEvery { sessionService.get("local-live") } returns Session(
            "local-live",
            "pi-default",
            "Live",
            now,
            now,
            remoteSessionId = "pi-live",
        )

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .sendQueuedMessage("local-live", "focus on tests", mode = PiQueuedMessageMode.STEER)

        assertTrue(result.isSuccess)
        assertEquals("local-live", runtimeProvider.queuedSessionId)
        assertEquals("focus on tests", runtimeProvider.queuedMessage)
        assertEquals(PiQueuedMessageMode.STEER, runtimeProvider.queuedMode)
        coVerify {
            sessionService.addMessage(
                "local-live",
                MessageRole.USER,
                match<List<ContentBlock>> { blocks -> blocks.single().text == "focus on tests" },
            )
        }
    }

    @Test
    fun `runtime controls delegate to the active pi session`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(
            session = FakePiSession("pi-controls", ""),
            activeState = PiSessionState(
                pid = 42,
                sessionId = "pi-controls",
                thinkingLevel = "low",
                isStreaming = false,
                isCompacting = false,
                autoCompactionEnabled = true,
                messageCount = 1,
                pendingMessageCount = 0,
            ),
        )
        val service = newConversationService(sessionService, agentService, runtimeProvider)

        assertEquals(listOf("off", "low", "high"), service.getAvailableThinkingLevels("local-controls").getOrThrow())
        assertFalse(service.setAutoCompaction("local-controls", false).getOrThrow().autoCompactionEnabled)
        assertFalse(service.setAutoRetry("local-controls", false).getOrThrow().autoRetryEnabled)
        assertEquals("all", service.setSteeringMode("local-controls", "all").getOrThrow().steeringMode)
        assertEquals("all", service.setFollowUpMode("local-controls", "all").getOrThrow().followUpMode)
        assertTrue(service.abortRetry("local-controls").isSuccess)
        assertEquals(1, runtimeProvider.abortRetryCalls)
    }

    @Test
    fun `extension ui response delegates directly to the active pi session`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>(relaxed = true)
        val runtimeProvider = FakePiSessionProvider(FakePiSession("pi-extension", ""))
        val response = PiExtensionUiResponse.Value("safe")

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .respondToExtensionUi("local-extension", "request-1", response)

        assertTrue(result.isSuccess)
        assertEquals("local-extension", runtimeProvider.extensionUiSessionId)
        assertEquals("request-1", runtimeProvider.extensionUiRequestId)
        assertEquals(response, runtimeProvider.extensionUiResponse)
    }

    @Test
    fun `disconnected agent rejects a prompt before persistence or runtime launch`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(FakePiSession("pi-disconnected", "unexpected"))
        val session = Session("local-disconnected", "pi-default", "Disconnected", now, now)
        coEvery { sessionService.get("local-disconnected") } returns session
        coEvery { agentService.requireLaunchConfig("pi-default") } throws
            IllegalStateException("Agent profile is disconnected: pi-default")

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .sendMessage("local-disconnected", "hello")

        assertTrue(result.isFailure)
        assertContains(result.exceptionOrNull()?.message.orEmpty(), "disconnected")
        assertEquals(null, runtimeProvider.localSessionId)
        coVerify(exactly = 0) {
            sessionService.addMessage("local-disconnected", any<MessageRole>(), any<List<ContentBlock>>())
        }
    }

    @Test
    fun `failed user message persistence does not create a ghost activity`() = runTest {
        val sessionService = mockk<SessionService>()
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(FakePiSession("pi-unpersisted-user", "unexpected"))
        val session = Session("local-unpersisted-user", "pi-default", "Test", now, now)
        coEvery { sessionService.get("local-unpersisted-user") } returns session
        coEvery {
            sessionService.addMessage(
                "local-unpersisted-user",
                MessageRole.USER,
                any<List<ContentBlock>>(),
            )
        } throws IllegalStateException("disk full")
        stubLaunchableAgent(agentService)
        val service = newConversationService(sessionService, agentService, runtimeProvider)

        val events = service.streamMessage("local-unpersisted-user", "hello").toList()

        assertEquals("disk full", (events.single() as ConversationEvent.Failed).message)
        assertEquals(listOf("失败"), service.activities.value.map { it.action })
        assertEquals(null, runtimeProvider.localSessionId)
    }

    @Test
    fun `stream forwards pi deltas and persists the completed tool trace`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val piSession = FakePiSession(
            remoteSessionId = "pi-remote",
            response = "world",
            events = listOf(
                PiSessionEvent.ThinkingDelta("hidden"),
                PiSessionEvent.TextDelta("wo"),
                PiSessionEvent.ToolStarted("tool-1", "read", "{\"path\":\"README.md\"}"),
                PiSessionEvent.ToolFinished("tool-1", "read", "README contents", false),
                PiSessionEvent.TextDelta("rld")
            )
        )
        val session = Session("local-1", "pi-default", "Test", now, now)
        coEvery { sessionService.get("local-1") } returns session
        stubLaunchableAgent(agentService)

        val service = newConversationService(sessionService, agentService, FakePiSessionProvider(piSession))
        val events = service.streamMessage("local-1", "hello").toList()

        assertEquals("wo", (events[2] as ConversationEvent.TextDelta).text)
        assertEquals("read", (events[3] as ConversationEvent.ToolStarted).name)
        assertEquals("README contents", (events[4] as ConversationEvent.ToolFinished).output)
        assertEquals("world", (events.last() as ConversationEvent.Completed).text)
        assertEquals(
            listOf("发送", "运行 read", "工具完成", "完成"),
            service.activities.value.map { it.action }
        )
        assertTrue(service.activities.value.all { it.sessionId == "local-1" })
        assertEquals(ActivityType.FILE, service.activities.value[1].type)
        coVerify(exactly = 1) {
            sessionService.addMessage(
                "local-1",
                MessageRole.ASSISTANT,
                match<List<ContentBlock>> { blocks ->
                    blocks.first().text == "world" &&
                        blocks.last().toolExecution == ToolExecution(
                            id = "tool-1",
                            name = "read",
                            arguments = "{\"path\":\"README.md\"}",
                            output = "README contents",
                        )
                },
            )
        }
        coVerify(exactly = 0) { sessionService.addMessage("local-1", MessageRole.ASSISTANT, "world") }
    }

    @Test
    fun `stream applies backpressure without dropping pi events`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val deltas = (0 until 128).map { index -> PiSessionEvent.TextDelta("delta-$index") }
        val session = Session("local-backpressure", "pi-default", "Backpressure", now, now)
        coEvery { sessionService.get("local-backpressure") } returns session
        stubLaunchableAgent(agentService)
        val service = newConversationService(
            sessionService,
            agentService,
            FakePiSessionProvider(FakePiSession("pi-backpressure", "done", deltas)),
        )
        val releaseCollector = CompletableDeferred<Unit>()
        val events = mutableListOf<ConversationEvent>()

        val collection = async {
            service.streamMessage("local-backpressure", "hello")
                .buffer(0)
                .collect { event ->
                    events += event
                    if (event is ConversationEvent.Started) releaseCollector.await()
                }
        }
        yield()
        releaseCollector.complete(Unit)
        collection.await()

        assertEquals(
            deltas.map(PiSessionEvent.TextDelta::text),
            events.filterIsInstance<ConversationEvent.TextDelta>().map(ConversationEvent.TextDelta::text),
        )
        assertEquals("done", (events.last() as ConversationEvent.Completed).text)
    }

    @Test
    fun `concurrent prompts persist complete turns in pi execution order`() = runTest {
        val sessionService = mockk<SessionService>()
        val agentService = mockk<AgentService>()
        val session = Session("local-order", "pi-default", "Order", now, now)
        val firstPromptStarted = CompletableDeferred<Unit>()
        val releaseFirstPrompt = CompletableDeferred<Unit>()
        val persistedOrder = mutableListOf<String>()
        val piSession = object : PiSession {
            override val pid: Long = 43
            override val remoteSessionId: String = "pi-order"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                if (message == "first") {
                    firstPromptStarted.complete(Unit)
                    releaseFirstPrompt.await()
                }
                return "$message response"
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        coEvery { sessionService.get("local-order") } returns session
        stubLaunchableAgent(agentService)
        coEvery {
            sessionService.addMessage("local-order", MessageRole.USER, any<List<ContentBlock>>())
        } coAnswers {
            val blocks = arg<List<ContentBlock>>(2)
            persistedOrder += "user:${blocks.first().text}"
            null
        }
        coEvery {
            sessionService.addMessage("local-order", MessageRole.ASSISTANT, any<String>())
        } coAnswers {
            persistedOrder += "assistant:${arg<String>(2)}"
            null
        }
        coEvery { sessionService.associateRemoteSession(any(), any()) } returns Unit
        coEvery { sessionService.updateTokenUsage(any(), any()) } returns Unit
        val service = newConversationService(
            sessionService,
            agentService,
            FakePiSessionProvider(piSession),
        )

        val first = async { service.sendMessage("local-order", "first") }
        firstPromptStarted.await()
        val second = async { service.sendMessage("local-order", "second") }
        yield()

        assertEquals(listOf("user:first"), persistedOrder)
        releaseFirstPrompt.complete(Unit)
        assertTrue(first.await().isSuccess)
        assertTrue(second.await().isSuccess)
        assertEquals(
            listOf("user:first", "assistant:first response", "user:second", "assistant:second response"),
            persistedOrder,
        )
    }

    @Test
    fun `remote synchronization waits for the active prompt transaction`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val session = Session(
            id = "local-sync-lock",
            agentId = "pi-default",
            title = "Sync Lock",
            createdAt = now,
            updatedAt = now,
            remoteSessionId = "pi-sync-lock",
        )
        val promptStarted = CompletableDeferred<Unit>()
        val releasePrompt = CompletableDeferred<Unit>()
        val piSession = object : PiSession {
            override val pid: Long = 44
            override val remoteSessionId: String = "pi-sync-lock"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                promptStarted.complete(Unit)
                releasePrompt.await()
                return "completed"
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val snapshotState = PiSessionState(
            pid = 44,
            sessionId = "pi-sync-lock",
            thinkingLevel = "medium",
            isStreaming = false,
            isCompacting = false,
            autoCompactionEnabled = true,
            messageCount = 2,
            pendingMessageCount = 0,
        )
        var snapshotCalls = 0
        val runtimeProvider = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = piSession

            override suspend fun snapshot(sessionId: String): PiSessionSnapshot {
                snapshotCalls++
                return PiSessionSnapshot(
                    state = snapshotState,
                    messages = listOf(
                        PiConversationMessage("user", "prompt", 1_000),
                        PiConversationMessage("assistant", "completed", 2_000),
                    ),
                )
            }

            override suspend fun abort(sessionId: String) = Unit
            override suspend fun close(sessionId: String) = Unit
        }
        coEvery { sessionService.get("local-sync-lock") } returns session
        stubLaunchableAgent(agentService)
        coEvery {
            sessionService.reconcileRemoteSession("local-sync-lock", "pi-sync-lock", any())
        } returns (session to null)
        val service = newConversationService(sessionService, agentService, runtimeProvider)

        val send = async { service.sendMessage("local-sync-lock", "prompt") }
        promptStarted.await()
        val synchronize = async { service.synchronizeSession("local-sync-lock") }
        yield()

        assertEquals(0, snapshotCalls)
        releasePrompt.complete(Unit)
        assertTrue(send.await().isSuccess)
        assertTrue(synchronize.await().isSuccess)
        assertEquals(1, snapshotCalls)
    }

    @Test
    fun `completed pi reply reports remote recovery when local assistant persistence fails`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val session = Session("local-persist-failure", "pi-default", "Failure", now, now)
        coEvery { sessionService.get("local-persist-failure") } returns session
        stubLaunchableAgent(agentService)
        coEvery {
            sessionService.addMessage("local-persist-failure", MessageRole.ASSISTANT, any<String>())
        } throws IllegalStateException("disk full")

        val result = newConversationService(
            sessionService,
            agentService,
            FakePiSessionProvider(FakePiSession("pi-persist-failure", "completed remotely")),
        ).sendMessage("local-persist-failure", "prompt")

        assertTrue(result.isFailure)
        assertContains(result.exceptionOrNull()?.message.orEmpty(), "Pi 已完成回复")
        assertContains(result.exceptionOrNull()?.message.orEmpty(), "同步会话")
    }

    @Test
    fun `compaction delegates to pi and records activity`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val runtimeProvider = FakePiSessionProvider(FakePiSession("pi-remote", ""))
        val service = newConversationService(sessionService, agentService, runtimeProvider)

        val result = service.compactSession("local-1", "保留公共 API")

        assertTrue(result.isSuccess)
        assertEquals("local-1", runtimeProvider.compactedSessionId)
        assertEquals("保留公共 API", runtimeProvider.compactedInstructions)
        assertEquals("压缩上下文", service.activities.value.last().action)
    }

    @Test
    fun `forwards images to pi and persists image content`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val piSession = FakePiSession("pi-image", "described")
        val session = Session("local-image", "pi-default", "Image", now, now)
        val image = ImageData("aGVsbG8=", "image/png", "screen.png")
        coEvery { sessionService.get("local-image") } returns session
        stubLaunchableAgent(agentService)

        val result = newConversationService(sessionService, agentService, FakePiSessionProvider(piSession))
            .sendMessage("local-image", "describe", listOf(image))

        assertTrue(result.isSuccess)
        assertEquals(listOf(image), piSession.receivedImages)
        coVerify {
            sessionService.addMessage(
                "local-image",
                MessageRole.USER,
                match<List<ContentBlock>> { blocks ->
                    blocks.first().text == "describe" && blocks.last().image?.name == "screen.png"
                }
            )
        }
    }

    @Test
    fun `closing a session waits for the active prompt transaction`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val promptStarted = CompletableDeferred<Unit>()
        val releasePrompt = CompletableDeferred<Unit>()
        val piSession = object : PiSession {
            override val pid: Long = 44
            override val remoteSessionId: String = "pi-close-order"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                promptStarted.complete(Unit)
                releasePrompt.await()
                return "done"
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val runtimeProvider = FakePiSessionProvider(piSession)
        val session = Session("local-close-order", "pi-default", "Close", now, now)
        coEvery { sessionService.get("local-close-order") } returns session
        stubLaunchableAgent(agentService)
        val service = newConversationService(sessionService, agentService, runtimeProvider)

        val prompt = async { service.streamMessage("local-close-order", "hello").toList() }
        promptStarted.await()
        val closing = async { service.closeSession("local-close-order").getOrThrow() }
        yield()

        assertTrue(runtimeProvider.closedSessionIds.isEmpty())
        releasePrompt.complete(Unit)
        prompt.await()
        closing.await()

        assertEquals(listOf("local-close-order"), runtimeProvider.closedSessionIds)
        coVerify { sessionService.close("local-close-order") }
    }

    @Test
    fun `persists freshly refreshed token usage after prompt`() = runTest {
        val sessionService = mockk<SessionService>(relaxed = true)
        val agentService = mockk<AgentService>()
        val session = Session("local-token", "pi-default", "Token", now, now)
        val stats = PiSessionStats(
            sessionId = "pi-token",
            userMessages = 1,
            assistantMessages = 1,
            toolCalls = 0,
            toolResults = 0,
            totalMessages = 2,
            tokens = PiTokenUsage(input = 100, output = 25, cacheRead = 10, cacheWrite = 5, total = 140),
            cost = 0.012,
        )
        coEvery { sessionService.get("local-token") } returns session
        stubLaunchableAgent(agentService)

        newConversationService(
            sessionService,
            agentService,
            FakePiSessionProvider(FakePiSession("pi-token", "done"), stats),
        ).sendMessage("local-token", "hello")

        coVerify {
            sessionService.updateTokenUsage(
                "local-token",
                TokenUsage(input = 100, output = 25, cacheRead = 10, cacheWrite = 5, total = 140, cost = 0.012),
            )
        }
    }

    @Test
    fun `fork replaces local history and preserves the original branch`() = runTest {
        val sessionService = mockk<SessionService>()
        val agentService = mockk<AgentService>(relaxed = true)
        val original = Session("local-branch", "pi-default", "Branch", now, now)
        val backup = original.copy(id = "backup-1", title = "Branch · 原分支")
        val state = PiSessionState(
            pid = 77,
            sessionId = "remote-branch",
            thinkingLevel = "medium",
            isStreaming = false,
            isCompacting = false,
            autoCompactionEnabled = true,
            messageCount = 2,
            pendingMessageCount = 0,
        )
        val mutation = PiSessionMutationResult(
            cancelled = false,
            selectedText = "Rewrite this",
            state = state,
            messages = listOf(
                PiConversationMessage("user", "Earlier prompt", 1000),
                PiConversationMessage(
                    "assistant",
                    "Earlier answer",
                    2000,
                    listOf(
                        ToolExecution(
                            id = "tool-branch",
                            name = "read",
                            arguments = "{\"path\":\"README.md\"}",
                            output = "branch contents",
                        )
                    ),
                ),
            ),
        )
        val runtimeProvider = FakePiSessionProvider(
            session = FakePiSession("remote-original", ""),
            forkResult = mutation,
        )
        coEvery {
            sessionService.applyRemoteBranch(
                "local-branch",
                "remote-branch",
                any(),
            )
        } returns (original.copy(remoteSessionId = "remote-branch") to backup)

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .forkSession("local-branch", "entry-1")

        assertTrue(result.isSuccess)
        assertEquals("entry-1", runtimeProvider.forkedEntryId)
        coVerify {
            sessionService.applyRemoteBranch(
                "local-branch",
                "remote-branch",
                match { messages ->
                    messages.map { it.role } == listOf(MessageRole.USER, MessageRole.ASSISTANT) &&
                        messages[0].content.single().text == "Earlier prompt" &&
                        messages[1].content.first().text == "Earlier answer" &&
                        messages[1].content.last().toolExecution?.output == "branch contents"
                },
            )
        }
    }

    @Test
    fun `fork reports how to recover when local persistence fails after pi mutation`() = runTest {
        val sessionService = mockk<SessionService>()
        val agentService = mockk<AgentService>(relaxed = true)
        val state = PiSessionState(
            pid = 79,
            sessionId = "remote-unpersisted",
            thinkingLevel = "medium",
            isStreaming = false,
            isCompacting = false,
            autoCompactionEnabled = true,
            messageCount = 0,
            pendingMessageCount = 0,
        )
        val runtimeProvider = FakePiSessionProvider(
            session = FakePiSession("remote-original", ""),
            forkResult = PiSessionMutationResult(cancelled = false, state = state),
        )
        coEvery {
            sessionService.applyRemoteBranch("local-unpersisted", "remote-unpersisted", any())
        } throws IllegalStateException("disk full")

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .forkSession("local-unpersisted", "entry-2")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("同步会话"))
    }

    @Test
    fun `synchronizes the local session from the active pi runtime`() = runTest {
        val sessionService = mockk<SessionService>()
        val agentService = mockk<AgentService>(relaxed = true)
        val state = PiSessionState(
            pid = 78,
            sessionId = "remote-recovered",
            thinkingLevel = "medium",
            isStreaming = false,
            isCompacting = false,
            autoCompactionEnabled = true,
            messageCount = 1,
            pendingMessageCount = 0,
        )
        val runtimeProvider = FakePiSessionProvider(
            session = FakePiSession("remote-original", ""),
            snapshotResult = PiSessionSnapshot(
                state,
                listOf(PiConversationMessage("user", "Recovered prompt", 3_000)),
            ),
        )
        val synchronized = Session("local-recovery", "pi-default", "Recovery", now, now)
        coEvery {
            sessionService.reconcileRemoteSession("local-recovery", "remote-recovered", any())
        } returns (synchronized.copy(remoteSessionId = "remote-recovered") to null)

        val result = newConversationService(sessionService, agentService, runtimeProvider)
            .synchronizeSession("local-recovery")

        assertTrue(result.isSuccess)
        coVerify {
            sessionService.reconcileRemoteSession(
                "local-recovery",
                "remote-recovered",
                match { it.single().content.single().text == "Recovered prompt" },
            )
        }
    }
}

private class FakePiSession(
    override val remoteSessionId: String,
    private val response: String,
    private val events: List<PiSessionEvent> = emptyList()
) : PiSession {
    override val pid: Long = 42
    var receivedImages: List<ImageData> = emptyList()
    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit
    ): String {
        receivedImages = images
        events.forEach { event -> onEvent(event) }
        return response
    }
    override suspend fun abort() = Unit
    override suspend fun close() = Unit
}

private fun newConversationService(
    sessionService: SessionService,
    agentService: AgentService,
    runtimeProvider: PiSessionProvider,
): ConversationService {
    val activityFile = Files.createTempDirectory("swarm-activity-test").resolve("activity.json").toFile()
    activityFile.parentFile.deleteOnExit()
    activityFile.deleteOnExit()
    return ConversationService(sessionService, agentService, runtimeProvider, ActivityStore(activityFile))
}

private fun stubLaunchableAgent(
    agentService: AgentService,
    config: AgentConfig = AgentConfig("pi-default", "Pi"),
) {
    coEvery { agentService.requireLaunchConfig(config.id) } returns config
    coEvery { agentService.isLaunchConfigCurrent(config) } returns true
}

private class FakePiSessionProvider(
    private val session: PiSession,
    private val refreshedStats: PiSessionStats? = null,
    private val forkResult: PiSessionMutationResult? = null,
    private val snapshotResult: PiSessionSnapshot? = null,
    activeState: PiSessionState? = null,
) : PiSessionProvider {
    private val stateFlow = MutableStateFlow(activeState)
    var localSessionId: String? = null
    var requestedRemoteSessionId: String? = null
    var compactedSessionId: String? = null
    var compactedInstructions: String? = null
    var forkedEntryId: String? = null
    var configValidated: Boolean = false
    var queuedSessionId: String? = null
    var queuedMessage: String? = null
    var queuedMode: PiQueuedMessageMode? = null
    var extensionUiSessionId: String? = null
    var extensionUiRequestId: String? = null
    var extensionUiResponse: PiExtensionUiResponse? = null
    var abortRetryCalls = 0
    val closedSessionIds = mutableListOf<String>()

    override suspend fun getOrCreate(
        sessionId: String,
        config: AgentConfig,
        remoteSessionId: String?
    ): PiSession {
        localSessionId = sessionId
        requestedRemoteSessionId = remoteSessionId
        return session
    }

    override suspend fun getOrCreateValidated(
        sessionId: String,
        config: AgentConfig,
        remoteSessionId: String?,
        isConfigCurrent: suspend () -> Boolean,
    ): PiSession {
        configValidated = true
        check(isConfigCurrent()) { "Agent config is stale" }
        return getOrCreate(sessionId, config, remoteSessionId)
    }

    override suspend fun abort(sessionId: String) = Unit
    override fun state(sessionId: String) = stateFlow
    override suspend fun sendQueuedMessage(
        sessionId: String,
        message: String,
        images: List<ImageData>,
        mode: PiQueuedMessageMode,
    ) {
        queuedSessionId = sessionId
        queuedMessage = message
        queuedMode = mode
    }
    override suspend fun respondToExtensionUi(
        sessionId: String,
        requestId: String,
        response: PiExtensionUiResponse,
    ) {
        extensionUiSessionId = sessionId
        extensionUiRequestId = requestId
        extensionUiResponse = response
    }
    override suspend fun getAvailableThinkingLevels(sessionId: String): List<String> =
        listOf("off", "low", "high")
    override suspend fun setAutoCompaction(sessionId: String, enabled: Boolean): PiSessionState =
        updateState { copy(autoCompactionEnabled = enabled) }
    override suspend fun setAutoRetry(sessionId: String, enabled: Boolean): PiSessionState =
        updateState { copy(autoRetryEnabled = enabled) }
    override suspend fun abortRetry(sessionId: String) {
        abortRetryCalls++
    }
    override suspend fun setSteeringMode(sessionId: String, mode: String): PiSessionState =
        updateState { copy(steeringMode = mode) }
    override suspend fun setFollowUpMode(sessionId: String, mode: String): PiSessionState =
        updateState { copy(followUpMode = mode) }
    override suspend fun close(sessionId: String) {
        closedSessionIds += sessionId
    }
    override suspend fun refreshStats(sessionId: String): PiSessionStats =
        refreshedStats ?: error("stats unavailable")
    override suspend fun compact(sessionId: String, customInstructions: String?): com.swarmeditor.backend.pi.PiCompactionResult {
        compactedSessionId = sessionId
        compactedInstructions = customInstructions
        return com.swarmeditor.backend.pi.PiCompactionResult("summary", "entry", 5000, 1500)
    }
    override suspend fun fork(sessionId: String, entryId: String): PiSessionMutationResult {
        forkedEntryId = entryId
        return forkResult ?: error("fork unavailable")
    }
    override suspend fun snapshot(sessionId: String): PiSessionSnapshot =
        snapshotResult ?: error("snapshot unavailable")

    private fun updateState(transform: PiSessionState.() -> PiSessionState): PiSessionState =
        checkNotNull(stateFlow.value).transform().also { stateFlow.value = it }
}
