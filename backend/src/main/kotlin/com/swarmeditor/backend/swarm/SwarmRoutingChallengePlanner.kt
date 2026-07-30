package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import kotlinx.serialization.Serializable

@Serializable
enum class SwarmRoutingChallengeReason {
    CONTROLLED_REGRESSION_RECHECK,
    OBSERVED_HARM_REQUIRES_LOO,
    SELECTED_FAILURE_REQUIRES_LOO,
    UNVERIFIED_BENEFIT_REQUIRES_LOO,
    CAPACITY_EXCLUSION_REVIEW,
}

data class SwarmRoutingChallenge(
    val experienceId: String,
    val reason: SwarmRoutingChallengeReason,
    val priority: Int,
    val selectedSuccesses: Int,
    val selectedRecoveries: Int,
    val selectedFailures: Int,
    val planningSuccesses: Int,
    val planningFailures: Int,
    val abstainedObservedHarm: Int,
    val abstainedControlledRegression: Int,
    val abstainedLimit: Int,
    val controlledCases: Int,
    val controlledWins: Int,
    val controlledRegressions: Int,
    val medianQualityDelta: Double,
    val controlledEnvironmentFingerprint: String?,
    val evaluationIds: List<String>,
    val queryFingerprints: List<String>,
    val runIds: List<String>,
    val taskKeys: List<String>,
)

fun interface SwarmRoutingChallengePlanner {
    suspend fun plan(limit: Int): List<SwarmRoutingChallenge>
}

class EvidenceDrivenSwarmRoutingChallengePlanner(
    private val runStore: SwarmStore,
    private val experienceStore: SwarmExperienceStore,
    private val evolutionStore: SwarmEvolutionStore,
    private val minimumSelectedFailures: Int = 2,
    private val minimumUnverifiedSuccesses: Int = 3,
    private val minimumCapacityExclusions: Int = 3,
) : SwarmRoutingChallengePlanner {
    init {
        require(minimumSelectedFailures > 0)
        require(minimumUnverifiedSuccesses > 0)
        require(minimumCapacityExclusions > 0)
    }

    override suspend fun plan(limit: Int): List<SwarmRoutingChallenge> {
        require(limit > 0) { "limit must be positive" }
        val currentExperienceIds = experienceStore.experiences.value.mapTo(mutableSetOf()) { it.id }
        val aggregates = mutableMapOf<String, RoutingEvidence>()
        runStore.runs.value.forEach { run -> collectRun(run, aggregates) }
        val evaluationsByExperience = evolutionStore.evaluations.value.groupBy { it.experienceId }
        return aggregates.asSequence()
            .filter { (experienceId) -> experienceId in currentExperienceIds }
            .mapNotNull { (experienceId, evidence) ->
                val controlled = evaluationsByExperience[experienceId].orEmpty().comparableEvaluationSummary()
                val reason = chooseReason(evidence, controlled) ?: return@mapNotNull null
                SwarmRoutingChallenge(
                    experienceId = experienceId,
                    reason = reason,
                    priority = priority(reason, evidence, controlled),
                    selectedSuccesses = evidence.selectedSuccesses,
                    selectedRecoveries = evidence.selectedRecoveries,
                    selectedFailures = evidence.selectedFailures,
                    planningSuccesses = evidence.planningSuccesses,
                    planningFailures = evidence.planningFailures,
                    abstainedObservedHarm = evidence.abstainedObservedHarm,
                    abstainedControlledRegression = evidence.abstainedControlledRegression,
                    abstainedLimit = evidence.abstainedLimit,
                    controlledCases = controlled.cases,
                    controlledWins = controlled.wins,
                    controlledRegressions = controlled.regressions,
                    medianQualityDelta = controlled.medianQualityDelta,
                    controlledEnvironmentFingerprint = controlled.environmentFingerprint,
                    evaluationIds = controlled.evaluationIds,
                    queryFingerprints = evidence.queryFingerprints.sorted().take(MAX_PROVENANCE_ITEMS),
                    runIds = evidence.runIds.sorted().take(MAX_PROVENANCE_ITEMS),
                    taskKeys = evidence.taskKeys.sorted().take(MAX_PROVENANCE_ITEMS),
                )
            }
            .sortedWith(
                compareByDescending<SwarmRoutingChallenge>(SwarmRoutingChallenge::priority)
                    .thenBy(SwarmRoutingChallenge::experienceId)
            )
            .take(limit)
            .toList()
    }

    private fun chooseReason(
        evidence: RoutingEvidence,
        controlled: SwarmComparableEvaluationSummary,
    ): SwarmRoutingChallengeReason? = when {
        controlled.regressions > 0 -> SwarmRoutingChallengeReason.CONTROLLED_REGRESSION_RECHECK
        evidence.abstainedObservedHarm > 0 && controlled.cases == 0 ->
            SwarmRoutingChallengeReason.OBSERVED_HARM_REQUIRES_LOO
        evidence.selectedFailures + evidence.planningFailures >= minimumSelectedFailures && controlled.cases == 0 ->
            SwarmRoutingChallengeReason.SELECTED_FAILURE_REQUIRES_LOO
        evidence.selectedSuccesses + evidence.selectedRecoveries + evidence.planningSuccesses >=
            minimumUnverifiedSuccesses && controlled.cases == 0 ->
            SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO
        evidence.abstainedLimit >= minimumCapacityExclusions && controlled.cases == 0 ->
            SwarmRoutingChallengeReason.CAPACITY_EXCLUSION_REVIEW
        else -> null
    }

    private fun priority(
        reason: SwarmRoutingChallengeReason,
        evidence: RoutingEvidence,
        controlled: SwarmComparableEvaluationSummary,
    ): Int = when (reason) {
        SwarmRoutingChallengeReason.CONTROLLED_REGRESSION_RECHECK ->
            1_000 + controlled.regressions * 100 + evidence.selectedFailures * 20
        SwarmRoutingChallengeReason.OBSERVED_HARM_REQUIRES_LOO ->
            800 + evidence.abstainedObservedHarm * 40 + evidence.selectedFailures * 15
        SwarmRoutingChallengeReason.SELECTED_FAILURE_REQUIRES_LOO ->
            650 + (evidence.selectedFailures + evidence.planningFailures) * 30
        SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO ->
            450 + (evidence.selectedSuccesses + evidence.selectedRecoveries + evidence.planningSuccesses) * 15
        SwarmRoutingChallengeReason.CAPACITY_EXCLUSION_REVIEW -> 250 + evidence.abstainedLimit * 10
    }

    private fun collectRun(run: SwarmRun, aggregates: MutableMap<String, RoutingEvidence>) {
        run.planningExperienceRoutingDecisions.forEach { decision ->
            aggregates.getOrPut(decision.experienceId, ::RoutingEvidence).apply {
                recordDecision(decision)
                when {
                    decision.status != SwarmExperienceRoutingStatus.SELECTED -> Unit
                    run.status == SwarmRunStatus.SUCCEEDED -> planningSuccesses += 1
                    run.status == SwarmRunStatus.FAILED -> planningFailures += 1
                }
                runIds += run.id
            }
        }
        run.tasks.forEach { task -> collectTask(run.id, task, aggregates) }
    }

    private fun collectTask(
        runId: String,
        task: SwarmTask,
        aggregates: MutableMap<String, RoutingEvidence>,
    ) {
        task.experienceRoutingDecisions.forEach { decision ->
            aggregates.getOrPut(decision.experienceId, ::RoutingEvidence).apply {
                recordDecision(decision)
                if (decision.status == SwarmExperienceRoutingStatus.SELECTED) {
                    when {
                        task.status == SwarmTaskStatus.FAILED -> selectedFailures += 1
                        task.status == SwarmTaskStatus.SUCCEEDED && decision.attempt < task.attempt -> selectedFailures += 1
                        task.status == SwarmTaskStatus.SUCCEEDED && task.attempt > 1 -> selectedRecoveries += 1
                        task.status == SwarmTaskStatus.SUCCEEDED -> selectedSuccesses += 1
                    }
                }
                runIds += runId
                taskKeys += "$runId:${task.id}"
            }
        }
    }
}

private class RoutingEvidence {
    var selectedSuccesses = 0
    var selectedRecoveries = 0
    var selectedFailures = 0
    var planningSuccesses = 0
    var planningFailures = 0
    var abstainedObservedHarm = 0
    var abstainedControlledRegression = 0
    var abstainedLimit = 0
    val queryFingerprints = mutableSetOf<String>()
    val runIds = mutableSetOf<String>()
    val taskKeys = mutableSetOf<String>()

    fun recordDecision(decision: SwarmExperienceRoutingDecision) {
        queryFingerprints += decision.queryFingerprint
        when (decision.status) {
            SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM -> abstainedObservedHarm += 1
            SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION -> abstainedControlledRegression += 1
            SwarmExperienceRoutingStatus.ABSTAINED_LIMIT -> abstainedLimit += 1
            SwarmExperienceRoutingStatus.SELECTED -> Unit
        }
    }
}

private const val MAX_PROVENANCE_ITEMS = 24
