package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import java.security.MessageDigest
import kotlin.math.roundToInt

data class SwarmExperienceSelection(
    val selected: List<SwarmExperience>,
    val decisions: List<SwarmExperienceRoutingDecision>,
)

fun interface SwarmExperienceSelector {
    suspend fun select(query: String, role: SwarmAgentRole?, limit: Int): SwarmExperienceSelection
}

class UtilityAwareSwarmExperienceSelector(
    private val experienceStore: SwarmExperienceStore,
    private val evolutionStore: SwarmEvolutionStore,
    private val candidateMultiplier: Int = 4,
    private val minimumObservedUses: Int = 4,
    private val minimumObservedFailures: Int = 2,
    private val maximumObservedUtility: Int = -2,
    private val minimumControlledRegressionTasks: Int = 2,
) : SwarmExperienceSelector {
    init {
        require(candidateMultiplier > 0)
        require(minimumObservedUses > 0)
        require(minimumObservedFailures > 0)
        require(minimumControlledRegressionTasks > 0)
    }

    override suspend fun select(
        query: String,
        role: SwarmAgentRole?,
        limit: Int,
    ): SwarmExperienceSelection {
        require(limit > 0) { "limit must be positive" }
        val candidateLimit = (limit.toLong() * candidateMultiplier)
            .coerceAtLeast(limit.toLong())
            .coerceAtMost(MAX_SELECTOR_CANDIDATES.toLong())
            .toInt()
        val matches = experienceStore.findRelevantMatches(query, role, candidateLimit)
        val queryFingerprint = sha256(query.trim())
        val ranked = matches.map { match -> assess(match, evolutionStore.evaluationsForExperience(match.experience.id)) }
            .sortedWith(compareByDescending<AssessedExperience>(AssessedExperience::score)
                .thenByDescending { it.match.experience.updatedAt })
        val selected = ranked.asSequence()
            .filter { it.status == SwarmExperienceRoutingStatus.SELECTED }
            .take(limit)
            .map { it.match.experience }
            .toList()
        val selectedIds = selected.mapTo(mutableSetOf(), SwarmExperience::id)
        return SwarmExperienceSelection(
            selected = selected,
            decisions = ranked.map { assessed ->
                SwarmExperienceRoutingDecision(
                    experienceId = assessed.match.experience.id,
                    status = when {
                        assessed.status != SwarmExperienceRoutingStatus.SELECTED -> assessed.status
                        assessed.match.experience.id in selectedIds -> SwarmExperienceRoutingStatus.SELECTED
                        else -> SwarmExperienceRoutingStatus.ABSTAINED_LIMIT
                    },
                    queryFingerprint = queryFingerprint,
                    score = assessed.score,
                    relevanceScore = assessed.match.relevanceScore,
                    observedUtility = assessed.observedUtility,
                    controlledWins = assessed.controlledWins,
                    controlledRegressions = assessed.controlledRegressions,
                    medianQualityDelta = assessed.medianQualityDelta,
                    controlledEnvironmentFingerprint = assessed.controlledEnvironmentFingerprint,
                )
            },
        )
    }

    private fun assess(
        match: SwarmExperienceMatch,
        evaluations: List<SwarmExperienceEvaluation>,
    ): AssessedExperience {
        val experience = match.experience
        val observedUses = experience.successfulUses + experience.recoveredUses + experience.failedUses
        val observedUtility = experience.successfulUses * 2 + experience.recoveredUses - experience.failedUses * 2
        val summary = evaluations.comparableEvaluationSummary()
        val controlledWins = summary.wins
        val controlledRegressions = summary.regressions
        val medianQualityDelta = summary.medianQualityDelta
        val status = when {
            controlledRegressions >= minimumControlledRegressionTasks ->
                SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION
            controlledWins == 0 &&
                observedUses >= minimumObservedUses &&
                experience.failedUses >= minimumObservedFailures &&
                observedUtility <= maximumObservedUtility ->
                SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM
            else -> SwarmExperienceRoutingStatus.SELECTED
        }
        val score = match.relevanceScore +
            observedUtility.coerceIn(-OBSERVED_UTILITY_LIMIT, OBSERVED_UTILITY_LIMIT) * OBSERVED_UTILITY_WEIGHT +
            controlledWins * CONTROLLED_WIN_WEIGHT -
            controlledRegressions * CONTROLLED_REGRESSION_WEIGHT +
            (medianQualityDelta * CONTROLLED_DELTA_WEIGHT).roundToInt()
        return AssessedExperience(
            match = match,
            status = status,
            score = score,
            observedUtility = observedUtility,
            controlledWins = controlledWins,
            controlledRegressions = controlledRegressions,
            medianQualityDelta = medianQualityDelta,
            controlledEnvironmentFingerprint = summary.environmentFingerprint,
        )
    }
}

private data class AssessedExperience(
    val match: SwarmExperienceMatch,
    val status: SwarmExperienceRoutingStatus,
    val score: Int,
    val observedUtility: Int,
    val controlledWins: Int,
    val controlledRegressions: Int,
    val medianQualityDelta: Double,
    val controlledEnvironmentFingerprint: String?,
)

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private const val OBSERVED_UTILITY_LIMIT = 10
private const val OBSERVED_UTILITY_WEIGHT = 2
private const val CONTROLLED_WIN_WEIGHT = 30
private const val CONTROLLED_REGRESSION_WEIGHT = 60
private const val CONTROLLED_DELTA_WEIGHT = 100.0
private const val MAX_SELECTOR_CANDIDATES = 256
