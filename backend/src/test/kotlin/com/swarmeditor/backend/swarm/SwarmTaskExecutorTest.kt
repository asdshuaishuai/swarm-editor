package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.backend.pi.PiSessionStats
import com.swarmeditor.backend.pi.PiTokenUsage
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.TokenUsage
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout

class SwarmTaskExecutorTest {
    @Test
    fun `builds an observable reviewer profile while preserving pi runtime settings`() {
        val base = AgentConfig(
            id = "pi-review",
            name = "Repository Agent",
            provider = "anthropic",
            model = "claude-sonnet",
            thinkingLevel = AgentThinkingLevel.HIGH,
            systemPrompt = "Follow repository instructions.",
            workingDirectory = "/workspace/project",
            env = mapOf("SAFE_MODE" to "1"),
            tags = listOf("custom", "pi"),
            timeoutSeconds = 90,
        )

        val reviewer = buildSwarmTaskAgentConfig(base, SwarmAgentRole.REVIEWER)

        assertEquals(base.id, reviewer.id)
        assertEquals("Repository Agent · Reviewer", reviewer.name)
        assertEquals(base.provider, reviewer.provider)
        assertEquals(base.model, reviewer.model)
        assertEquals(base.thinkingLevel, reviewer.thinkingLevel)
        assertEquals(base.workingDirectory, reviewer.workingDirectory)
        assertEquals(base.env, reviewer.env)
        assertEquals(base.timeoutSeconds, reviewer.timeoutSeconds)
        assertEquals(listOf("custom", "pi", "swarm", "role:reviewer"), reviewer.tags)
        assertContains(reviewer.systemPrompt, "Follow repository instructions.")
        assertContains(reviewer.systemPrompt, "functional correctness")
        assertContains(reviewer.systemPrompt, "end-to-end data flow")
    }

    @Test
    fun `every swarm role produces a distinct pi session identity`() {
        val base = AgentConfig(id = "pi-default", name = "Pi")

        val names = SwarmAgentRole.entries.map { role ->
            buildSwarmTaskAgentConfig(base, role).name
        }

        assertEquals(SwarmAgentRole.entries.size, names.toSet().size)
        assertEquals(
            setOf("Pi · Planner", "Pi · Implementer", "Pi · Reviewer", "Pi · Integrator", "Pi · General"),
            names.toSet(),
        )
    }

    @Test
    fun `executor launches and closes the role-specific pi session`() = runTest {
        val base = AgentConfig(id = "pi-default", name = "Pi", provider = "openai", model = "gpt")
        val task = SwarmTask(
            id = "review-data-flow",
            title = "Review data flow",
            prompt = "Trace UI to persistence.",
            role = SwarmAgentRole.REVIEWER,
            attempt = 2,
            failureHistory = listOf("Attempt 1: missed persisted state updates"),
        )
        val now = Instant.fromEpochMilliseconds(1_000)
        val run = SwarmRun(
            id = "run-1",
            title = "Deep review",
            objective = "Verify integration correctness",
            createdAt = now,
            updatedAt = now,
            policy = SwarmExecutionPolicy(taskTimeoutSeconds = 45),
            tasks = listOf(task),
        )
        var capturedSessionId = ""
        var capturedConfig: AgentConfig? = null
        var capturedPrompt = ""
        var closedSessionId = ""
        var resolvedTask: SwarmTask? = null
        var resolutionCount = 0
        var configValidated = false
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "remote-1"
            override val toolBrokerSessionId: String = "broker-11111111111111111111111111111111"
            override val toolAuditIds: List<String> = listOf("audit-11111111111111111111111111111111")

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                capturedPrompt = message
                return "review complete"
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = error("Swarm executor must validate its agent config")

            override suspend fun getOrCreateValidated(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
                isConfigCurrent: suspend () -> Boolean,
            ): PiSession {
                configValidated = isConfigCurrent()
                capturedSessionId = sessionId
                capturedConfig = config
                return session
            }

            override suspend fun abort(sessionId: String) = Unit

            override suspend fun close(sessionId: String) {
                closedSessionId = sessionId
            }
        }
        val executor = PiSwarmTaskExecutor(
            sessions = sessions,
            agentResolver = SwarmAgentResolver { candidate ->
                resolutionCount += 1
                resolvedTask = candidate
                base
            },
            experienceProvider = { _, _ ->
                SwarmTaskExperienceContext(
                    experiences = listOf(SwarmExperience(
                        id = "trace-data-flow",
                        principle = "Trace the complete data flow",
                        rationale = "Disconnected state transitions hide integration failures.",
                        kind = SwarmExperienceKind.STRATEGY,
                        role = SwarmAgentRole.REVIEWER,
                        createdAt = now,
                        updatedAt = now,
                    )),
                    routingDecisions = listOf(
                        SwarmExperienceRoutingDecision(
                            experienceId = "trace-data-flow",
                            status = SwarmExperienceRoutingStatus.SELECTED,
                            queryFingerprint = "query",
                            score = 120,
                            relevanceScore = 100,
                            observedUtility = 0,
                            controlledWins = 0,
                            controlledRegressions = 0,
                            medianQualityDelta = 0.0,
                        )
                    ),
                )
            },
        )

        val result = executor.execute(run, task)

        assertEquals("review complete", result.output)
        assertEquals("swarm:run-1:review-data-flow", capturedSessionId)
        assertEquals(capturedSessionId, closedSessionId)
        assertEquals("Pi · Reviewer", capturedConfig?.name)
        assertEquals("pi-default", capturedConfig?.id)
        assertEquals(45, capturedConfig?.timeoutSeconds)
        assertEquals(task, resolvedTask)
        assertEquals(2, resolutionCount)
        assertTrue(configValidated)
        assertContains(capturedConfig?.systemPrompt.orEmpty(), "integration boundaries")
        assertContains(capturedPrompt, "Verify integration correctness")
        assertContains(capturedPrompt, "Trace UI to persistence.")
        assertContains(capturedPrompt, "Trace the complete data flow")
        assertContains(capturedPrompt, "Previous attempts failed:")
        assertContains(capturedPrompt, "Attempt 1: missed persisted state updates")
        assertContains(capturedPrompt, "Do not repeat the same unsuccessful approach.")
        assertEquals(listOf("trace-data-flow"), result.experienceIds)
        assertEquals(task.attempt, result.experienceRoutingDecisions.single().attempt)
        assertEquals(listOf("broker-11111111111111111111111111111111"), result.toolBrokerSessionIds)
        assertEquals(listOf("audit-11111111111111111111111111111111"), result.toolAuditIds)
        assertEquals(0L, result.tokenUsage.total)
    }

    @Test
    fun `executor reports consumed pi usage when scheduler timeout cancels prompt`() = runTest {
        val task = SwarmTask(id = "slow", title = "Slow", prompt = "Keep working")
        val now = Instant.fromEpochMilliseconds(1_000)
        val run = SwarmRun(
            id = "run-timeout",
            title = "Timeout",
            objective = "Preserve usage",
            createdAt = now,
            updatedAt = now,
            tasks = listOf(task),
        )
        val expectedUsage = TokenUsage(input = 9, output = 4, total = 13, cost = 0.003)
        var closed = false
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "remote-timeout"
            override val toolBrokerSessionId: String = "broker-22222222222222222222222222222222"
            override val toolAuditIds: List<String> = listOf("audit-22222222222222222222222222222222")
            override val stats = MutableStateFlow(stats(remoteSessionId, expectedUsage))

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                delay(Long.MAX_VALUE)
                return "unexpected"
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = session

            override suspend fun abort(sessionId: String) = Unit

            override suspend fun close(sessionId: String) {
                closed = true
            }
        }
        val executor = PiSwarmTaskExecutor(sessions) { AgentConfig(id = "pi-default", name = "Pi") }

        val error = assertFailsWith<SwarmTaskTimedOutException> {
            withTimeout(1_000) { executor.execute(run, task) }
        }

        assertEquals(expectedUsage, error.tokenUsage)
        assertEquals(listOf("broker-22222222222222222222222222222222"), error.toolBrokerSessionIds)
        assertEquals(listOf("audit-22222222222222222222222222222222"), error.toolAuditIds)
        assertTrue(closed)
    }

    @Test
    fun `session close failure does not mask prompt cancellation`() = runTest {
        val task = SwarmTask(id = "cancel", title = "Cancel", prompt = "Cancel")
        val now = Instant.fromEpochMilliseconds(1_000)
        val run = SwarmRun(
            id = "run-cancel",
            title = "Cancel",
            objective = "Preserve cancellation",
            createdAt = now,
            updatedAt = now,
            tasks = listOf(task),
        )
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "remote-cancel"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String = throw CancellationException("prompt canceled")

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = session

            override suspend fun abort(sessionId: String) = Unit

            override suspend fun close(sessionId: String) {
                error("close failed")
            }
        }
        val executor = PiSwarmTaskExecutor(sessions) { AgentConfig(id = "pi-default", name = "Pi") }

        val cancellation = assertFailsWith<CancellationException> {
            executor.execute(run, task)
        }

        assertEquals("prompt canceled", cancellation.message)
        assertEquals(listOf("close failed"), cancellation.suppressed.map { it.message })
    }

    @Test
    fun `session close failure after success preserves measured token usage`() = runTest {
        val task = SwarmTask(id = "close", title = "Close", prompt = "Finish")
        val now = Instant.fromEpochMilliseconds(1_000)
        val run = SwarmRun(
            id = "run-close",
            title = "Close",
            objective = "Preserve usage",
            createdAt = now,
            updatedAt = now,
            tasks = listOf(task),
        )
        val expectedUsage = TokenUsage(input = 7, output = 6, total = 13, cost = 0.002)
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "remote-close"
            override val stats = MutableStateFlow(stats(remoteSessionId, expectedUsage))

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String = "complete"

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = session

            override suspend fun abort(sessionId: String) = Unit

            override suspend fun close(sessionId: String) {
                error("close failed")
            }
        }
        val executor = PiSwarmTaskExecutor(sessions) { AgentConfig(id = "pi-default", name = "Pi") }

        val failure = assertFailsWith<SwarmTaskExecutionException> {
            executor.execute(run, task)
        }

        assertEquals("close failed", failure.message)
        assertEquals(expectedUsage, failure.tokenUsage)
    }

    private fun stats(sessionId: String, usage: TokenUsage) = PiSessionStats(
        sessionId = sessionId,
        userMessages = 1,
        assistantMessages = 0,
        toolCalls = 0,
        toolResults = 0,
        totalMessages = 1,
        tokens = PiTokenUsage(
            input = usage.input,
            output = usage.output,
            cacheRead = usage.cacheRead,
            cacheWrite = usage.cacheWrite,
            total = usage.total,
        ),
        cost = usage.cost,
    )
}
