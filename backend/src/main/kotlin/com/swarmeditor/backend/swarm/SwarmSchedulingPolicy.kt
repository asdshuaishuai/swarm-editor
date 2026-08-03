package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import kotlin.math.ln

data class SwarmSchedulingScore(
    val utility: Double,
    val remainingCriticalPath: Double,
    val directUnlocks: Int,
    val downstreamReach: Int,
    val bridgeCentrality: Double,
    val retryCount: Int,
    val activeAgentPenalty: Double,
    val modelDemandScore: Double,
    val targetThinkingLevel: AgentThinkingLevel,
    val repositoryRiskScore: Double,
    val dependencyClusterSize: Int,
)

data class SwarmSchedulingSelection(
    val rankedCandidates: List<SwarmTask>,
    val selectedTaskIds: Set<String>,
    val scores: Map<String, SwarmSchedulingScore>,
    val deferredOwnershipReasons: Map<String, String> = emptyMap(),
)

interface SwarmSchedulingPolicy {
    val id: String

    fun select(
        run: SwarmRun,
        readyCandidates: List<SwarmTask>,
        activeTaskIds: Set<String>,
        capacity: Int,
    ): SwarmSchedulingSelection
}

class CriticalPathSwarmSchedulingPolicy : SwarmSchedulingPolicy {
    override val id: String = "critical-path-graph-risk-ownership-v4"

    override fun select(
        run: SwarmRun,
        readyCandidates: List<SwarmTask>,
        activeTaskIds: Set<String>,
        capacity: Int,
    ): SwarmSchedulingSelection {
        if (readyCandidates.isEmpty()) {
            return SwarmSchedulingSelection(emptyList(), emptySet(), emptyMap())
        }
        val tasksById = run.tasks.associateBy(SwarmTask::id)
        val graphAnalysis = SwarmGraph.analyze(run.tasks)
        val taskOrder = run.tasks.mapIndexed { index, task -> task.id to index }.toMap()
        val dependents = buildMap<String, MutableList<String>> {
            run.tasks.forEach { task ->
                task.dependsOn.forEach { dependencyId ->
                    getOrPut(dependencyId) { mutableListOf() } += task.id
                }
            }
        }
        val activeAgentIds = activeTaskIds.mapNotNull { tasksById[it]?.agentId }.toSet()
        val criticalPathMemo = mutableMapOf<String, Double>()
        val modelDemands = readyCandidates.associate { task ->
            task.id to SwarmModelDemandAssessor.assess(run, task, graphAnalysis)
        }

        fun remainingCriticalPath(taskId: String): Double = criticalPathMemo.getOrPut(taskId) {
            val task = tasksById.getValue(taskId)
            if (task.status.isTerminal) {
                0.0
            } else {
                val longestDependentPath = dependents[taskId]
                    .orEmpty()
                    .asSequence()
                    .map(tasksById::getValue)
                    .filterNot { it.status.isTerminal }
                    .maxOfOrNull { dependent -> remainingCriticalPath(dependent.id) }
                    ?: 0.0
                estimatedTaskCost(task) + longestDependentPath
            }
        }

        val scores = readyCandidates.associate { task ->
            val directUnlocks = dependents[task.id]
                .orEmpty()
                .map(tasksById::getValue)
                .count { dependent ->
                    dependent.status == SwarmTaskStatus.PENDING &&
                        dependent.dependsOn.all { dependencyId ->
                            dependencyId == task.id || tasksById.getValue(dependencyId).status == SwarmTaskStatus.SUCCEEDED
                        }
                }
            val activeAgentPenalty = if (task.agentId != null && task.agentId in activeAgentIds) 0.75 else 0.0
            val criticalPath = remainingCriticalPath(task.id)
            val graphMetrics = graphAnalysis.metrics.getValue(task.id)
            val modelDemand = modelDemands.getValue(task.id)
            val structuralLeverage = ln(1.0 + graphMetrics.downstreamReach) * 0.45 +
                graphMetrics.bridgeCentrality * 0.8
            val utility = criticalPath + directUnlocks * 0.4 + structuralLeverage +
                task.attempt * 0.25 + modelDemand.normalizedScore * 0.15 +
                modelDemand.repositoryRiskScore * 0.55 - activeAgentPenalty
            task.id to SwarmSchedulingScore(
                utility = utility,
                remainingCriticalPath = criticalPath,
                directUnlocks = directUnlocks,
                downstreamReach = graphMetrics.downstreamReach,
                bridgeCentrality = graphMetrics.bridgeCentrality,
                retryCount = task.attempt,
                activeAgentPenalty = activeAgentPenalty,
                modelDemandScore = modelDemand.normalizedScore,
                targetThinkingLevel = modelDemand.targetThinkingLevel,
                repositoryRiskScore = modelDemand.repositoryRiskScore,
                dependencyClusterSize = modelDemand.dependencyClusterSize,
            )
        }
        val ranked = readyCandidates.sortedWith(
            compareByDescending<SwarmTask> { scores.getValue(it.id).utility }
                .thenByDescending { scores.getValue(it.id).remainingCriticalPath }
                .thenBy { taskOrder.getValue(it.id) },
        )
        val activeTasks = activeTaskIds.mapNotNull(tasksById::get)
        val selected = linkedSetOf<String>()
        val selectedTasks = mutableListOf<SwarmTask>()
        val deferredOwnershipReasons = mutableMapOf<String, String>()
        ranked.forEach { task ->
            if (selected.size >= capacity.coerceAtLeast(0)) return@forEach
            val blocker = (activeTasks + selectedTasks).firstNotNullOfOrNull { other ->
                findOwnershipConflict(task, other)?.let { conflict -> other to conflict }
            }
            if (blocker == null) {
                selected += task.id
                selectedTasks += task
            } else {
                val (other, conflict) = blocker
                deferredOwnershipReasons[task.id] = conflict.explanation(task.id, other.id)
            }
        }
        return SwarmSchedulingSelection(
            rankedCandidates = ranked,
            selectedTaskIds = selected,
            scores = scores,
            deferredOwnershipReasons = deferredOwnershipReasons,
        )
    }
}

private fun estimatedTaskCost(task: SwarmTask): Double {
    val roleCost = when (task.role) {
        SwarmAgentRole.PLANNER -> 1.15
        SwarmAgentRole.IMPLEMENTER -> 1.8
        SwarmAgentRole.REVIEWER -> 1.25
        SwarmAgentRole.INTEGRATOR -> 1.65
        SwarmAgentRole.GENERAL -> 1.0
    }
    val promptCost = (((task.title.length + task.prompt.length) / 2_000).coerceAtMost(6)) * 0.25
    val completedDurations = task.attemptRecords.mapNotNull { it.durationMillis }.filter { it > 0 }.sorted()
    val observedCost = completedDurations.medianOrNull()
        ?.div(60_000.0)
        ?.coerceIn(0.25, 8.0)
        ?: 0.0
    return roleCost + promptCost + observedCost
}

private fun List<Long>.medianOrNull(): Double? {
    if (isEmpty()) return null
    val middle = size / 2
    return if (size % 2 == 1) {
        this[middle].toDouble()
    } else {
        (this[middle - 1] + this[middle]) / 2.0
    }
}

private val SwarmTaskStatus.isTerminal: Boolean
    get() = this in setOf(
        SwarmTaskStatus.SUCCEEDED,
        SwarmTaskStatus.FAILED,
        SwarmTaskStatus.BLOCKED,
        SwarmTaskStatus.CANCELED,
    )
