package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
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

class SwarmRoutingEvaluationCasePlannerTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `builds deterministic leave one out variants from a source task`() = runTest {
        val directory = Files.createTempDirectory("swarm-routing-case")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(sourceRun())
            val planner = EvidenceDrivenSwarmRoutingEvaluationCasePlanner(store)
            val challenge = challenge(
                experienceId = "target-experience",
                reason = SwarmRoutingChallengeReason.SELECTED_FAILURE_REQUIRES_LOO,
                taskKeys = listOf("run-source:review"),
                runIds = listOf("run-source"),
                queryFingerprints = listOf("query-target"),
            )

            val first = planner.plan(listOf(challenge), snapshot(), listOf("./gradlew", "test")).single()
            val second = planner.plan(listOf(challenge), snapshot(), listOf("./gradlew", "test")).single()

            assertEquals(first, second)
            assertEquals(SwarmRoutingEvaluationCaseStatus.READY_FOR_VARIANT_GENERATION, first.status)
            assertEquals(emptyList(), first.blockers)
            assertEquals("run-source", first.sourceRunId)
            assertEquals("review", first.sourceTaskId)
            assertEquals("pi-reviewer", first.sourceAgentId)
            assertEquals(2, first.sourceAttempt)
            assertEquals(listOf("supporting-experience"), first.controlExperienceIds)
            assertEquals(listOf("supporting-experience", "target-experience"), first.treatmentExperienceIds)
            assertEquals(64, first.taskFingerprint.length)
            assertTrue(first.id.startsWith("route-case-"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `blocks planning cases when the source planner profile was not recorded`() = runTest {
        val directory = Files.createTempDirectory("swarm-routing-planning-case")
        try {
            val store = SwarmStore(directory.toFile()).also { it.load() }
            store.put(sourceRun())
            val planner = EvidenceDrivenSwarmRoutingEvaluationCasePlanner(store)
            val challenge = challenge(
                experienceId = "planning-experience",
                reason = SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO,
                runIds = listOf("run-source"),
                queryFingerprints = listOf("query-planning"),
            )

            val case = planner.plan(listOf(challenge), snapshot(), listOf("./gradlew", "test")).single()

            assertEquals(SwarmRoutingEvaluationTarget.PLANNING, case.target)
            assertEquals(SwarmRoutingEvaluationCaseStatus.BLOCKED_PROVENANCE, case.status)
            assertEquals(listOf(SwarmRoutingEvaluationBlocker.SOURCE_AGENT_NOT_RECORDED), case.blockers)
            assertEquals(listOf("planning-experience"), case.treatmentExperienceIds)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun sourceRun(): SwarmRun {
        val timestamp = Instant.fromEpochMilliseconds(1_000)
        return SwarmRun(
            id = "run-source",
            title = "Review routing",
            objective = "Review the backend data flow",
            createdAt = timestamp,
            updatedAt = timestamp,
            status = SwarmRunStatus.FAILED,
            planningExperienceRoutingDecisions = listOf(
                decision("planning-experience", "query-planning", SwarmExperienceRoutingStatus.SELECTED, attempt = 0)
            ),
            tasks = listOf(
                SwarmTask(
                    id = "review",
                    title = "Review integration",
                    prompt = "Trace state from the service to persistence.",
                    role = SwarmAgentRole.REVIEWER,
                    agentId = "pi-reviewer",
                    status = SwarmTaskStatus.FAILED,
                    attempt = 2,
                    experienceIds = listOf("supporting-experience", "target-experience"),
                    experienceRoutingDecisions = listOf(
                        decision("target-experience", "query-old", SwarmExperienceRoutingStatus.SELECTED, attempt = 1),
                        decision("supporting-experience", "query-support", SwarmExperienceRoutingStatus.SELECTED, attempt = 2),
                        decision("target-experience", "query-target", SwarmExperienceRoutingStatus.SELECTED, attempt = 2),
                    ),
                )
            ),
        )
    }

    private fun challenge(
        experienceId: String,
        reason: SwarmRoutingChallengeReason,
        taskKeys: List<String> = emptyList(),
        runIds: List<String> = emptyList(),
        queryFingerprints: List<String>,
    ) = SwarmRoutingChallenge(
        experienceId = experienceId,
        reason = reason,
        priority = 700,
        selectedSuccesses = 0,
        selectedRecoveries = 0,
        selectedFailures = 2,
        planningSuccesses = 0,
        planningFailures = 0,
        abstainedObservedHarm = 0,
        abstainedControlledRegression = 0,
        abstainedLimit = 0,
        controlledCases = 0,
        controlledWins = 0,
        controlledRegressions = 0,
        medianQualityDelta = 0.0,
        controlledEnvironmentFingerprint = null,
        evaluationIds = emptyList(),
        queryFingerprints = queryFingerprints,
        runIds = runIds,
        taskKeys = taskKeys,
    )

    private fun decision(
        experienceId: String,
        queryFingerprint: String,
        status: SwarmExperienceRoutingStatus,
        attempt: Int,
    ) = SwarmExperienceRoutingDecision(
        experienceId = experienceId,
        status = status,
        queryFingerprint = queryFingerprint,
        score = 100,
        relevanceScore = 100,
        observedUtility = 0,
        controlledWins = 0,
        controlledRegressions = 0,
        medianQualityDelta = 0.0,
        attempt = attempt,
    )

    private fun snapshot() = SwarmRepositorySnapshot(
        revision = "1111111111111111111111111111111111111111",
        baseRevision = "2222222222222222222222222222222222222222",
        treeHash = "3333333333333333333333333333333333333333",
        dirty = true,
        pinnedReference = "refs/swarm-editor/evaluation-snapshots/1111111111111111111111111111111111111111",
    )
}
