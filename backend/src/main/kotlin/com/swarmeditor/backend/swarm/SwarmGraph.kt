package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTask

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
            require(task.id !in task.dependsOn) { "Task ${task.id} cannot depend on itself" }
            task.dependsOn.forEach { dependencyId ->
                require(dependencyId in tasksById) {
                    "Task ${task.id} depends on missing task $dependencyId"
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
}
