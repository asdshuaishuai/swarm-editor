package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PiRuntimeManagerTest {
    @Test
    fun `proxies active session snapshots`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-snapshot")
        try {
            val session = FakeStateSession(
                PiSessionState(
                    pid = 72,
                    sessionId = "remote-snapshot",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 1,
                    pendingMessageCount = 0,
                )
            )
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session },
            )
            manager.getOrCreate("local-snapshot", AgentConfig("pi", "Pi"), null)

            val snapshot = manager.snapshot("local-snapshot")

            assertEquals("remote-snapshot", snapshot.state.sessionId)
            assertEquals("snapshot message", snapshot.messages.single().text)
        } finally {
            managerSafeDelete(directory)
        }
    }

    @Test
    fun `publishes session state and clears it when closed`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-manager")
        try {
            val initial = PiSessionState(
                pid = 73,
                sessionId = "remote-1",
                thinkingLevel = "medium",
                isStreaming = false,
                isCompacting = false,
                autoCompactionEnabled = true,
                messageCount = 2,
                pendingMessageCount = 0
            )
            val session = FakeStateSession(initial)
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session }
            )
            val state = manager.state("local-1")

            assertNull(state.value)
            manager.getOrCreate("local-1", AgentConfig("pi", "Pi"), null)
            assertEquals("remote-1", state.value?.sessionId)
            assertEquals(300, manager.stats("local-1").value?.tokens?.total)

            session.mutableState.value = initial.copy(isStreaming = true)
            val streaming = withTimeout(2_000) { state.first { it?.isStreaming == true } }
            assertTrue(streaming?.isStreaming == true)

            val compacted = manager.compact("local-1")
            assertEquals(300, compacted.tokensBefore)
            assertTrue(session.compacted)

            manager.close("local-1")
            assertNull(state.value)
            assertTrue(session.closed)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `prepares the agent before creating its first session`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-prepare")
        try {
            val order = mutableListOf<String>()
            val session = FakeStateSession(
                PiSessionState(
                    pid = 74,
                    sessionId = "remote-2",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0
                )
            )
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                prepareAgent = { order += "prepare:${it.id}" },
                factory = PiSessionFactory { config, _, _ ->
                    order += "create:${config.id}"
                    session
                }
            )

            manager.getOrCreate("local-2", AgentConfig("review", "Review"), null)
            manager.getOrCreate("local-2", AgentConfig("review", "Review"), null)

            assertEquals(listOf("prepare:review", "create:review"), order)
            manager.closeAll()
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `slow session creation does not block a different session`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-parallel-create")
        val slowCreationStarted = CompletableDeferred<Unit>()
        val releaseSlowCreation = CompletableDeferred<Unit>()
        val manager = PiRuntimeManager(
            distribution = PiRuntimeDistribution(directory.toFile()),
            defaultWorkingDirectory = directory.toFile(),
            factory = PiSessionFactory { config, _, _ ->
                if (config.id == "slow") {
                    slowCreationStarted.complete(Unit)
                    releaseSlowCreation.await()
                }
                FakeStateSession(
                    PiSessionState(
                        pid = if (config.id == "slow") 90 else 91,
                        sessionId = "remote-${config.id}",
                        thinkingLevel = "medium",
                        isStreaming = false,
                        isCompacting = false,
                        autoCompactionEnabled = true,
                        messageCount = 0,
                        pendingMessageCount = 0,
                    ),
                )
            },
        )
        try {
            val slow = backgroundScope.async {
                manager.getOrCreate("local-slow", AgentConfig("slow", "Slow"), null)
            }
            slowCreationStarted.await()
            val fast = backgroundScope.async {
                manager.getOrCreate("local-fast", AgentConfig("fast", "Fast"), null)
            }

            assertEquals("remote-fast", withTimeout(1_000) { fast.await() }.remoteSessionId)
            releaseSlowCreation.complete(Unit)
            assertEquals("remote-slow", slow.await().remoteSessionId)
        } finally {
            releaseSlowCreation.complete(Unit)
            manager.closeAll()
            managerSafeDelete(directory)
        }
    }

    @Test
    fun `runtime created from a stale agent config is closed before publication`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-stale-agent")
        try {
            val config = AgentConfig("review", "Review")
            var currentConfig: AgentConfig? = config
            val creationStarted = CompletableDeferred<Unit>()
            val allowCreation = CompletableDeferred<Unit>()
            val session = FakeStateSession(
                PiSessionState(
                    pid = 79,
                    sessionId = "remote-stale-agent",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0,
                )
            )
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creationStarted.complete(Unit)
                    allowCreation.await()
                    session
                },
            )

            val creation = backgroundScope.async {
                runCatching {
                    manager.getOrCreateValidated("local-stale-agent", config, null) {
                        currentConfig == config
                    }
                }
            }
            creationStarted.await()
            currentConfig = null
            allowCreation.complete(Unit)

            val error = assertIs<IllegalStateException>(creation.await().exceptionOrNull())

            assertTrue(error.message.orEmpty().contains("changed or was disabled"))
            assertTrue(session.closed)
            assertNull(manager.state("local-stale-agent").value)
            assertNull(manager.stats("local-stale-agent").value)
        } finally {
            managerSafeDelete(directory)
        }
    }

    @Test
    fun `closing an agent waits for in-flight session creation and removes the created runtime`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-race")
        try {
            val creationStarted = CompletableDeferred<Unit>()
            val allowCreation = CompletableDeferred<Unit>()
            val session = FakeStateSession(
                PiSessionState(
                    pid = 75,
                    sessionId = "remote-race",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0
                )
            )
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creationStarted.complete(Unit)
                    allowCreation.await()
                    session
                }
            )
            val creation = backgroundScope.async {
                manager.getOrCreate("local-race", AgentConfig("review", "Review"), null)
            }
            creationStarted.await()

            val closing = backgroundScope.launch { manager.closeAgent("review") }
            yield()
            assertFalse(closing.isCompleted)

            allowCreation.complete(Unit)
            creation.await()
            closing.join()

            assertTrue(session.closed)
            assertNull(manager.state("local-race").value)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `recreates a session after its pi process is no longer alive`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-recovery")
        try {
            val deadSession = FakeStateSession(
                PiSessionState(
                    pid = 76,
                    sessionId = "remote-dead",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0,
                    isAlive = false
                )
            )
            val recoveredSession = FakeStateSession(
                PiSessionState(
                    pid = 77,
                    sessionId = "remote-recovered",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0
                )
            )
            var creations = 0
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creations++
                    if (creations == 1) deadSession else recoveredSession
                }
            )

            manager.getOrCreate("local-recovery", AgentConfig("review", "Review"), null)
            val recovered = manager.getOrCreate("local-recovery", AgentConfig("review", "Review"), "remote-dead")

            assertTrue(deadSession.closed)
            assertEquals("remote-recovered", recovered.remoteSessionId)
            assertEquals(2, creations)
            manager.closeAll()
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `recreates a session when its launch binding changes`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-binding")
        try {
            val sessions = mutableListOf<FakeStateSession>()
            val creations = mutableListOf<Pair<AgentConfig, String?>>()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { config, _, remoteSessionId ->
                    creations += config to remoteSessionId
                    FakeStateSession(
                        PiSessionState(
                            pid = 80L + creations.size,
                            sessionId = remoteSessionId ?: "generated-${creations.size}",
                            thinkingLevel = config.thinkingLevel.name.lowercase(),
                            isStreaming = false,
                            isCompacting = false,
                            autoCompactionEnabled = true,
                            messageCount = 0,
                            pendingMessageCount = 0,
                        ),
                    ).also(sessions::add)
                },
            )
            val initial = AgentConfig("review", "Review", model = "model-a")

            val first = manager.getOrCreate("local-binding", initial, null)
            val reused = manager.getOrCreate("local-binding", initial, "generated-1")
            val reconfigured = manager.getOrCreate(
                "local-binding",
                initial.copy(model = "model-b", systemPrompt = "Review deeply"),
                "generated-1",
            )
            val rebound = manager.getOrCreate(
                "local-binding",
                initial.copy(model = "model-b", systemPrompt = "Review deeply"),
                "different-remote",
            )

            assertTrue(first === reused)
            assertTrue(first !== reconfigured)
            assertTrue(reconfigured !== rebound)
            assertEquals(3, creations.size)
            assertTrue(sessions[0].closed)
            assertTrue(sessions[1].closed)
            assertFalse(sessions[2].closed)
            assertEquals("different-remote", rebound.remoteSessionId)
            manager.closeAll()
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed close keeps the session managed for a later retry`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-close-retry")
        try {
            val session = FailsOnceCloseStateSession()
            var creations = 0
            val config = AgentConfig("review", "Review")
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creations++
                    session
                },
            )
            val created = manager.getOrCreate("local-close-retry", config, null)

            assertFailsWith<IllegalStateException> {
                manager.close("local-close-retry")
            }
            val retained = manager.getOrCreate("local-close-retry", config, null)

            assertTrue(created === retained)
            assertEquals(1, creations)
            assertEquals(1, session.closeAttempts)

            manager.close("local-close-retry")

            assertEquals(2, session.closeAttempts)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `shutdown closes sessions and rejects new runtime creation`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-shutdown")
        try {
            val session = FakeStateSession(
                PiSessionState(
                    pid = 78,
                    sessionId = "remote-shutdown",
                    thinkingLevel = "medium",
                    isStreaming = false,
                    isCompacting = false,
                    autoCompactionEnabled = true,
                    messageCount = 0,
                    pendingMessageCount = 0
                )
            )
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session }
            )
            manager.getOrCreate("local-shutdown", AgentConfig("review", "Review"), null)

            manager.shutdown()
            manager.shutdown()

            assertTrue(session.closed)
            assertNull(manager.state("local-shutdown").value)
            assertFailsWith<IllegalStateException> {
                manager.getOrCreate("new-session", AgentConfig("review", "Review"), null)
            }
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed shutdown retains the pi session for cleanup retry`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-shutdown-retry")
        try {
            val session = FailsOnceCloseStateSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session },
            )
            manager.getOrCreate("local-shutdown-retry", AgentConfig("review", "Review"), null)

            assertFailsWith<IllegalStateException> { manager.shutdown() }
            assertFailsWith<IllegalStateException> {
                manager.getOrCreate("new-session", AgentConfig("review", "Review"), null)
            }
            assertEquals(1, session.closeAttempts)

            manager.shutdown()

            assertEquals(2, session.closeAttempts)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `shutdown closes every session when its caller is canceled`() = runTest {
        val directory = Files.createTempDirectory("pi-runtime-canceled-shutdown")
        try {
            val firstCloseStarted = CompletableDeferred<Unit>()
            val allowFirstClose = CompletableDeferred<Unit>()
            val first = GatedCloseSession("remote-first", firstCloseStarted, allowFirstClose)
            val second = GatedCloseSession("remote-second")
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { config, _, _ ->
                    when (config.id) {
                        "first" -> first
                        "second" -> second
                        else -> error("Unexpected test agent: ${config.id}")
                    }
                },
            )
            manager.getOrCreate("first", AgentConfig("first", "First"), null)
            manager.getOrCreate("second", AgentConfig("second", "Second"), null)

            val shutdown = async { manager.shutdown() }
            firstCloseStarted.await()
            shutdown.cancel()
            allowFirstClose.complete(Unit)

            assertFailsWith<CancellationException> { shutdown.await() }
            assertTrue(first.closed)
            assertTrue(second.closed)
            assertNull(manager.state("first").value)
            assertNull(manager.state("second").value)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }
}

private class FakeStateSession(initial: PiSessionState) : PiSession {
    val mutableState = MutableStateFlow<PiSessionState?>(initial)
    private val mutableStats = MutableStateFlow<PiSessionStats?>(
        PiSessionStats(
            sessionId = initial.sessionId,
            userMessages = 1,
            assistantMessages = 1,
            toolCalls = 0,
            toolResults = 0,
            totalMessages = 2,
            tokens = PiTokenUsage(200, 100, 0, 0, 300),
            cost = 0.01
        )
    )
    var closed = false
    var compacted = false

    override val pid: Long = initial.pid ?: 0
    override val remoteSessionId: String = initial.sessionId
    override val state = mutableState
    override val stats = mutableStats
    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit
    ): String = ""
    override suspend fun refreshState(): PiSessionState = checkNotNull(mutableState.value)
    override suspend fun refreshStats(): PiSessionStats = checkNotNull(mutableStats.value)
    override suspend fun compact(customInstructions: String?): PiCompactionResult {
        compacted = true
        return PiCompactionResult("summary", "entry", 300, 120)
    }
    override suspend fun snapshot(): PiSessionSnapshot = PiSessionSnapshot(
        state = checkNotNull(mutableState.value),
        messages = listOf(PiConversationMessage("assistant", "snapshot message", 1_000)),
    )
    override suspend fun abort() = Unit
    override suspend fun close() {
        closed = true
    }
}

private class GatedCloseSession(
    override val remoteSessionId: String,
    private val closeStarted: CompletableDeferred<Unit>? = null,
    private val allowClose: CompletableDeferred<Unit>? = null,
) : PiSession {
    var closed = false

    override val pid: Long? = null

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit,
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close() {
        closeStarted?.complete(Unit)
        allowClose?.await()
        closed = true
    }
}

private class FailsOnceCloseStateSession : PiSession {
    var closeAttempts = 0

    override val pid: Long = 81
    override val remoteSessionId: String = "remote-close-retry"

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit,
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close() {
        closeAttempts++
        if (closeAttempts == 1) error("pi process did not close")
    }
}

@OptIn(kotlin.io.path.ExperimentalPathApi::class)
private fun managerSafeDelete(directory: java.nio.file.Path) {
    directory.deleteRecursively()
}
