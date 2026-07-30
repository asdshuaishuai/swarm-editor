package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmExperienceEvaluation

internal data class SwarmComparableEvaluationSummary(
    val environmentFingerprint: String?,
    val cases: Int,
    val distinctTasks: Int,
    val wins: Int,
    val regressions: Int,
    val medianQualityDelta: Double,
    val evaluationIds: List<String>,
)

internal fun List<SwarmExperienceEvaluation>.comparableEvaluationSummary(): SwarmComparableEvaluationSummary {
    if (isEmpty()) return SwarmComparableEvaluationSummary(null, 0, 0, 0, 0, 0.0, emptyList())
    val cohort = groupBy(SwarmExperienceEvaluation::environmentFingerprint)
        .maxWithOrNull(
            compareBy<Map.Entry<String, List<SwarmExperienceEvaluation>>> {
                it.value.map(SwarmExperienceEvaluation::taskFingerprint).distinct().size
            }.thenBy { it.value.size }
                .thenBy { entry -> entry.value.maxOf(SwarmExperienceEvaluation::createdAt) }
        ) ?: return SwarmComparableEvaluationSummary(null, 0, 0, 0, 0, 0.0, emptyList())
    val taskEffects = cohort.value.groupBy(SwarmExperienceEvaluation::taskFingerprint)
        .mapValues { (_, evaluations) -> evaluations.map(::qualityDelta).median() }
    return SwarmComparableEvaluationSummary(
        environmentFingerprint = cohort.key,
        cases = cohort.value.size,
        distinctTasks = taskEffects.size,
        wins = taskEffects.values.count { it >= CONTROLLED_EFFECT_THRESHOLD },
        regressions = taskEffects.values.count { it <= -CONTROLLED_EFFECT_THRESHOLD },
        medianQualityDelta = taskEffects.values.toList().median(),
        evaluationIds = cohort.value.map(SwarmExperienceEvaluation::id).sorted(),
    )
}

private fun qualityDelta(evaluation: SwarmExperienceEvaluation): Double = when {
    evaluation.treatment.passed && !evaluation.control.passed -> 1.0
    !evaluation.treatment.passed && evaluation.control.passed -> -1.0
    else -> evaluation.treatment.qualityScore - evaluation.control.qualityScore
}

private fun List<Double>.median(): Double {
    if (isEmpty()) return 0.0
    val sorted = sorted()
    val middle = sorted.size / 2
    return if (sorted.size % 2 == 0) (sorted[middle - 1] + sorted[middle]) / 2.0 else sorted[middle]
}

internal const val CONTROLLED_EFFECT_THRESHOLD = 0.05
