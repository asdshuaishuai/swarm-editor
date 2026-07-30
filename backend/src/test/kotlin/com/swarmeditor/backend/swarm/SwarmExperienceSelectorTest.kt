package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmEvaluationMetrics
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmExperienceSelectorTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `abstains from repeatedly harmful observational memory while retaining exploration`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-selection-observed")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "harmful-memory", "Trace integration state flow")
            addExperience(experienceStore, "new-memory", "Trace integration boundaries")
            repeat(4) { index ->
                experienceStore.recordUsage(failedRun("failure-$index", "harmful-memory"))
            }
            val selector = UtilityAwareSwarmExperienceSelector(experienceStore, evolutionStore)

            val selection = selector.select("Trace integration state flow", SwarmAgentRole.REVIEWER, 6)

            assertEquals(listOf("new-memory"), selection.selected.map { it.id })
            assertEquals(
                SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM,
                selection.decisions.single { it.experienceId == "harmful-memory" }.status,
            )
            assertEquals(
                SwarmExperienceRoutingStatus.SELECTED,
                selection.decisions.single { it.experienceId == "new-memory" }.status,
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `controlled cross-task regressions override lexical relevance`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-selection-controlled")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "regressing-memory", "Trace exact integration state flow")
            addExperience(experienceStore, "safe-memory", "Trace integration data boundaries")
            evolutionStore.recordEvaluation(evaluation("eval-1", "regressing-memory", "task-a", 0.9, 0.5))
            evolutionStore.recordEvaluation(evaluation("eval-2", "regressing-memory", "task-b", 0.8, 0.6))
            val selector = UtilityAwareSwarmExperienceSelector(experienceStore, evolutionStore)

            val selection = selector.select("Trace exact integration state flow", SwarmAgentRole.REVIEWER, 6)

            assertEquals(listOf("safe-memory"), selection.selected.map { it.id })
            val rejected = selection.decisions.single { it.experienceId == "regressing-memory" }
            assertEquals(SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION, rejected.status)
            assertEquals(2, rejected.controlledRegressions)
            assertTrue(rejected.medianQualityDelta < 0.0)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `controlled wins preserve memory despite noisy observational failures`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-selection-causal")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "causal-memory", "Trace integration state flow")
            repeat(4) { index -> experienceStore.recordUsage(failedRun("failure-$index", "causal-memory")) }
            evolutionStore.recordEvaluation(evaluation("eval-1", "causal-memory", "task-a", 0.3, 0.8))
            evolutionStore.recordEvaluation(evaluation("eval-2", "causal-memory", "task-b", 0.4, 0.7))
            val selector = UtilityAwareSwarmExperienceSelector(experienceStore, evolutionStore)

            val selection = selector.select("Trace integration state flow", SwarmAgentRole.REVIEWER, 6)

            assertEquals(listOf("causal-memory"), selection.selected.map { it.id })
            val decision = selection.decisions.single()
            assertEquals(SwarmExperienceRoutingStatus.SELECTED, decision.status)
            assertEquals(2, decision.controlledWins)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `marks relevant candidates beyond the injection limit as abstained`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-selection-limit")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "first-memory", "Trace integration state flow exactly")
            addExperience(experienceStore, "second-memory", "Trace integration state flow")
            val selector = UtilityAwareSwarmExperienceSelector(experienceStore, evolutionStore)

            val selection = selector.select("Trace integration state flow exactly", SwarmAgentRole.REVIEWER, 1)

            assertEquals(1, selection.selected.size)
            assertEquals(1, selection.decisions.count { it.status == SwarmExperienceRoutingStatus.SELECTED })
            assertEquals(1, selection.decisions.count { it.status == SwarmExperienceRoutingStatus.ABSTAINED_LIMIT })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `does not combine controlled regressions from incomparable environments`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-selection-environment")
        try {
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "mixed-memory", "Trace integration state flow")
            evolutionStore.recordEvaluation(
                evaluation("eval-1", "mixed-memory", "task-a", 0.9, 0.5, environment = "env-a")
            )
            evolutionStore.recordEvaluation(
                evaluation("eval-2", "mixed-memory", "task-b", 0.8, 0.6, environment = "env-b")
            )
            val selector = UtilityAwareSwarmExperienceSelector(experienceStore, evolutionStore)

            val selection = selector.select("Trace integration state flow", SwarmAgentRole.REVIEWER, 6)

            val decision = selection.decisions.single()
            assertEquals(SwarmExperienceRoutingStatus.SELECTED, decision.status)
            assertEquals(1, decision.controlledRegressions)
            assertTrue(decision.controlledEnvironmentFingerprint in setOf("env-a", "env-b"))
        } finally {
            directory.deleteRecursively()
        }
    }

    private suspend fun addExperience(store: SwarmExperienceStore, id: String, principle: String) {
        store.applyInsights(
            runId = "source-$id",
            insights = listOf(
                SwarmExperienceInsight(
                    id = id,
                    principle = principle,
                    rationale = "Repository integration evidence",
                    kind = SwarmExperienceKind.STRATEGY,
                    role = SwarmAgentRole.REVIEWER,
                    tags = listOf("integration"),
                    evidence = SwarmExperienceEvidence.SUCCESS,
                )
            ),
            timestamp = Instant.fromEpochMilliseconds(1_000),
        )
    }

    private fun failedRun(id: String, experienceId: String): SwarmRun = SwarmRun(
        id = id,
        title = id,
        objective = "Trace integration state flow",
        createdAt = Instant.fromEpochMilliseconds(2_000),
        updatedAt = Instant.fromEpochMilliseconds(2_000),
        status = SwarmRunStatus.FAILED,
        tasks = listOf(
            SwarmTask(
                id = "review",
                title = "Review",
                prompt = "Trace integration state flow",
                role = SwarmAgentRole.REVIEWER,
                status = SwarmTaskStatus.FAILED,
                attempt = 1,
                experienceIds = listOf(experienceId),
            )
        ),
    )

    private fun evaluation(
        id: String,
        experienceId: String,
        task: String,
        controlQuality: Double,
        treatmentQuality: Double,
        environment: String = "pi-test-environment",
    ) = SwarmExperienceEvaluation(
        id = id,
        experienceId = experienceId,
        taskFingerprint = task,
        environmentFingerprint = environment,
        control = SwarmEvaluationMetrics(passed = true, qualityScore = controlQuality),
        treatment = SwarmEvaluationMetrics(passed = true, qualityScore = treatmentQuality),
        createdAt = Instant.fromEpochMilliseconds(id.takeLast(1).toLong() * 1_000),
    )
}
