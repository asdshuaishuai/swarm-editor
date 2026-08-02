package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import java.util.ArrayDeque

data class SwarmGraphNodeMetrics(
    val depth: Int,
    val upstreamReach: Int,
    val downstreamReach: Int,
    val directDependents: Int,
    val bridgeCentrality: Double,
)

data class SwarmGraphAnalysis(
    val topologicalOrder: List<String>,
    val dependents: Map<String, List<String>>,
    val metrics: Map<String, SwarmGraphNodeMetrics>,
)

object SwarmGraph {
    private val validId = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")

    fun validate(tasks: List<SwarmTask>) {
        require(tasks.isNotEmpty()) { "Swarm run requires at least one task" }
        val tasksById = tasks.associateBy { it.id }
        require(tasksById.size == tasks.size) { "Swarm task ids must be unique" }
        tasks.forEach { task ->
            require(validId.matches(task.id)) { "Invalid swarm task id: ${task.id}" }
            require(task.title.isNotBlank()) { "Swarm task title cannot be blank" }
            require(task.prompt.isNotBlank()) { "Swarm task prompt cannot be blank" }
            task.readPaths.forEach(::validateOwnershipScope)
            task.writePaths.forEach(::validateOwnershipScope)
            require(task.readPaths.distinct().size == task.readPaths.size) {
                "Task ${task.id} contains duplicate read ownership paths"
            }
            require(task.writePaths.distinct().size == task.writePaths.size) {
                "Task ${task.id} contains duplicate write ownership paths"
            }
            require(task.verificationCommands.size <= MAX_TASK_VERIFICATION_COMMANDS) {
                "Task ${task.id} declares too many verification commands"
            }
            task.verificationCommands.forEach { command ->
                require(command.isNotEmpty()) { "Task ${task.id} contains an empty verification command" }
                require(command.size <= MAX_TASK_VERIFICATION_ARGUMENTS) {
                    "Task ${task.id} verification command contains too many arguments"
                }
                command.forEach { argument ->
                    require(
                        argument.isNotBlank() &&
                            argument.length <= MAX_TASK_VERIFICATION_ARGUMENT_LENGTH &&
                            argument.none(Char::isISOControl)
                    ) { "Task ${task.id} contains an invalid verification argument" }
                }
            }
            require(task.id !in task.dependsOn) { "Task ${task.id} cannot depend on itself" }
            task.dependsOn.forEach { dependencyId ->
                require(dependencyId in tasksById) {
                    "Task ${task.id} depends on missing task $dependencyId"
                }
            }
            task.revisionContract?.let { contract ->
                require(task.dependsOn == listOf(contract.sourceTaskId)) {
                    "Revision task ${task.id} must depend only on its bound source task ${contract.sourceTaskId}"
                }
                require(contract.sourceAttempt > 0) { "Revision contract source attempt must be positive" }
                require(contract.sourceArtifactRevision.matches(gitObjectId)) {
                    "Revision contract source revision is invalid"
                }
                require(contract.sourceArtifactTree.matches(gitObjectId)) {
                    "Revision contract source tree is invalid"
                }
                require(contract.targetHunkIds.size <= MAX_REVISION_TARGETS) {
                    "Revision contract contains too many target hunks"
                }
                require(contract.targetHunkIds.all { it.matches(reviewHunkId) }) {
                    "Revision contract contains an invalid target hunk id"
                }
                require(contract.contextHunkIds.size <= MAX_REVISION_TARGETS) {
                    "Revision contract contains too many context hunks"
                }
                require(contract.contextHunkIds.distinct().size == contract.contextHunkIds.size) {
                    "Revision contract contains duplicate context hunks"
                }
                require(contract.contextHunkIds.all { it.matches(reviewHunkId) }) {
                    "Revision contract contains an invalid context hunk id"
                }
                require(contract.contextHunkIds.none(contract.targetHunkIds::contains)) {
                    "Revision contract target and context hunks must be disjoint"
                }
                require(contract.targetPaths.distinct().size == contract.targetPaths.size) {
                    "Revision contract contains duplicate target paths"
                }
                contract.targetPaths.forEach(::validateOwnershipScope)
                require(contract.contextPaths.distinct().size == contract.contextPaths.size) {
                    "Revision contract contains duplicate context paths"
                }
                contract.contextPaths.forEach(::validateOwnershipScope)
                require(contract.sourceWritePaths.distinct().size == contract.sourceWritePaths.size) {
                    "Revision contract contains duplicate source write paths"
                }
                contract.sourceWritePaths.forEach(::validateOwnershipScope)
                val expectedWritePaths = when (contract.scopeMode) {
                    SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY -> contract.targetPaths
                    SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE -> contract.sourceWritePaths
                }
                require(task.writePaths == expectedWritePaths) {
                    "Revision task ${task.id} write ownership does not match contract scope ${contract.scopeMode}"
                }
                require(contract.targetPaths.all { target ->
                    task.writePaths.any { scope -> ownershipScopeMatchesPath(scope, target) }
                }) {
                    "Revision task ${task.id} cannot modify every contract target path"
                }
            }
        }

        val visiting = mutableSetOf<String>()
        val visited = mutableSetOf<String>()
        fun visit(taskId: String) {
            if (taskId in visited) return
            require(visiting.add(taskId)) { "Swarm task graph contains a cycle at $taskId" }
            tasksById.getValue(taskId).dependsOn.forEach(::visit)
            visiting.remove(taskId)
            visited.add(taskId)
        }
        tasksById.keys.forEach(::visit)
    }

    fun analyze(tasks: List<SwarmTask>): SwarmGraphAnalysis {
        validate(tasks)
        val tasksById = tasks.associateBy(SwarmTask::id)
        val taskOrder = tasks.mapIndexed { index, task -> task.id to index }.toMap()
        val dependents = tasks.associate { it.id to mutableListOf<String>() }.toMutableMap()
        val remainingDependencies = tasks.associate { it.id to it.dependsOn.size }.toMutableMap()
        tasks.forEach { task ->
            task.dependsOn.forEach { dependencyId -> dependents.getValue(dependencyId) += task.id }
        }
        dependents.values.forEach { children -> children.sortBy(taskOrder::getValue) }

        val ready = ArrayDeque(
            tasks.filter { remainingDependencies.getValue(it.id) == 0 }
                .sortedBy { taskOrder.getValue(it.id) }
                .map(SwarmTask::id)
        )
        val topologicalOrder = mutableListOf<String>()
        while (ready.isNotEmpty()) {
            val taskId = ready.removeFirst()
            topologicalOrder += taskId
            dependents.getValue(taskId).forEach { dependentId ->
                val remaining = remainingDependencies.getValue(dependentId) - 1
                remainingDependencies[dependentId] = remaining
                if (remaining == 0) ready.addLast(dependentId)
            }
        }
        check(topologicalOrder.size == tasks.size) { "Validated swarm graph did not produce a topological order" }

        val depth = mutableMapOf<String, Int>()
        val ancestors = mutableMapOf<String, Set<String>>()
        topologicalOrder.forEach { taskId ->
            val dependencies = tasksById.getValue(taskId).dependsOn
            depth[taskId] = dependencies.maxOfOrNull { depth.getValue(it) + 1 } ?: 0
            ancestors[taskId] = buildSet {
                dependencies.forEach { dependencyId ->
                    add(dependencyId)
                    addAll(ancestors.getValue(dependencyId))
                }
            }
        }

        val descendants = mutableMapOf<String, Set<String>>()
        topologicalOrder.asReversed().forEach { taskId ->
            descendants[taskId] = buildSet {
                dependents.getValue(taskId).forEach { dependentId ->
                    add(dependentId)
                    addAll(descendants.getValue(dependentId))
                }
            }
        }
        val centralityScale = (tasks.size - 1).coerceAtLeast(1).let { it * it }.toDouble()
        val metrics = topologicalOrder.associateWith { taskId ->
            val upstreamReach = ancestors.getValue(taskId).size
            val downstreamReach = descendants.getValue(taskId).size
            SwarmGraphNodeMetrics(
                depth = depth.getValue(taskId),
                upstreamReach = upstreamReach,
                downstreamReach = downstreamReach,
                directDependents = dependents.getValue(taskId).size,
                bridgeCentrality = (upstreamReach.toDouble() * downstreamReach) / centralityScale,
            )
        }
        return SwarmGraphAnalysis(
            topologicalOrder = topologicalOrder,
            dependents = dependents.mapValues { it.value.toList() },
            metrics = metrics,
        )
    }
}

private const val MAX_TASK_VERIFICATION_COMMANDS = 6
private const val MAX_TASK_VERIFICATION_ARGUMENTS = 64
private const val MAX_TASK_VERIFICATION_ARGUMENT_LENGTH = 2_048
private const val MAX_REVISION_TARGETS = 20_000
private val gitObjectId = Regex("[0-9a-f]{40}|[0-9a-f]{64}")
private val reviewHunkId = Regex("hunk-[0-9a-f]{20}")
