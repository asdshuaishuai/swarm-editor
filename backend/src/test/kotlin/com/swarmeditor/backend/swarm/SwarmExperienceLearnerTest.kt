package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmExperienceLearnerTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `pi learner extracts durable experience and closes reflector session`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-learner")
        try {
            val store = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            var prompt = ""
            var capturedConfig: AgentConfig? = null
            var closedSessionId = ""
            val session = object : PiSession {
                override val pid: Long? = null
                override val remoteSessionId: String = "reflector"

                override suspend fun prompt(
                    message: String,
                    images: List<ImageData>,
                    onEvent: suspend (PiSessionEvent) -> Unit,
                ): String {
                    prompt = message
                    return """{"insights":[{
                        "id":"preserve-cancellation",
                        "principle":"Always preserve coroutine cancellation",
                        "rationale":"Swallowing cancellation leaks Pi subprocess work.",
                        "kind":"PITFALL",
                        "role":"IMPLEMENTER",
                        "tags":["coroutines","pi"],
                        "evidence":"FAILURE"
                    }]}"""
                }

                override suspend fun abort() = Unit
                override suspend fun close() = Unit
            }
            val sessions = object : PiSessionProvider {
                override suspend fun getOrCreate(
                    sessionId: String,
                    config: AgentConfig,
                    remoteSessionId: String?,
                ): PiSession = error("Learner must validate its Pi profile")

                override suspend fun getOrCreateValidated(
                    sessionId: String,
                    config: AgentConfig,
                    remoteSessionId: String?,
                    isConfigCurrent: suspend () -> Boolean,
                ): PiSession {
                    assertTrue(isConfigCurrent())
                    capturedConfig = config
                    return session
                }

                override suspend fun abort(sessionId: String) = Unit
                override suspend fun close(sessionId: String) {
                    closedSessionId = sessionId
                }
            }
            val profile = AgentConfig(id = "reviewer", name = "Reviewer", tags = listOf("role:reviewer"))
            val learner = PiSwarmExperienceLearner(
                sessions = sessions,
                store = store,
                availableAgents = { listOf(profile) },
                isConfigCurrent = { it == profile },
                now = { Instant.fromEpochMilliseconds(2_000) },
            )
            val timestamp = Instant.fromEpochMilliseconds(1_000)
            val run = SwarmRun(
                id = "run-learning",
                title = "Learn",
                objective = "Strengthen coroutine lifecycle handling",
                createdAt = timestamp,
                updatedAt = timestamp,
                status = SwarmRunStatus.FAILED,
                tasks = listOf(
                    SwarmTask(
                        id = "implement",
                        title = "Implement",
                        prompt = "Refactor cancellation handling",
                        role = SwarmAgentRole.IMPLEMENTER,
                        status = SwarmTaskStatus.FAILED,
                        errorMessage = "child process leaked",
                        failureHistory = listOf("Attempt 1: cancellation swallowed"),
                        attempt = 1,
                    )
                ),
            )

            learner.learn(run)

            val experience = store.experiences.value.single()
            assertEquals("preserve-cancellation", experience.id)
            assertEquals(1, experience.failedEvidence)
            assertContains(prompt, "cancellation swallowed")
            assertContains(prompt, "child process leaked")
            assertEquals("Reviewer · Reviewer", capturedConfig?.name)
            assertTrue(closedSessionId.startsWith("swarm-learn:run-learning:"))
        } finally {
            directory.deleteRecursively()
        }
    }
}
