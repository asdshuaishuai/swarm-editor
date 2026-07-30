package com.swarmeditor.backend.service

import com.swarmeditor.backend.swarm.SwarmEvolutionStore
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.backend.swarm.SwarmRoutingChallenge
import com.swarmeditor.backend.swarm.SwarmRoutingChallengePlanner
import com.swarmeditor.backend.swarm.SwarmRoutingChallengeReason
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshot
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshotter
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationCase
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationCasePlanner
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationCaseStatus
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationTarget
import com.swarmeditor.backend.swarm.SwarmSkillCandidateGenerator
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest

class SwarmEvolutionServiceTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `routing challenges delegate the requested limit`() = runTest {
        val directory = Files.createTempDirectory("swarm-evolution-service")
        try {
            var requestedLimit = 0
            val challenge = challenge()
            val service = service(
                directory = directory,
                planner = SwarmRoutingChallengePlanner { limit ->
                    requestedLimit = limit
                    listOf(challenge)
                },
            )

            assertEquals(listOf(challenge), service.routingChallenges(limit = 7).getOrThrow())
            assertEquals(7, requestedLimit)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `routing challenge cancellation propagates`() = runTest {
        val directory = Files.createTempDirectory("swarm-evolution-cancellation")
        try {
            val service = service(
                directory = directory,
                planner = SwarmRoutingChallengePlanner {
                    throw CancellationException("challenge planning canceled")
                },
            )

            val cancellation = assertFailsWith<CancellationException> {
                service.routingChallenges()
            }
            assertEquals("challenge planning canceled", cancellation.message)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `prepares and persists routing evaluation cases from one repository snapshot`() = runTest {
        val directory = Files.createTempDirectory("swarm-evolution-cases")
        try {
            val challenge = challenge()
            val snapshot = snapshot()
            val evaluationCase = evaluationCase()
            var capturedCommand = emptyList<String>()
            val service = service(
                directory = directory,
                planner = SwarmRoutingChallengePlanner { listOf(challenge) },
                snapshotter = SwarmRepositorySnapshotter { snapshot },
                casePlanner = SwarmRoutingEvaluationCasePlanner { challenges, capturedSnapshot, command ->
                    assertEquals(listOf(challenge), challenges)
                    assertEquals(snapshot, capturedSnapshot)
                    capturedCommand = command
                    listOf(evaluationCase)
                },
            )

            val prepared = service.prepareRoutingEvaluationCases(
                limit = 1,
                verifierCommand = listOf("./gradlew", "test"),
            ).getOrThrow()

            assertEquals(listOf(evaluationCase), prepared)
            assertEquals(listOf("./gradlew", "test"), capturedCommand)
            assertEquals(listOf(evaluationCase), service.routingEvaluationCases.value)
            val reloaded = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            assertEquals(listOf(evaluationCase), reloaded.routingEvaluationCases.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    private suspend fun service(
        directory: java.nio.file.Path,
        planner: SwarmRoutingChallengePlanner,
        snapshotter: SwarmRepositorySnapshotter = SwarmRepositorySnapshotter { error("unused") },
        casePlanner: SwarmRoutingEvaluationCasePlanner = SwarmRoutingEvaluationCasePlanner { _, _, _ ->
            error("unused")
        },
    ): SwarmEvolutionService {
        val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
        val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
        return SwarmEvolutionService(
            evolutionStore = evolutionStore,
            experienceStore = experienceStore,
            candidateGenerator = SwarmSkillCandidateGenerator { error("unused") },
            repositorySnapshotter = snapshotter,
            routingChallengePlanner = planner,
            routingEvaluationCasePlanner = casePlanner,
        )
    }

    private fun challenge() = SwarmRoutingChallenge(
        experienceId = "experience-1",
        reason = SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO,
        priority = 500,
        selectedSuccesses = 3,
        selectedRecoveries = 0,
        selectedFailures = 0,
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
        queryFingerprints = listOf("query-1"),
        runIds = listOf("run-1"),
        taskKeys = listOf("run-1:task-1"),
    )

    private fun snapshot() = SwarmRepositorySnapshot(
        revision = "1111111111111111111111111111111111111111",
        baseRevision = "2222222222222222222222222222222222222222",
        treeHash = "3333333333333333333333333333333333333333",
        dirty = true,
        pinnedReference = "refs/swarm-editor/evaluation-snapshots/1111111111111111111111111111111111111111",
    )

    private fun evaluationCase() = SwarmRoutingEvaluationCase(
        id = "route-case-111111111111111111111111",
        experienceId = "experience-1",
        challengeReason = SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO,
        priority = 500,
        repositoryRevision = "1111111111111111111111111111111111111111",
        repositoryBaseRevision = "2222222222222222222222222222222222222222",
        repositoryTreeHash = "3333333333333333333333333333333333333333",
        repositoryDirty = true,
        repositoryPinnedReference = "refs/swarm-editor/evaluation-snapshots/1111111111111111111111111111111111111111",
        sourceRunId = "run-1",
        sourceTaskId = "task-1",
        target = SwarmRoutingEvaluationTarget.TASK,
        objective = "Evaluate routing",
        taskTitle = "Evaluate",
        taskPrompt = "Evaluate the selected experience.",
        taskRole = null,
        sourceAgentId = "pi-default",
        sourceAttempt = 1,
        sourceRoutingStatus = null,
        sourceQueryFingerprint = "query-1",
        controlExperienceIds = emptyList(),
        treatmentExperienceIds = listOf("experience-1"),
        verifierCommand = listOf("./gradlew", "test"),
        taskFingerprint = "a".repeat(64),
        status = SwarmRoutingEvaluationCaseStatus.READY_FOR_VARIANT_GENERATION,
        blockers = emptyList(),
    )
}
