package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmEvaluationMetrics
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
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

class SwarmRoutingChallengePlannerTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `prioritizes controlled regressions and observational uncertainty for loo replay`() = runTest {
        val directory = Files.createTempDirectory("swarm-routing-challenges")
        try {
            val runStore = SwarmStore(directory.resolve("runs").toFile()).also { it.load() }
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            val ids = listOf("regressing", "harmful", "failing", "beneficial", "limited")
            ids.forEach { addExperience(experienceStore, it) }
            runStore.put(run())
            evolutionStore.recordEvaluation(
                SwarmExperienceEvaluation(
                    id = "eval-regressing",
                    experienceId = "regressing",
                    taskFingerprint = "regression-task",
                    environmentFingerprint = "pi-eval-env",
                    control = SwarmEvaluationMetrics(passed = true, qualityScore = 0.9),
                    treatment = SwarmEvaluationMetrics(passed = true, qualityScore = 0.4),
                    createdAt = Instant.fromEpochMilliseconds(4_000),
                )
            )
            val planner = EvidenceDrivenSwarmRoutingChallengePlanner(runStore, experienceStore, evolutionStore)

            val challenges = planner.plan(limit = 10)

            assertEquals(
                listOf(
                    SwarmRoutingChallengeReason.CONTROLLED_REGRESSION_RECHECK,
                    SwarmRoutingChallengeReason.OBSERVED_HARM_REQUIRES_LOO,
                    SwarmRoutingChallengeReason.SELECTED_FAILURE_REQUIRES_LOO,
                    SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO,
                    SwarmRoutingChallengeReason.CAPACITY_EXCLUSION_REVIEW,
                ),
                challenges.map { it.reason },
            )
            val regression = challenges.first()
            assertEquals("regressing", regression.experienceId)
            assertEquals(1, regression.controlledRegressions)
            assertEquals("pi-eval-env", regression.controlledEnvironmentFingerprint)
            assertEquals(listOf("eval-regressing"), regression.evaluationIds)
            val failing = challenges.single { it.experienceId == "failing" }
            assertEquals(1, failing.selectedFailures)
            assertEquals(1, failing.planningFailures)
            assertTrue(failing.queryFingerprints.all { it.startsWith("query-") })
            assertEquals(challenges.take(2), planner.plan(limit = 2))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `does not request observational loo when comparable controlled evidence already exists`() = runTest {
        val directory = Files.createTempDirectory("swarm-routing-controlled")
        try {
            val runStore = SwarmStore(directory.resolve("runs").toFile()).also { it.load() }
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            addExperience(experienceStore, "harmful")
            runStore.put(
                run().copy(
                    planningExperienceRoutingDecisions = emptyList(),
                    tasks = listOf(
                        task(
                            "harm",
                            SwarmTaskStatus.FAILED,
                            decision("harmful", SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM),
                        )
                    ),
                )
            )
            evolutionStore.recordEvaluation(
                SwarmExperienceEvaluation(
                    id = "eval-harmful-neutral",
                    experienceId = "harmful",
                    taskFingerprint = "harm-task",
                    environmentFingerprint = "pi-eval-env",
                    control = SwarmEvaluationMetrics(passed = true, qualityScore = 0.8),
                    treatment = SwarmEvaluationMetrics(passed = true, qualityScore = 0.8),
                    createdAt = Instant.fromEpochMilliseconds(4_000),
                )
            )
            val planner = EvidenceDrivenSwarmRoutingChallengePlanner(runStore, experienceStore, evolutionStore)

            assertTrue(planner.plan(limit = 10).isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    private suspend fun addExperience(store: SwarmExperienceStore, id: String) {
        store.applyInsights(
            runId = "source-$id",
            insights = listOf(
                SwarmExperienceInsight(
                    id = id,
                    principle = "Use $id routing guidance",
                    rationale = "Evidence for routing challenge tests",
                    kind = SwarmExperienceKind.STRATEGY,
                    role = SwarmAgentRole.REVIEWER,
                    tags = listOf("routing"),
                    evidence = SwarmExperienceEvidence.SUCCESS,
                )
            ),
            timestamp = Instant.fromEpochMilliseconds(1_000),
        )
    }

    private fun run(): SwarmRun {
        val timestamp = Instant.fromEpochMilliseconds(2_000)
        return SwarmRun(
            id = "run-routing",
            title = "Routing evidence",
            objective = "Collect routing evidence",
            createdAt = timestamp,
            updatedAt = timestamp,
            status = SwarmRunStatus.FAILED,
            planningExperienceRoutingDecisions = listOf(decision("failing", SwarmExperienceRoutingStatus.SELECTED)),
            tasks = listOf(
                task("regression", SwarmTaskStatus.FAILED, decision("regressing", SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION)),
                task("harm", SwarmTaskStatus.FAILED, decision("harmful", SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM)),
                task("failure", SwarmTaskStatus.FAILED, decision("failing", SwarmExperienceRoutingStatus.SELECTED)),
                task("benefit-1", SwarmTaskStatus.SUCCEEDED, decision("beneficial", SwarmExperienceRoutingStatus.SELECTED)),
                task("benefit-2", SwarmTaskStatus.SUCCEEDED, decision("beneficial", SwarmExperienceRoutingStatus.SELECTED)),
                task("benefit-3", SwarmTaskStatus.SUCCEEDED, decision("beneficial", SwarmExperienceRoutingStatus.SELECTED)),
                task("limit-1", SwarmTaskStatus.SUCCEEDED, decision("limited", SwarmExperienceRoutingStatus.ABSTAINED_LIMIT)),
                task("limit-2", SwarmTaskStatus.SUCCEEDED, decision("limited", SwarmExperienceRoutingStatus.ABSTAINED_LIMIT)),
                task("limit-3", SwarmTaskStatus.SUCCEEDED, decision("limited", SwarmExperienceRoutingStatus.ABSTAINED_LIMIT)),
            ),
        )
    }

    private fun task(
        id: String,
        status: SwarmTaskStatus,
        decision: SwarmExperienceRoutingDecision,
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = "Execute $id",
        role = SwarmAgentRole.REVIEWER,
        status = status,
        attempt = 1,
        experienceIds = listOf(decision.experienceId).takeIf {
            decision.status == SwarmExperienceRoutingStatus.SELECTED
        }.orEmpty(),
        experienceRoutingDecisions = listOf(decision),
        completedAt = Instant.fromEpochMilliseconds(3_000),
    )

    private fun decision(
        experienceId: String,
        status: SwarmExperienceRoutingStatus,
    ) = SwarmExperienceRoutingDecision(
        experienceId = experienceId,
        status = status,
        queryFingerprint = "query-$experienceId",
        score = 100,
        relevanceScore = 100,
        observedUtility = 0,
        controlledWins = 0,
        controlledRegressions = if (status == SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION) 1 else 0,
        medianQualityDelta = if (status == SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION) -0.5 else 0.0,
        attempt = 1,
    )
}
