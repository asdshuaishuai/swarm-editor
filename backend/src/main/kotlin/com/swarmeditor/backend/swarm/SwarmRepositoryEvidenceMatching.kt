package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask

internal fun selectTaskRepositoryEvidence(
    run: SwarmRun,
    task: SwarmTask,
    limit: Int = 6,
): List<SwarmRepositoryEvidence> {
    require(limit >= 0) { "Repository evidence limit cannot be negative" }
    if (limit == 0) return emptyList()
    return run.planningEvidence
        ?.evidence
        .orEmpty()
        .asSequence()
        .filter { evidence -> evidence.matchesTask(task) }
        .sortedWith(compareByDescending<SwarmRepositoryEvidence>(SwarmRepositoryEvidence::score).thenBy { it.id })
        .take(limit)
        .toList()
}

internal fun SwarmRepositoryEvidence.matchesTask(task: SwarmTask): Boolean {
    val paths = repositoryPaths()
    val scopes = task.readPaths + task.writePaths
    return paths.any { path ->
        scopes.any { scope -> repositoryScopeMatchesPath(scope, path) } ||
            task.title.contains(path, ignoreCase = true) ||
            task.prompt.contains(path, ignoreCase = true)
    }
}

internal fun SwarmRepositoryEvidence.dependencyClusterSize(): Int = if (
    kind == SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER
) {
    dependencyClusterSizePattern.find(summary)
        ?.groupValues
        ?.getOrNull(1)
        ?.toIntOrNull()
        ?: repositoryPaths().size
} else {
    0
}

private fun SwarmRepositoryEvidence.repositoryPaths(): Set<String> = buildSet {
    path?.normalizeRepositoryPath()?.takeIf(String::isNotBlank)?.let(::add)
    if (kind == SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER) {
        excerpt.orEmpty().split(',').forEach { candidate ->
            candidate.normalizeRepositoryPath().takeIf(String::isNotBlank)?.let(::add)
        }
    }
}

private fun repositoryScopeMatchesPath(scope: String, path: String): Boolean {
    val normalizedScope = scope.normalizeRepositoryPath()
    val normalizedPath = path.normalizeRepositoryPath()
    if (normalizedScope == normalizedPath) return true
    if ('*' !in normalizedScope && '?' !in normalizedScope) {
        return normalizedPath.startsWith(normalizedScope.trimEnd('/') + "/")
    }
    return repositoryGlobRegex(normalizedScope).matches(normalizedPath)
}

private fun repositoryGlobRegex(scope: String): Regex = buildString {
    append('^')
    var index = 0
    while (index < scope.length) {
        when (val character = scope[index]) {
            '*' -> {
                if (scope.getOrNull(index + 1) == '*') {
                    append(".*")
                    index += 1
                } else {
                    append("[^/]*")
                }
            }
            '?' -> append("[^/]")
            '.', '(', ')', '[', ']', '{', '}', '+', '^', '$', '|', '\\' -> append('\\').append(character)
            else -> append(character)
        }
        index += 1
    }
    append('$')
}.toRegex()

private fun String.normalizeRepositoryPath(): String = trim().replace('\\', '/').removePrefix("./").trim('/')

private val dependencyClusterSizePattern = Regex("Strongly connected source cluster: (\\d+)")
