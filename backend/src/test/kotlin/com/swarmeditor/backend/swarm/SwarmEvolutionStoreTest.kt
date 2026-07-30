package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmEvaluationMetrics
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmSkillCandidate
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmEvolutionStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `requires matched causal evidence before allowing skill candidacy`() = runTest {
        val directory = Files.createTempDirectory("swarm-evolution-store")
        try {
            val file = directory.resolve("evolution.json").toFile()
            val store = SwarmEvolutionStore(file).also { it.load() }
            val experience = experience()
            evaluations().forEach { store.recordEvaluation(it) }

            val assessment = store.assessPromotion(experience)

            assertTrue(assessment.eligible)
            assertEquals(3, assessment.distinctTasks)
            assertEquals(1, assessment.distinctEnvironments)
            assertEquals(1, assessment.treatmentWins)
            assertEquals(0, assessment.regressions)
            assertTrue(assessment.medianQualityDelta >= 0.05)

            val candidate = SwarmSkillCandidate(
                id = "candidate-trace-data-flow",
                experienceId = experience.id,
                name = "trace-data-flow",
                description = "Use when reviewing state propagation.",
                markdown = "---\nname: trace-data-flow\ndescription: test\n---\n\n# Trace Data Flow\n",
                evaluationIds = assessment.evaluationIds,
                createdAt = Instant.fromEpochMilliseconds(5_000),
                updatedAt = Instant.fromEpochMilliseconds(5_000),
            )
            store.upsertCandidate(candidate)

            val reloaded = SwarmEvolutionStore(file).also { it.load() }
            assertEquals(store.evaluations.value, reloaded.evaluations.value)
            assertEquals(listOf(candidate), reloaded.candidates.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects conflicting evaluation ids and mixed environments`() = runTest {
        val directory = Files.createTempDirectory("swarm-evolution-conflicts")
        try {
            val store = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            val original = evaluation("eval-1", "task-1", "pi:gpt:high:budget-1", false, 0.4, true, 0.8)
            store.recordEvaluation(original)
            store.recordEvaluation(original)
            assertFailsWith<IllegalArgumentException> {
                store.recordEvaluation(original.copy(taskFingerprint = "different-task"))
            }
            store.recordEvaluation(evaluation("eval-2", "task-2", "pi:gpt:high:budget-2", true, 0.6, true, 0.7))
            store.recordEvaluation(evaluation("eval-3", "task-3", "pi:gpt:high:budget-1", true, 0.7, true, 0.8))

            val assessment = store.assessPromotion(experience())

            assertFalse(assessment.eligible)
            assertTrue(assessment.reasons.any { "environment" in it.lowercase() })
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun experience() = SwarmExperience(
        id = "trace-data-flow",
        principle = "Trace UI to storage before editing integration code",
        rationale = "End-to-end tracing exposes disconnected state transitions.",
        kind = SwarmExperienceKind.STRATEGY,
        role = SwarmAgentRole.REVIEWER,
        successfulEvidence = 2,
        successfulUses = 3,
        sourceRunIds = listOf("run-1", "run-2", "run-3"),
        createdAt = Instant.fromEpochMilliseconds(1_000),
        updatedAt = Instant.fromEpochMilliseconds(2_000),
    )

    private fun evaluations() = listOf(
        evaluation("eval-1", "task-1", "pi:gpt:high:budget-1", false, 0.4, true, 0.8),
        evaluation("eval-2", "task-2", "pi:gpt:high:budget-1", true, 0.6, true, 0.72),
        evaluation("eval-3", "task-3", "pi:gpt:high:budget-1", true, 0.7, true, 0.78),
    )

    private fun evaluation(
        id: String,
        task: String,
        environment: String,
        controlPassed: Boolean,
        controlQuality: Double,
        treatmentPassed: Boolean,
        treatmentQuality: Double,
    ) = SwarmExperienceEvaluation(
        id = id,
        experienceId = "trace-data-flow",
        taskFingerprint = task,
        environmentFingerprint = environment,
        control = SwarmEvaluationMetrics(controlPassed, controlQuality),
        treatment = SwarmEvaluationMetrics(treatmentPassed, treatmentQuality),
        createdAt = Instant.fromEpochMilliseconds(id.takeLast(1).toLong() * 1_000),
    )
}
