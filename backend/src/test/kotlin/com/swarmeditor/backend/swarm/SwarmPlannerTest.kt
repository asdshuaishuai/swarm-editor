package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceKind
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlin.time.Instant

class SwarmPlannerTest {
    @Test
    fun `parses fenced dynamic plan and validates profile assignments`() {
        val plan = parseSwarmPlan(
            response = """
                Here is the plan:
                ```json
                {
                  "maxParallelism": 9,
                  "failFast": true,
                  "maxTaskAttempts": 9,
                  "tasks": [
                    {"id":"inspect","title":"Inspect","prompt":"Inspect architecture and report evidence","role":"PLANNER","agentId":"planner","dependsOn":[]},
                    {"id":"implement","title":"Implement","prompt":"Implement and run focused tests","role":"IMPLEMENTER","agentId":"missing","dependsOn":["inspect"]},
                    {"id":"review","title":"Review","prompt":"Review integration and data flow","role":"REVIEWER","dependsOn":["implement"]}
                  ]
                }
                ```
            """.trimIndent(),
            availableAgentIds = setOf("planner"),
        )

        assertEquals(3, plan.recommendedParallelism)
        assertTrue(plan.failFast)
        assertEquals(3, plan.maxTaskAttempts)
        assertEquals(SwarmAgentRole.PLANNER, plan.tasks[0].role)
        assertEquals("planner", plan.tasks[0].agentId)
        assertNull(plan.tasks[1].agentId)
        assertEquals(listOf("implement"), plan.tasks[2].dependsOn)
    }

    @Test
    fun `rejects invalid dynamic task graphs`() {
        assertFailsWith<IllegalArgumentException> {
            parseSwarmPlan(
                response = """{"tasks":[
                    {"id":"a","title":"A","prompt":"A","dependsOn":["b"]},
                    {"id":"b","title":"B","prompt":"B","dependsOn":["a"]}
                ]}""",
                availableAgentIds = emptySet(),
            )
        }
    }

    @Test
    fun `pi planner repairs invalid output and closes its planning session`() = runTest {
        val responses = ArrayDeque(
            listOf(
                "not-json",
                """{"maxParallelism":2,"tasks":[
                    {"id":"inspect","title":"Inspect","prompt":"Inspect repository constraints","role":"PLANNER","dependsOn":[]},
                    {"id":"implement","title":"Implement","prompt":"Implement and verify behavior","role":"IMPLEMENTER","dependsOn":["inspect"]}
                ]}""",
            )
        )
        val prompts = mutableListOf<String>()
        var capturedConfig: AgentConfig? = null
        var closedSessionId: String? = null
        var configValidated = false
        val session = object : PiSession {
            override val pid: Long? = null
            override val remoteSessionId: String = "planner-remote"

            override suspend fun prompt(
                message: String,
                images: List<ImageData>,
                onEvent: suspend (PiSessionEvent) -> Unit,
            ): String {
                prompts += message
                return responses.removeFirst()
            }

            override suspend fun abort() = Unit
            override suspend fun close() = Unit
        }
        val sessions = object : PiSessionProvider {
            override suspend fun getOrCreate(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
            ): PiSession = error("Planner must validate its Pi profile")

            override suspend fun getOrCreateValidated(
                sessionId: String,
                config: AgentConfig,
                remoteSessionId: String?,
                isConfigCurrent: suspend () -> Boolean,
            ): PiSession {
                capturedConfig = config
                configValidated = isConfigCurrent()
                return session
            }

            override suspend fun abort(sessionId: String) = Unit

            override suspend fun close(sessionId: String) {
                closedSessionId = sessionId
            }
        }
        val plannerConfig = AgentConfig(
            id = "pi-planner",
            name = "Repository Planner",
            tags = listOf("role:planner"),
        )
        val planner = PiSwarmPlanner(
            sessions = sessions,
            isConfigCurrent = { it == plannerConfig },
        )

        val plan = planner.plan(
            SwarmPlanningRequest(
                objective = "Refactor backend concurrency",
                availableAgents = listOf(plannerConfig),
                experiences = listOf(
                    SwarmExperience(
                        id = "preserve-cancellation",
                        principle = "Preserve CancellationException",
                        rationale = "Structured concurrency depends on cancellation propagation.",
                        kind = SwarmExperienceKind.PITFALL,
                        role = SwarmAgentRole.IMPLEMENTER,
                        createdAt = Instant.fromEpochMilliseconds(1_000),
                        updatedAt = Instant.fromEpochMilliseconds(1_000),
                    )
                ),
            )
        )

        assertEquals(2, plan.tasks.size)
        assertEquals(2, prompts.size)
        assertContains(prompts.first(), "Refactor backend concurrency")
        assertContains(prompts.first(), "preserve-cancellation")
        assertContains(prompts.last(), "previous swarm plan was invalid")
        assertEquals("Repository Planner · Planner", capturedConfig?.name)
        assertTrue(configValidated)
        assertTrue(closedSessionId?.startsWith("swarm-plan:") == true)
    }
}
