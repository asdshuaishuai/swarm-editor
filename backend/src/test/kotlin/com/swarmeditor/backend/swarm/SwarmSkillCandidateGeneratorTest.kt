package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmEvaluationMetrics
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmSkillCandidateStatus
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

class SwarmSkillCandidateGeneratorTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `generates disabled draft skill only after promotion gate passes`() = runTest {
        val directory = Files.createTempDirectory("swarm-skill-candidate")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            val insight = SwarmExperienceInsight(
                id = "trace-data-flow",
                principle = "Trace UI to storage before editing integration code",
                rationale = "End-to-end tracing exposes disconnected state transitions.",
                kind = SwarmExperienceKind.STRATEGY,
                role = SwarmAgentRole.REVIEWER,
                tags = listOf("integration"),
                evidence = SwarmExperienceEvidence.SUCCESS,
            )
            experienceStore.applyInsights("source-1", listOf(insight), Instant.fromEpochMilliseconds(1_000))
            experienceStore.applyInsights("source-2", listOf(insight), Instant.fromEpochMilliseconds(2_000))
            repeat(3) { index -> experienceStore.recordUsage(successfulRun("usage-${index + 1}")) }
            evaluations().forEach { evolutionStore.recordEvaluation(it) }

            var promptCount = 0
            var prompt = ""
            var capturedConfig: AgentConfig? = null
            var closedSessionId = ""
            val session = object : PiSession {
                override val pid: Long? = null
                override val remoteSessionId: String = "skill-curator"

                override suspend fun prompt(
                    message: String,
                    images: List<ImageData>,
                    onEvent: suspend (PiSessionEvent) -> Unit,
                ): String {
                    promptCount += 1
                    prompt = message
                    return """{
                        "name":"trace-data-flow",
                        "description":"Use when reviewing state propagation across UI, services, and persistence.",
                        "instructions":"# Trace Data Flow\n\n## Procedure\n1. Map each state transition.\n2. Verify persistence boundaries.\n\n## Stop Conditions\nStop if repository evidence contradicts the assumed flow."
                    }"""
                }

                override suspend fun abort() = Unit
                override suspend fun close() = Unit
            }
            val sessions = object : PiSessionProvider {
                override suspend fun getOrCreate(
                    sessionId: String,
                    config: AgentConfig,
                    remoteSessionId: String?,
                ): PiSession = error("Skill generator must validate its Pi profile")

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
            val profile = AgentConfig(id = "curator", name = "Curator", tags = listOf("role:integrator"))
            val generator = PiSwarmSkillCandidateGenerator(
                sessions = sessions,
                experienceStore = experienceStore,
                evolutionStore = evolutionStore,
                availableAgents = { listOf(profile) },
                isConfigCurrent = { it == profile },
                now = { Instant.fromEpochMilliseconds(9_000) },
            )

            val candidate = generator.generate("trace-data-flow")
            val reused = generator.generate("trace-data-flow")

            assertEquals(candidate, reused)
            assertEquals(1, promptCount)
            assertEquals(SwarmSkillCandidateStatus.DRAFT, candidate.status)
            assertContains(candidate.markdown, "name: trace-data-flow")
            assertContains(candidate.markdown, "disable-model-invocation: true")
            assertContains(candidate.markdown, "## Stop Conditions")
            assertContains(prompt, "causally evaluated swarm experience")
            assertEquals("Curator · Integrator", capturedConfig?.name)
            assertTrue(closedSessionId.startsWith("swarm-skill:trace-data-flow:"))
            assertEquals(listOf(candidate), evolutionStore.candidates.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun successfulRun(id: String): SwarmRun {
        val timestamp = Instant.fromEpochMilliseconds(3_000)
        return SwarmRun(
            id = id,
            title = id,
            objective = "Review integration data flow",
            createdAt = timestamp,
            updatedAt = timestamp,
            status = SwarmRunStatus.SUCCEEDED,
            tasks = listOf(
                SwarmTask(
                    id = "review",
                    title = "Review",
                    prompt = "Review integration",
                    status = SwarmTaskStatus.SUCCEEDED,
                    attempt = 1,
                    experienceIds = listOf("trace-data-flow"),
                )
            ),
        )
    }

    private fun evaluations() = listOf(
        evaluation("eval-1", "task-1", false, 0.4, true, 0.8),
        evaluation("eval-2", "task-2", true, 0.6, true, 0.72),
        evaluation("eval-3", "task-3", true, 0.7, true, 0.78),
    )

    private fun evaluation(
        id: String,
        task: String,
        controlPassed: Boolean,
        controlQuality: Double,
        treatmentPassed: Boolean,
        treatmentQuality: Double,
    ) = SwarmExperienceEvaluation(
        id = id,
        experienceId = "trace-data-flow",
        taskFingerprint = task,
        environmentFingerprint = "pi:gpt:high:budget-1",
        control = SwarmEvaluationMetrics(controlPassed, controlQuality),
        treatment = SwarmEvaluationMetrics(treatmentPassed, treatmentQuality),
        createdAt = Instant.fromEpochMilliseconds(id.takeLast(1).toLong() * 1_000),
    )
}
