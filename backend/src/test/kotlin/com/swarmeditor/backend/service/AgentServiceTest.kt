package com.swarmeditor.backend.service

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.backend.pi.PiRuntimeDistribution
import com.swarmeditor.backend.pi.PiRuntimeInfo
import com.swarmeditor.backend.pi.PiRuntimeManager
import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionFactory
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmTask
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield

@OptIn(ExperimentalPathApi::class)
class AgentServiceTest {
    @Test
    fun `pi profile inherits inspected runtime availability after update`() = runTest {
        val directory = Files.createTempDirectory("agent-availability")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> ClosingSession() }
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                }
            )
            service.init()

            service.upsert(AgentConfig(id = AgentRegistry.DEFAULT_AGENT_ID, name = "Pi", model = "gpt-5")).getOrThrow()

            val pi = service.agents.value.single()
            assertEquals(AgentRegistry.DEFAULT_AGENT_ID, pi.config.id)
            assertEquals(AgentStatus.CONNECTED, pi.status)
            assertEquals("0.80.10", pi.version)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `updating primary model closes running pi sessions and publishes new config`() = runTest {
        val directory = Files.createTempDirectory("agent-service")
        try {
            val session = ClosingSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session }
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager
            )
            val original = AgentRegistry.defaultConfig().copy(modelConfigId = "primary-a")
            service.upsert(original).getOrThrow()
            manager.getOrCreate("session-1", original, null)

            service.upsert(original.copy(modelConfigId = "primary-b")).getOrThrow()

            assertTrue(session.closed)
            assertEquals("primary-b", service.agents.value.single().config.modelConfigId)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `primary model update invalidates in-flight pi startup without lock inversion`() = runTest {
        val directory = Files.createTempDirectory("agent-update-startup-race")
        val allowCreation = CompletableDeferred<Unit>()
        try {
            val creationStarted = CompletableDeferred<Unit>()
            val session = ClosingSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creationStarted.complete(Unit)
                    allowCreation.await()
                    session
                },
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
            )
            service.init()
            val original = service.requireLaunchConfig(AgentRegistry.DEFAULT_AGENT_ID)

            val creation = backgroundScope.async {
                runCatching {
                    manager.getOrCreateValidated("session-race", original, null) {
                        service.isLaunchConfigCurrent(original)
                    }
                }
            }
            creationStarted.await()
            val update = backgroundScope.async {
                service.upsert(original.copy(modelConfigId = "primary-b")).getOrThrow()
            }
            withTimeout(1_000) {
                while (service.isLaunchConfigCurrent(original)) yield()
            }
            allowCreation.complete(Unit)

            val creationError = withTimeout(1_000) { creation.await().exceptionOrNull() }
            withTimeout(1_000) { update.await() }

            assertTrue(creationError is IllegalStateException)
            assertTrue(session.closed)
            assertEquals("primary-b", service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
            assertTrue(service.isLaunchConfigCurrent(service.requireLaunchConfig(AgentRegistry.DEFAULT_AGENT_ID)))
        } finally {
            allowCreation.complete(Unit)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed runtime shutdown rolls back the primary model`() = runTest {
        val directory = Files.createTempDirectory("agent-update-rollback")
        try {
            val agentsFile = directory.resolve("agents.json").toFile()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> FailingCloseSession() },
            )
            val service = AgentService(AgentRegistry(agentsFile), manager)
            val original = AgentRegistry.defaultConfig().copy(modelConfigId = "primary-a")
            service.upsert(original).getOrThrow()
            manager.getOrCreate("session-1", original, null)

            val result = service.upsert(original.copy(modelConfigId = "primary-b"))

            assertTrue(result.isFailure)
            assertEquals("primary-a", service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
            assertEquals("primary-a", service.agents.value.single().config.modelConfigId)

            val reloaded = AgentRegistry(agentsFile)
            reloaded.load()
            assertEquals("primary-a", reloaded.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `canceled runtime shutdown rolls back the primary model`() = runTest {
        val directory = Files.createTempDirectory("agent-update-cancellation-rollback")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> CanceledCloseSession() },
            )
            val service = AgentService(AgentRegistry(directory.resolve("agents.json").toFile()), manager)
            val original = AgentRegistry.defaultConfig().copy(modelConfigId = "primary-a")
            service.upsert(original).getOrThrow()
            manager.getOrCreate("session-1", original, null)

            val cancellation = assertFailsWith<CancellationException> {
                service.upsert(original.copy(modelConfigId = "primary-b"))
            }

            assertEquals("pi shutdown canceled", cancellation.message)
            assertEquals("primary-a", service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
            assertEquals("primary-a", service.agents.value.single().config.modelConfigId)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `rejecting default profile deletion leaves its pi session running`() = runTest {
        val directory = Files.createTempDirectory("agent-delete-default")
        try {
            val session = ClosingSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session },
            )
            val service = AgentService(AgentRegistry(directory.resolve("agents.json").toFile()), manager)
            val config = AgentRegistry.defaultConfig()
            service.upsert(config).getOrThrow()
            manager.getOrCreate("session-1", config, null)

            val result = service.delete(AgentRegistry.DEFAULT_AGENT_ID)

            assertTrue(result.isFailure)
            assertFalse(session.closed)
            assertEquals(config, service.getConfig(AgentRegistry.DEFAULT_AGENT_ID))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed disconnect keeps the profile connected on the next scan`() = runTest {
        val directory = Files.createTempDirectory("agent-disconnect-rollback")
        try {
            val session = FailsOnceCloseSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> session },
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
            )
            service.init()
            val config = service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)!!
            manager.getOrCreate("session-1", config, null)

            val result = service.disconnect(config.id)

            assertTrue(result.isFailure)
            assertEquals(AgentStatus.CONNECTED, service.agents.value.single().status)
            val relaunched = service.requireLaunchConfig(config.id)
            assertEquals(config.id, relaunched.id)
            assertEquals(config.systemPrompt, relaunched.systemPrompt)
            assertTrue(service.isLaunchConfigCurrent(config))
            service.scan().getOrThrow()
            assertEquals(AgentStatus.CONNECTED, service.agents.value.single().status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `canceled disconnect restores launch eligibility before propagating cancellation`() = runTest {
        val directory = Files.createTempDirectory("agent-disconnect-cancellation")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> CanceledCloseSession() },
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
            )
            service.init()
            val config = service.requireLaunchConfig(AgentRegistry.DEFAULT_AGENT_ID)
            manager.getOrCreate("session-cancel-disconnect", config, null)

            val cancellation = assertFailsWith<CancellationException> {
                service.disconnect(config.id)
            }

            assertEquals("pi shutdown canceled", cancellation.message)
            assertEquals(AgentStatus.CONNECTED, service.agents.value.single().status)
            assertEquals(config, service.requireLaunchConfig(config.id))
            assertTrue(service.isLaunchConfigCurrent(config))
            assertTrue(service.getLaunchableConfigs().any { it.id == config.id })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `creates an ephemeral subagent with a role selected model`() = runTest {
        val directory = Files.createTempDirectory("agent-dynamic-model")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> ClosingSession() },
            )
            val modelService = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            modelService.init()
            modelService.upsert(
                ModelConfig(
                    id = "review-model",
                    name = "Review Model",
                    provider = "openai",
                    model = "gpt-review",
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    priority = 900,
                )
            ).getOrThrow()
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
                modelService = modelService,
            )
            service.init()
            val primary = service.requireLaunchConfig(AgentRegistry.DEFAULT_AGENT_ID)

            val dynamic = service.createDynamicAgent(
                SwarmTask(
                    id = "review-task",
                    title = "Review",
                    prompt = "Review integration boundaries",
                    role = SwarmAgentRole.REVIEWER,
                    agentId = "requested-reviewer",
                )
            )

            assertEquals(ModelRegistry.DEFAULT_MODEL_ID, primary.modelConfigId)
            assertEquals(AgentRegistry.DEFAULT_AGENT_ID, dynamic.id)
            assertEquals("review-model", dynamic.modelConfigId)
            assertEquals("openai", dynamic.provider)
            assertEquals("gpt-review", dynamic.model)
            assertEquals(1, service.agents.value.size)
            assertEquals(listOf(AgentRegistry.DEFAULT_AGENT_ID), service.getAllConfigs().map { it.id })
            assertTrue(service.isLaunchConfigCurrent(dynamic))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `dynamic agent allocation waits for model capacity`() = runTest {
        val directory = Files.createTempDirectory("dynamic-agent-capacity")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> ClosingSession() },
            )
            val modelService = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            modelService.init()
            modelService.upsert(ModelRegistry.defaultConfig().copy(enabled = false)).getOrThrow()
            modelService.upsert(
                ModelConfig(
                    id = "single-review-model",
                    name = "Single Review Model",
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    maxConcurrentAgents = 1,
                )
            ).getOrThrow()
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.83.0", "v22.19.0", directory.resolve("rpc-entry.js").toFile()))
                },
                modelService = modelService,
            )
            service.init()
            val firstTask = SwarmTask("review-first", "Review first", "Review first", SwarmAgentRole.REVIEWER)
            val secondTask = SwarmTask("review-second", "Review second", "Review second", SwarmAgentRole.REVIEWER)

            val first = service.acquireDynamicAgent(firstTask)
            val waiting = backgroundScope.async { service.acquireDynamicAgent(secondTask) }
            yield()

            assertFalse(waiting.isCompleted)
            assertEquals(mapOf(AgentRegistry.DEFAULT_AGENT_ID to 2), service.activeDynamicAgents.value)
            assertEquals(mapOf("single-review-model" to 1), modelService.activeAllocations.value)

            first.release()
            val second = withTimeout(1_000) { waiting.await() }
            assertEquals("single-review-model", second.config.modelConfigId)

            second.release()
            second.release()
            assertTrue(service.activeDynamicAgents.value.isEmpty())
            assertTrue(modelService.activeAllocations.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `legacy primary agent fields are normalized to system defaults`() = runTest {
        val directory = Files.createTempDirectory("agent-auto-start")
        try {
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ -> ClosingSession() },
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
            )
            service.init()
            val config = service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)!!
            assertEquals(AgentStatus.CONNECTED, service.agents.value.single().status)

            service.upsert(
                config.copy(
                    name = "Custom main agent",
                    autoStart = false,
                    maxDynamicSubagents = 1,
                    systemPrompt = "custom prompt",
                )
            ).getOrThrow()

            val normalized = service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)!!
            assertEquals("Pi 主智能体", normalized.name)
            assertTrue(normalized.autoStart)
            assertEquals(4, normalized.maxDynamicSubagents)
            assertTrue(normalized.systemPrompt.isEmpty())
            assertEquals(AgentStatus.CONNECTED, service.agents.value.single().status)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `disconnect serializes later scans behind in-flight pi shutdown`() = runTest {
        val directory = Files.createTempDirectory("agent-disconnect-scan")
        try {
            val creationStarted = CompletableDeferred<Unit>()
            val allowCreation = CompletableDeferred<Unit>()
            val session = ClosingSession()
            val manager = PiRuntimeManager(
                distribution = PiRuntimeDistribution(directory.toFile()),
                defaultWorkingDirectory = directory.toFile(),
                factory = PiSessionFactory { _, _, _ ->
                    creationStarted.complete(Unit)
                    allowCreation.await()
                    session
                },
            )
            val service = AgentService(
                registry = AgentRegistry(directory.resolve("agents.json").toFile()),
                runtimeManager = manager,
                inspectRuntime = {
                    Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
                },
            )
            service.init()
            val config = service.getConfig(AgentRegistry.DEFAULT_AGENT_ID)!!
            val creation = backgroundScope.async { manager.getOrCreate("session-race", config, null) }
            creationStarted.await()

            val disconnect = backgroundScope.async { service.disconnect(config.id).getOrThrow() }
            yield()
            val scan = backgroundScope.async { service.scan().getOrThrow() }
            yield()

            assertFalse(scan.isCompleted)
            allowCreation.complete(Unit)
            creation.await()
            disconnect.await()
            scan.await()

            assertTrue(session.closed)
            assertEquals(AgentStatus.DISCONNECTED, service.agents.value.single().status)
        } finally {
            directory.deleteRecursively()
        }
    }
}

private class ClosingSession : PiSession {
    var closed = false

    override val pid: Long = 1
    override val remoteSessionId: String = "remote"

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close() {
        closed = true
    }
}

private class FailingCloseSession : PiSession {
    override val pid: Long = 1
    override val remoteSessionId: String = "remote"

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit,
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close() {
        error("pi process did not close")
    }
}

private class FailsOnceCloseSession : PiSession {
    private var closeAttempts = 0

    override val pid: Long = 1
    override val remoteSessionId: String = "remote"

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit,
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close() {
        closeAttempts++
        if (closeAttempts == 1) error("first pi shutdown fails")
    }
}

private class CanceledCloseSession : PiSession {
    override val pid: Long = 1
    override val remoteSessionId: String = "remote"

    override suspend fun prompt(
        message: String,
        images: List<ImageData>,
        onEvent: suspend (PiSessionEvent) -> Unit,
    ): String = ""

    override suspend fun abort() = Unit

    override suspend fun close(): Nothing = throw CancellationException("pi shutdown canceled")
}
