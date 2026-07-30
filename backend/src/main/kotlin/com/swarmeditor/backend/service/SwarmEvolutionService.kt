package com.swarmeditor.backend.service

import com.swarmeditor.backend.swarm.SwarmEvolutionStore
import com.swarmeditor.backend.swarm.SwarmCounterfactualReplayRequest
import com.swarmeditor.backend.swarm.SwarmCounterfactualReplayer
import com.swarmeditor.backend.swarm.SwarmPromotionAssessment
import com.swarmeditor.backend.swarm.SwarmPromotionPolicy
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshot
import com.swarmeditor.backend.swarm.SwarmRepositorySnapshotter
import com.swarmeditor.backend.swarm.SwarmRoutingChallenge
import com.swarmeditor.backend.swarm.SwarmRoutingChallengePlanner
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationCase
import com.swarmeditor.backend.swarm.SwarmRoutingEvaluationCasePlanner
import com.swarmeditor.backend.swarm.SwarmSkillCandidateGenerator
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmSkillCandidate
import kotlinx.coroutines.CancellationException

class SwarmEvolutionService(
    private val evolutionStore: SwarmEvolutionStore,
    private val experienceStore: SwarmExperienceStore,
    private val candidateGenerator: SwarmSkillCandidateGenerator,
    private val counterfactualReplayer: SwarmCounterfactualReplayer = SwarmCounterfactualReplayer {
        error("Counterfactual replay is not configured")
    },
    private val repositorySnapshotter: SwarmRepositorySnapshotter = SwarmRepositorySnapshotter {
        error("Repository snapshots are not configured")
    },
    private val routingChallengePlanner: SwarmRoutingChallengePlanner = SwarmRoutingChallengePlanner {
        emptyList()
    },
    private val routingEvaluationCasePlanner: SwarmRoutingEvaluationCasePlanner =
        SwarmRoutingEvaluationCasePlanner { _, _, _ ->
            error("Routing evaluation case planning is not configured")
        },
    private val promotionPolicy: SwarmPromotionPolicy = SwarmPromotionPolicy(),
) {
    val evaluations = evolutionStore.evaluations
    val candidates = evolutionStore.candidates
    val routingEvaluationCases = evolutionStore.routingEvaluationCases

    suspend fun init() = evolutionStore.load()

    suspend fun recordEvaluation(evaluation: SwarmExperienceEvaluation): Result<SwarmExperienceEvaluation> = resultOf {
        checkNotNull(experienceStore.get(evaluation.experienceId)) {
            "Swarm experience not found: ${evaluation.experienceId}"
        }
        evolutionStore.recordEvaluation(evaluation)
    }

    suspend fun assess(experienceId: String): Result<SwarmPromotionAssessment> = resultOf {
        val experience = checkNotNull(experienceStore.get(experienceId)) {
            "Swarm experience not found: $experienceId"
        }
        evolutionStore.assessPromotion(experience, promotionPolicy)
    }

    suspend fun generateSkillCandidate(experienceId: String): Result<SwarmSkillCandidate> =
        resultOf { candidateGenerator.generate(experienceId) }

    suspend fun replay(request: SwarmCounterfactualReplayRequest): Result<SwarmExperienceEvaluation> =
        resultOf { counterfactualReplayer.replay(request) }

    suspend fun snapshotRepository(): Result<SwarmRepositorySnapshot> = resultOf {
        repositorySnapshotter.snapshot()
    }

    suspend fun routingChallenges(limit: Int = 20): Result<List<SwarmRoutingChallenge>> = resultOf {
        routingChallengePlanner.plan(limit)
    }

    suspend fun prepareRoutingEvaluationCases(
        limit: Int = 5,
        verifierCommand: List<String>,
    ): Result<List<SwarmRoutingEvaluationCase>> = resultOf {
        val challenges = routingChallengePlanner.plan(limit)
        if (challenges.isEmpty()) return@resultOf emptyList()
        val snapshot = repositorySnapshotter.snapshot()
        val cases = routingEvaluationCasePlanner.plan(challenges, snapshot, verifierCommand)
        evolutionStore.recordRoutingEvaluationCases(cases)
    }
}

private suspend fun <T> resultOf(action: suspend () -> T): Result<T> = try {
    Result.success(action())
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}
