package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ConversationGateway
import com.swarmeditor.backend.service.ConversationEvent
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.pi.PiExtensionUiMethod
import com.swarmeditor.backend.pi.PiExtensionUiRequest
import com.swarmeditor.backend.pi.PiExtensionUiResponse
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.backend.pi.PiQueuedMessageMode
import com.swarmeditor.backend.pi.PiSessionMutationResult
import com.swarmeditor.backend.pi.PiSessionSnapshot
import com.swarmeditor.backend.pi.PiConversationMessage
import com.swarmeditor.backend.pi.PiSessionTree
import com.swarmeditor.backend.pi.PiSessionTreeNode
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.ToolExecution
import kotlinx.coroutines.async
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import java.nio.file.Files
import java.util.Base64
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class SessionViewModelTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `workspace reset clears the selected session and pi controls`() = runTest {
        val directory = Files.createTempDirectory("session-vm-workspace-reset")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Workspace session")
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)

            viewModel.selectSession(session.id)
            viewModel.resetForWorkspace()

            assertNull(viewModel.currentSessionId.value)
            assertTrue(viewModel.piCommands.value.isEmpty())
            assertTrue(viewModel.piModels.value.isEmpty())
            assertNull(viewModel.piSessionTree.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects blank messages without starting work`() = runTest {
        val directory = Files.createTempDirectory("session-vm")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)

            assertFalse(viewModel.sendMessage("   ", "pi-default"))
            assertFalse(viewModel.isSending.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `publishes one-shot error when conversation fails`() = runTest {
        val directory = Files.createTempDirectory("session-vm")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = FakeConversationGateway(Result.failure(IllegalStateException("Agent not connected")))
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val event = backgroundScope.async { viewModel.errorEvents.first() }

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            advanceUntilIdle()

            assertEquals("Agent not connected", event.await())
            assertFalse(viewModel.isSending.value)
            assertEquals("hello", gateway.lastContent)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `publishes streaming assistant text before completion`() = runTest {
        val directory = Files.createTempDirectory("session-vm-stream")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val release = CompletableDeferred<Unit>()
            val gateway = StreamingConversationGateway(release)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val partial = backgroundScope.async {
                viewModel.messages.first { messages -> messages.lastOrNull()?.text == "partial" }
            }

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            advanceTimeBy(24)
            val partialMessages = partial.await()
            assertEquals("partial", partialMessages.last().text)
            assertTrue(partialMessages.last().isThinking)

            release.complete(Unit)
            viewModel.isSending.first { !it }
            assertFalse(viewModel.isSending.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `submits extension ui response and clears the active request`() = runTest {
        val directory = Files.createTempDirectory("session-vm-extension")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = ExtensionUiConversationGateway(Result.success(Unit))
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            val request = viewModel.piExtensionUiRequest.first { it != null }
            assertEquals(PiExtensionUiMethod.SELECT, request?.method)

            viewModel.respondToPiExtensionUi(PiExtensionUiResponse.Value("safe"))
            viewModel.isSending.first { !it }

            assertEquals("safe", (gateway.response as PiExtensionUiResponse.Value).value)
            assertEquals(null, viewModel.piExtensionUiRequest.value)
            assertFalse(viewModel.piExtensionUiBusy.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `restores extension ui request when response delivery fails`() = runTest {
        val directory = Files.createTempDirectory("session-vm-extension-failure")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = ExtensionUiConversationGateway(Result.failure(IllegalStateException("writer closed")))
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            val request = viewModel.piExtensionUiRequest.first { it != null }
            viewModel.respondToPiExtensionUi(PiExtensionUiResponse.Value("safe"))
            runCurrent()

            assertEquals(request, viewModel.piExtensionUiRequest.value)
            assertFalse(viewModel.piExtensionUiBusy.value)
            assertEquals("writer closed", viewModel.lastError.value)
            viewModel.cancelSending()
            advanceUntilIdle()
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `streaming updates reuse already mapped persisted messages`() = runTest {
        val directory = Files.createTempDirectory("session-vm-stream-cache")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Cached history")
            service.addMessage(session.id, MessageRole.USER, listOf(ContentBlock(text = "history")))
            val release = CompletableDeferred<Unit>()
            val viewModel = SessionViewModel(service, StreamingConversationGateway(release), backgroundScope)
            viewModel.loadSessions()

            val persistedMessage = viewModel.messages.first { it.size == 1 }.single()
            val partial = backgroundScope.async {
                viewModel.messages.first { messages -> messages.lastOrNull()?.text == "partial" }
            }

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            advanceTimeBy(24)
            val partialMessages = partial.await()

            assertSame(persistedMessage, partialMessages.first())
            release.complete(Unit)
            viewModel.isSending.first { !it }
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `restores persisted pi tool trace after reopening a session`() = runTest {
        val directory = Files.createTempDirectory("session-vm-tool-history")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Tool history")
            service.addMessage(
                session.id,
                MessageRole.ASSISTANT,
                listOf(
                    ContentBlock(type = "text", text = "Done"),
                    ContentBlock(
                        type = "tool",
                        toolExecution = ToolExecution(
                            id = "tool-1",
                            name = "read",
                            arguments = "{\"path\":\"README.md\"}",
                            output = "README contents\nsecond line",
                        ),
                    ),
                ),
            )
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)
            viewModel.selectSession(session.id)

            val message = viewModel.messages.first { messages -> messages.singleOrNull()?.toolCards?.isNotEmpty() == true }.single()

            assertEquals("Done", message.text)
            val toolCard = message.toolCards.single()
            assertEquals("read", toolCard.title)
            assertEquals("file", toolCard.iconType)
            assertTrue(toolCard.command.contains("\"path\""))
            assertEquals("README contents\nsecond line", toolCard.output)
            assertTrue(toolCard.resultOk)
            assertTrue(toolCard.showResult)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `maps pi tool lifecycle into expandable cards`() {
        val running = runningToolCard("bash", "{\"command\":\"pwd\"}")
        val completed = completedToolCard(
            name = "",
            output = "/workspace",
            isError = true,
            previous = running,
        )

        assertEquals("bash", running.title)
        assertEquals("terminal", running.iconType)
        assertEquals("运行中", running.duration)
        assertFalse(running.showResult)
        assertTrue(running.command.contains("\"command\""))
        assertEquals("bash", completed.title)
        assertEquals("terminal", completed.iconType)
        assertEquals("/workspace", completed.output)
        assertFalse(completed.resultOk)
        assertTrue(completed.showResult)
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancel sending cancels flow and requests pi abort`() = runTest {
        val directory = Files.createTempDirectory("session-vm-cancel")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = CancellableConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            gateway.collectionStarted.await()
            viewModel.cancelSending()
            gateway.cancelCompleted.await()
            gateway.collectionCancelCompleted.await()
            viewModel.isSending.first { !it }

            assertFalse(viewModel.isSending.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cancel sending lets pi finish the aborted partial response`() = runTest {
        val directory = Files.createTempDirectory("session-vm-graceful-cancel")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = AbortCompletingConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            gateway.collectionStarted.await()
            viewModel.cancelSending()
            gateway.collectionCompleted.await()
            viewModel.isSending.first { !it }

            assertEquals(listOf("abort", "completed"), gateway.operations)
            assertFalse(gateway.collectionCanceled)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `queues live steering without stopping the active response`() = runTest {
        val directory = Files.createTempDirectory("session-vm-live-steering")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Live steering")
            val gateway = QueueingConversationGateway(session.id)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(session.id)

            assertTrue(viewModel.sendMessage("start", "pi-default"))
            gateway.collectionStarted.await()
            assertTrue(viewModel.sendQueuedMessage("focus on tests", mode = PiQueuedMessageMode.STEER))
            gateway.queued.await()

            assertEquals("focus on tests", gateway.queuedMessage)
            assertEquals(PiQueuedMessageMode.STEER, gateway.queuedMode)
            assertTrue(viewModel.isSending.value)
            assertFalse(viewModel.queuedMessageBusy.value)

            gateway.release.complete(Unit)
            viewModel.isSending.first { !it }
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `switching sessions cannot reroute an active response`() = runTest {
        val directory = Files.createTempDirectory("session-vm-switch")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val first = service.create("pi-default", "First")
            val second = service.create("pi-default", "Second")
            val release = CompletableDeferred<Unit>()
            val gateway = SessionCapturingStreamingGateway(release)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(first.id)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            gateway.collectionStarted.await()
            viewModel.selectSession(second.id)
            viewModel.isSending.first { !it }

            assertEquals(first.id, gateway.sessionId)
            assertTrue(service.get(second.id)?.messages.orEmpty().isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `closing an active session waits for stream cancellation before closing runtime`() = runTest {
        val directory = Files.createTempDirectory("session-vm-close-order")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Active")
            val gateway = CloseOrderingConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(session.id)

            assertTrue(viewModel.sendMessage("hello", "pi-default"))
            gateway.collectionStarted.await()
            viewModel.closeSession(session.id)
            gateway.closeCompleted.await()

            assertEquals(listOf("abort", "flow-cancelled", "close"), gateway.operations)
            assertFalse(viewModel.isSending.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `follows runtime state for the current session`() = runTest {
        val directory = Files.createTempDirectory("session-vm-runtime")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Runtime")
            val runtime = PiSessionState(
                pid = 99,
                sessionId = "remote-runtime",
                thinkingLevel = "high",
                isStreaming = true,
                isCompacting = false,
                autoCompactionEnabled = true,
                messageCount = 3,
                pendingMessageCount = 0
            )
            val gateway = RuntimeStateConversationGateway(session.id, runtime)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val observed = backgroundScope.async {
                viewModel.runtimeState.first { it?.sessionId == "remote-runtime" }
            }

            viewModel.loadSessions()

            assertEquals(99, observed.await()?.pid)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `loads models and updates live pi runtime controls`() = runTest {
        val directory = Files.createTempDirectory("session-vm-runtime-controls")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Runtime controls")
            val model = PiModelInfo(
                provider = "openai",
                id = "gpt-5.6",
                name = "GPT-5.6",
                api = "openai-responses",
                reasoning = true,
                contextWindow = 400_000,
                maxTokens = 128_000,
            )
            val gateway = RuntimeControlConversationGateway(session.id, model)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(session.id)

            viewModel.refreshPiModels()
            runCurrent()
            assertEquals(listOf(model), viewModel.piModels.value)
            assertEquals(listOf("off", "low", "high"), viewModel.piThinkingLevels.value)

            assertTrue(viewModel.setPiModel(model))
            runCurrent()
            assertEquals(model, gateway.selectedModel)
            assertFalse(viewModel.runtimeControlBusy.value)

            assertTrue(viewModel.setPiThinkingLevel("high"))
            runCurrent()
            assertEquals("high", gateway.thinkingLevel)
            assertFalse(viewModel.runtimeControlBusy.value)

            assertTrue(viewModel.setPiAutoCompaction(false))
            runCurrent()
            assertFalse(gateway.autoCompactionEnabled)

            assertTrue(viewModel.setPiAutoRetry(false))
            runCurrent()
            assertFalse(gateway.autoRetryEnabled)

            assertTrue(viewModel.setPiSteeringMode("all"))
            runCurrent()
            assertEquals("all", gateway.steeringMode)

            assertTrue(viewModel.setPiFollowUpMode("all"))
            runCurrent()
            assertEquals("all", gateway.followUpMode)

            assertTrue(viewModel.abortPiRetry())
            runCurrent()
            assertEquals(1, gateway.abortRetryCalls)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `loads pi model catalog without an active conversation session`() = runTest {
        val directory = Files.createTempDirectory("session-vm-model-catalog")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val model = PiModelInfo(
                provider = "minimax",
                id = "MiniMax-M2.1",
                name = "MiniMax M2.1",
                api = "anthropic-messages",
                reasoning = true,
                contextWindow = 200_000,
                maxTokens = 64_000,
            )
            val gateway = object : ConversationGateway {
                override suspend fun getAvailableModelsForAgent(agentId: String): Result<List<PiModelInfo>> {
                    assertEquals("pi-default", agentId)
                    return Result.success(listOf(model))
                }

                override suspend fun sendMessage(
                    sessionId: String,
                    content: String,
                    images: List<ImageData>,
                ): Result<String> = Result.success("")

                override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
            }
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            viewModel.refreshPiModels()
            runCurrent()

            assertEquals(listOf(model), viewModel.piModels.value)
            assertTrue(viewModel.piThinkingLevels.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `refreshes pi branch tree and returns forked prompt to composer`() = runTest {
        val directory = Files.createTempDirectory("session-vm-branches")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Branching")
            val gateway = BranchConversationGateway(session.id)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(session.id)

            viewModel.refreshPiSessionTree()
            runCurrent()
            assertEquals("user-1", viewModel.piSessionTree.value?.roots?.single()?.entryId)

            val draft = backgroundScope.async { viewModel.composerDraftEvents.first() }
            assertTrue(viewModel.forkPiSession("user-1"))
            runCurrent()
            assertEquals("Original prompt", draft.await())
            assertEquals("user-1", gateway.forkedEntryId)

            assertTrue(viewModel.clonePiSession())
            assertTrue(viewModel.synchronizePiSession())
            assertTrue(viewModel.exportPiSessionHtml())
            runCurrent()
            assertEquals(1, gateway.cloneCalls)
            assertEquals(1, gateway.synchronizeCalls)
            assertEquals(1, gateway.exportCalls)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `compacts current pi session once and publishes success`() = runTest {
        val directory = Files.createTempDirectory("session-vm-compact")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Compact")
            val runtime = PiSessionState(
                pid = 101,
                sessionId = "remote-compact",
                thinkingLevel = "medium",
                isStreaming = false,
                isCompacting = false,
                autoCompactionEnabled = true,
                messageCount = 8,
                pendingMessageCount = 0
            )
            val release = CompletableDeferred<Unit>()
            val gateway = RuntimeStateConversationGateway(session.id, runtime, release)
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val event = backgroundScope.async { viewModel.events.first() }
            viewModel.loadSessions()

            assertTrue(viewModel.compactCurrentSession("保留最近的 API 约束"))
            assertFalse(viewModel.compactCurrentSession())
            assertFalse(viewModel.sendMessage("blocked", "pi-default"))
            release.complete(Unit)

            assertEquals(ToastType.SUCCESS, event.await().type)
            assertEquals(1, gateway.compactCalls)
            assertEquals("保留最近的 API 约束", gateway.lastCompactionInstructions)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `validates and sends image-only message`() = runTest {
        val directory = Files.createTempDirectory("session-vm-image")
        try {
            val imageFile = directory.resolve("screen.png").toFile().apply {
                writeBytes(byteArrayOf(1, 2, 3, 4))
            }
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val gateway = FakeConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val attachments = viewModel.prepareImageAttachments(listOf(imageFile.absolutePath)).getOrThrow()

            assertTrue(viewModel.sendMessage("", "pi-default", attachments))
            viewModel.isSending.first { !it }

            assertEquals("screen.png", gateway.lastImages.single().name)
            assertEquals(byteArrayOf(1, 2, 3, 4).toList(), Base64.getDecoder().decode(gateway.lastImages.single().base64).toList())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects unsupported attachment type`() = runTest {
        val directory = Files.createTempDirectory("session-vm-invalid-image")
        try {
            val file = directory.resolve("notes.txt").toFile().apply { writeText("not an image") }
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)

            assertTrue(viewModel.prepareImageAttachments(listOf(file.absolutePath)).isFailure)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `merges file and clipboard images without duplicates`() = runTest {
        val directory = Files.createTempDirectory("session-vm-merge-image")
        try {
            val imageFile = directory.resolve("screen.png").toFile().apply { writeBytes(byteArrayOf(1, 2, 3)) }
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)
            val fileAttachment = viewModel.prepareImageAttachments(listOf(imageFile.absolutePath)).getOrThrow().single()
            val clipboardAttachment = UiImageAttachment(
                id = "clipboard-1",
                path = "",
                name = "clipboard.png",
                mimeType = "image/png",
                sizeBytes = 3,
                base64 = "AQID",
            )

            val merged = viewModel.mergeImageAttachments(
                existing = listOf(fileAttachment),
                added = listOf(fileAttachment, clipboardAttachment),
            ).getOrThrow()

            assertEquals(listOf(fileAttachment.id, clipboardAttachment.id), merged.map(UiImageAttachment::id))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects negative attachment size metadata`() = runTest {
        val directory = Files.createTempDirectory("session-vm-negative-image")
        try {
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)
            val attachment = UiImageAttachment(
                id = "negative-size",
                path = "",
                name = "clipboard.png",
                mimeType = "image/png",
                sizeBytes = -1,
                base64 = "AQID",
            )

            assertTrue(viewModel.mergeImageAttachments(emptyList(), listOf(attachment)).isFailure)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `uses decoded image bytes for aggregate attachment limit`() = runTest {
        val directory = Files.createTempDirectory("session-vm-decoded-image-total")
        try {
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val gateway = FakeConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val encoded = Base64.getEncoder().encodeToString(ByteArray(5 * 1024 * 1024))
            val attachments = (1..4).map { index ->
                UiImageAttachment(
                    id = "clipboard-$index",
                    path = "",
                    name = "clipboard-$index.png",
                    mimeType = "image/png",
                    sizeBytes = 1,
                    base64 = encoded,
                )
            }

            assertTrue(viewModel.sendMessage("", "pi-default", attachments))
            viewModel.isSending.first { !it }

            assertContains(viewModel.lastError.value.orEmpty(), "图片总大小")
            assertTrue(gateway.lastImages.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `sends clipboard image from in-memory base64`() = runTest {
        val directory = Files.createTempDirectory("session-vm-clipboard-image")
        try {
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val gateway = FakeConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            val attachment = UiImageAttachment(
                id = "clipboard-1",
                path = "",
                name = "clipboard.png",
                mimeType = "image/png",
                sizeBytes = 3,
                base64 = "AQID",
            )

            assertTrue(viewModel.sendMessage("", "pi-default", listOf(attachment)))
            viewModel.isSending.first { !it }

            assertEquals("AQID", gateway.lastImages.single().base64)
            assertEquals("clipboard.png", gateway.lastImages.single().name)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects more than four prepared images`() = runTest {
        val directory = Files.createTempDirectory("session-vm-image-count")
        try {
            val paths = (1..5).map { index ->
                directory.resolve("screen-$index.png").toFile().apply { writeBytes(byteArrayOf(index.toByte())) }.absolutePath
            }
            val service = SessionService(SessionStore(directory.resolve("sessions").toFile())).also { it.init() }
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)

            assertTrue(viewModel.prepareImageAttachments(paths).isFailure)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `creates sessions bound to the active workspace`() = runTest {
        val directory = Files.createTempDirectory("session-vm-bind-workspace")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val viewModel = SessionViewModel(
                service,
                FakeConversationGateway(),
                backgroundScope,
                workspaceContextProvider = { SessionWorkspaceContext("workspace-1", "/work/alpha") },
            )

            viewModel.createSession("pi-default")
            runCurrent()

            val created = service.getAll().single()
            assertEquals("workspace-1", created.workspaceId)
            assertEquals("/work/alpha", created.cwd)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `filters sessions to the current workspace and marks archived`() = runTest {
        val directory = Files.createTempDirectory("session-vm-filter-workspace")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            service.create("pi-default", "Global session")
            val bound = service.create("pi-default", "Bound session", workspaceId = "workspace-1", cwd = "/work/alpha")
            service.archive(bound.id)

            val viewModel = SessionViewModel(
                service,
                FakeConversationGateway(),
                backgroundScope,
                workspaceContextProvider = { SessionWorkspaceContext("workspace-1", "/work/alpha") },
            )
            val shownFlow = backgroundScope.async { viewModel.sessions.first { it.isNotEmpty() } }
            viewModel.loadSessions()
            runCurrent()

            // 全局会话（workspaceId == null）在当前工作区也展示，但归档会话标记 isArchived
            val shown = shownFlow.await()
            assertEquals(setOf("Global session", "Bound session"), shown.map { it.title }.toSet())
            assertTrue(shown.single { it.title == "Bound session" }.isArchived)
            assertTrue(shown.single { it.title == "Global session" }.isArchived.not())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rename archive unarchive and delete update services and list`() = runTest {
        val directory = Files.createTempDirectory("session-vm-lifecycle")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "Initial")
            val viewModel = SessionViewModel(service, FakeConversationGateway(), backgroundScope)

            viewModel.renameSession(session.id, "Renamed")
            runCurrent()
            assertEquals("Renamed", service.get(session.id)?.title)

            viewModel.archiveSession(session.id)
            runCurrent()
            assertEquals(com.swarmeditor.common.model.SessionStatus.ARCHIVED, service.get(session.id)?.status)
            val archived = backgroundScope.async { viewModel.sessions.first { list -> list.any { it.isArchived } } }
            assertTrue(archived.await().single().isArchived)

            viewModel.unarchiveSession(session.id)
            runCurrent()
            assertEquals(com.swarmeditor.common.model.SessionStatus.ACTIVE, service.get(session.id)?.status)
            val restored = backgroundScope.async { viewModel.sessions.first { list -> list.any { !it.isArchived } } }
            assertTrue(restored.await().single().isArchived.not())

            viewModel.deleteSession(session.id)
            runCurrent()
            assertNull(service.get(session.id))
            val deleted = backgroundScope.async { viewModel.sessions.first { it.isEmpty() } }
            assertEquals(emptyList<UiSession>(), deleted.await())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists pi generated title when local title is still a default placeholder`() = runTest {
        val directory = Files.createTempDirectory("session-vm-pi-title")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val gateway = PiTitleConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)

            assertTrue(viewModel.sendMessage("请帮我重构会话模块", "pi-default"))
            viewModel.isSending.first { !it }

            val session = service.getAll().single()
            assertEquals("重构会话模块的思路", session.title)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `does not overwrite a user renamed session title with pi title`() = runTest {
        val directory = Files.createTempDirectory("session-vm-pi-title-keep")
        try {
            val service = SessionService(SessionStore(directory.toFile())).also { it.init() }
            val session = service.create("pi-default", "用户手改标题")
            val gateway = PiTitleConversationGateway()
            val viewModel = SessionViewModel(service, gateway, backgroundScope)
            viewModel.selectSession(session.id)

            assertTrue(viewModel.sendMessage("请帮我重构会话模块", "pi-default"))
            viewModel.isSending.first { !it }

            assertEquals("用户手改标题", service.get(session.id)?.title)
        } finally {
            directory.deleteRecursively()
        }
    }
}

private class PiTitleConversationGateway : ConversationGateway {
    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote-pi-title"))
        emit(ConversationEvent.TextDelta("我来分析一下"))
        emit(ConversationEvent.ExtensionTitleChanged("重构会话模块的思路"))
        emit(ConversationEvent.Completed("完成"))
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class FakeConversationGateway(
    private val sendResult: Result<String> = Result.success("ok")
) : ConversationGateway {
    var lastContent: String? = null
    var lastImages: List<ImageData> = emptyList()

    override suspend fun sendMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Result<String> {
        lastContent = content
        lastImages = images
        return sendResult
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class StreamingConversationGateway(
    private val release: CompletableDeferred<Unit>
) : ConversationGateway {
    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("done")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote"))
        emit(ConversationEvent.TextDelta("partial"))
        release.await()
        emit(ConversationEvent.Completed("partial"))
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class QueueingConversationGateway(
    private val sessionId: String,
) : ConversationGateway {
    val collectionStarted = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    val queued = CompletableDeferred<Unit>()
    private val runtime = MutableStateFlow(
        PiSessionState(
            pid = 404,
            sessionId = "remote-live-steering",
            thinkingLevel = "high",
            isStreaming = true,
            isCompacting = false,
            autoCompactionEnabled = true,
            messageCount = 1,
            pendingMessageCount = 0,
        )
    )
    var queuedMessage: String? = null
    var queuedMode: PiQueuedMessageMode? = null

    override fun runtimeState(sessionId: String): StateFlow<PiSessionState?> =
        if (sessionId == this.sessionId) runtime else MutableStateFlow(null)

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("done")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote-live-steering"))
        collectionStarted.complete(Unit)
        release.await()
        emit(ConversationEvent.Completed("done"))
    }

    override suspend fun sendQueuedMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
        mode: PiQueuedMessageMode,
    ): Result<Unit> {
        check(sessionId == this.sessionId)
        queuedMessage = content
        queuedMode = mode
        queued.complete(Unit)
        return Result.success(Unit)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class CancellableConversationGateway : ConversationGateway {
    val collectionStarted = CompletableDeferred<Unit>()
    val cancelCompleted = CompletableDeferred<Unit>()
    val collectionCancelCompleted = CompletableDeferred<Unit>()

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote"))
        collectionStarted.complete(Unit)
        try {
            awaitCancellation()
        } finally {
            collectionCancelCompleted.complete(Unit)
        }
    }

    override suspend fun cancelSession(sessionId: String): Result<Unit> {
        cancelCompleted.complete(Unit)
        return Result.success(Unit)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class AbortCompletingConversationGateway : ConversationGateway {
    val collectionStarted = CompletableDeferred<Unit>()
    val collectionCompleted = CompletableDeferred<Unit>()
    val operations = mutableListOf<String>()
    var collectionCanceled = false

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote"))
        emit(ConversationEvent.TextDelta("partial"))
        collectionStarted.complete(Unit)
        try {
            collectionCompleted.await()
            emit(ConversationEvent.Completed("partial"))
            operations += "completed"
        } finally {
            collectionCanceled = "completed" !in operations
        }
    }

    override suspend fun cancelSession(sessionId: String): Result<Unit> {
        operations += "abort"
        collectionCompleted.complete(Unit)
        return Result.success(Unit)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class SessionCapturingStreamingGateway(
    private val release: CompletableDeferred<Unit>
) : ConversationGateway {
    val collectionStarted = CompletableDeferred<Unit>()
    var sessionId: String? = null

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Flow<ConversationEvent> = flow {
        this@SessionCapturingStreamingGateway.sessionId = sessionId
        emit(ConversationEvent.Started("remote"))
        collectionStarted.complete(Unit)
        release.await()
        emit(ConversationEvent.Completed("done"))
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class ExtensionUiConversationGateway(
    private val responseResult: Result<Unit>,
) : ConversationGateway {
    private val release = CompletableDeferred<Unit>()
    var response: PiExtensionUiResponse? = null

    override suspend fun sendMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
    ): Result<String> = Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>,
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote-extension"))
        emit(
            ConversationEvent.ExtensionUiRequested(
                PiExtensionUiRequest(
                    id = "request-1",
                    method = PiExtensionUiMethod.SELECT,
                    title = "Execution mode",
                    options = listOf("fast", "safe"),
                )
            )
        )
        release.await()
        emit(ConversationEvent.Completed("done"))
    }

    override suspend fun respondToExtensionUi(
        sessionId: String,
        requestId: String,
        response: PiExtensionUiResponse,
    ): Result<Unit> {
        this.response = response
        if (responseResult.isSuccess) release.complete(Unit)
        return responseResult
    }

    override suspend fun cancelSession(sessionId: String): Result<Unit> {
        release.complete(Unit)
        return Result.success(Unit)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class CloseOrderingConversationGateway : ConversationGateway {
    val collectionStarted = CompletableDeferred<Unit>()
    val closeCompleted = CompletableDeferred<Unit>()
    val operations = mutableListOf<String>()

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override fun streamMessage(
        sessionId: String,
        content: String,
        images: List<ImageData>
    ): Flow<ConversationEvent> = flow {
        emit(ConversationEvent.Started("remote"))
        collectionStarted.complete(Unit)
        try {
            awaitCancellation()
        } finally {
            operations += "flow-cancelled"
        }
    }

    override suspend fun cancelSession(sessionId: String): Result<Unit> {
        operations += "abort"
        return Result.success(Unit)
    }

    override suspend fun closeSession(sessionId: String): Result<Unit> {
        operations += "close"
        closeCompleted.complete(Unit)
        return Result.success(Unit)
    }
}

private class RuntimeStateConversationGateway(
    private val sessionId: String,
    state: PiSessionState,
    private val compactRelease: CompletableDeferred<Unit>? = null
) : ConversationGateway {
    private val runtime = MutableStateFlow<PiSessionState?>(state)
    var compactCalls = 0
    var lastCompactionInstructions: String? = null

    override fun runtimeState(sessionId: String): StateFlow<PiSessionState?> =
        if (sessionId == this.sessionId) runtime else MutableStateFlow(null)

    override suspend fun compactSession(
        sessionId: String,
        customInstructions: String?
    ): Result<com.swarmeditor.backend.pi.PiCompactionResult> {
        compactCalls++
        lastCompactionInstructions = customInstructions
        compactRelease?.await()
        return Result.success(com.swarmeditor.backend.pi.PiCompactionResult("summary", "entry", 4000, 1200))
    }

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")
    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}

private class RuntimeControlConversationGateway(
    private val sessionId: String,
    private val model: PiModelInfo,
) : ConversationGateway {
    var selectedModel: PiModelInfo? = null
    var thinkingLevel: String? = null
    var autoCompactionEnabled = true
    var autoRetryEnabled = true
    var steeringMode = "one-at-a-time"
    var followUpMode = "one-at-a-time"
    var abortRetryCalls = 0

    override suspend fun getAvailableModels(sessionId: String): Result<List<PiModelInfo>> =
        Result.success(listOf(model))

    override suspend fun getAvailableThinkingLevels(sessionId: String): Result<List<String>> =
        Result.success(listOf("off", "low", "high"))

    override suspend fun setModel(sessionId: String, provider: String, modelId: String): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        check(provider == model.provider && modelId == model.id)
        selectedModel = model
        return Result.success(runtimeState(model, "medium"))
    }

    override suspend fun setThinkingLevel(sessionId: String, level: String): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        thinkingLevel = level
        return Result.success(runtimeState(model, level))
    }

    override suspend fun setAutoCompaction(sessionId: String, enabled: Boolean): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        autoCompactionEnabled = enabled
        return Result.success(runtimeState(model, thinkingLevel ?: "medium"))
    }

    override suspend fun setAutoRetry(sessionId: String, enabled: Boolean): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        autoRetryEnabled = enabled
        return Result.success(runtimeState(model, thinkingLevel ?: "medium"))
    }

    override suspend fun abortRetry(sessionId: String): Result<Unit> {
        check(sessionId == this.sessionId)
        abortRetryCalls++
        return Result.success(Unit)
    }

    override suspend fun setSteeringMode(sessionId: String, mode: String): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        steeringMode = mode
        return Result.success(runtimeState(model, thinkingLevel ?: "medium"))
    }

    override suspend fun setFollowUpMode(sessionId: String, mode: String): Result<PiSessionState> {
        check(sessionId == this.sessionId)
        followUpMode = mode
        return Result.success(runtimeState(model, thinkingLevel ?: "medium"))
    }

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)

    private fun runtimeState(model: PiModelInfo, level: String) = PiSessionState(
        pid = 202,
        sessionId = "remote-controls",
        provider = model.provider,
        modelId = model.id,
        modelName = model.name,
        contextWindow = model.contextWindow,
        maxTokens = model.maxTokens,
        thinkingLevel = level,
        isStreaming = false,
        isCompacting = false,
        autoCompactionEnabled = autoCompactionEnabled,
        messageCount = 0,
        pendingMessageCount = 0,
        autoRetryEnabled = autoRetryEnabled,
        steeringMode = steeringMode,
        followUpMode = followUpMode,
    )
}

private class BranchConversationGateway(
    private val sessionId: String,
) : ConversationGateway {
    private val state = PiSessionState(
        pid = 303,
        sessionId = "remote-branched",
        thinkingLevel = "medium",
        isStreaming = false,
        isCompacting = false,
        autoCompactionEnabled = true,
        messageCount = 2,
        pendingMessageCount = 0,
    )
    private val tree = PiSessionTree(
        roots = listOf(
            PiSessionTreeNode(
                entryId = "user-1",
                type = "message",
                role = "user",
                text = "Original prompt",
                children = listOf(
                    PiSessionTreeNode(
                        entryId = "assistant-1",
                        parentId = "user-1",
                        type = "message",
                        role = "assistant",
                        text = "Original response",
                    )
                )
            )
        ),
        leafId = "assistant-1",
    )
    var forkedEntryId: String? = null
    var cloneCalls = 0
    var synchronizeCalls = 0
    var exportCalls = 0

    override suspend fun getSessionTree(sessionId: String): Result<PiSessionTree> = Result.success(tree)

    override suspend fun forkSession(sessionId: String, entryId: String): Result<PiSessionMutationResult> {
        check(sessionId == this.sessionId)
        forkedEntryId = entryId
        return Result.success(PiSessionMutationResult(false, "Original prompt", state))
    }

    override suspend fun cloneSession(sessionId: String): Result<PiSessionMutationResult> {
        check(sessionId == this.sessionId)
        cloneCalls++
        return Result.success(PiSessionMutationResult(false, state = state))
    }

    override suspend fun synchronizeSession(sessionId: String): Result<PiSessionSnapshot> {
        check(sessionId == this.sessionId)
        synchronizeCalls++
        return Result.success(
            PiSessionSnapshot(
                state,
                listOf(PiConversationMessage("user", "Original prompt", 1_000)),
            )
        )
    }

    override suspend fun exportSessionHtml(sessionId: String): Result<String> {
        check(sessionId == this.sessionId)
        exportCalls++
        return Result.success("/tmp/session.html")
    }

    override suspend fun sendMessage(sessionId: String, content: String, images: List<ImageData>): Result<String> =
        Result.success("")

    override suspend fun closeSession(sessionId: String): Result<Unit> = Result.success(Unit)
}
