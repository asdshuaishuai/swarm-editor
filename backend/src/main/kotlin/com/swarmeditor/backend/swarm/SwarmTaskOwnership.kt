package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmChangedPath
import com.swarmeditor.common.model.SwarmOwnershipViolation

data class SwarmOwnershipConflict(
    val firstScope: String,
    val secondScope: String,
    val access: String,
) {
    fun explanation(firstTaskId: String, secondTaskId: String): String =
        "Deferred because ownership conflicts with $secondTaskId: $access ($firstTaskId:$firstScope ↔ $secondTaskId:$secondScope)"
}

fun findOwnershipConflict(first: SwarmTask, second: SwarmTask): SwarmOwnershipConflict? {
    if (!first.hasDeclaredOwnership || !second.hasDeclaredOwnership) return null
    return first.writePaths.firstOverlap(second.writePaths)?.let { (left, right) ->
        SwarmOwnershipConflict(left, right, "write/write")
    } ?: first.writePaths.firstOverlap(second.readPaths)?.let { (left, right) ->
        SwarmOwnershipConflict(left, right, "write/read")
    } ?: first.readPaths.firstOverlap(second.writePaths)?.let { (left, right) ->
        SwarmOwnershipConflict(left, right, "read/write")
    }
}

data class SwarmOwnershipAudit(
    val compliant: Boolean,
    val violations: List<SwarmOwnershipViolation>,
    val policyVersion: String = OWNERSHIP_AUDIT_POLICY_VERSION,
)

fun auditChangedPaths(task: SwarmTask, changedPaths: List<SwarmChangedPath>): SwarmOwnershipAudit {
    val declaredWrites = task.writePaths.map(::validateOwnershipScope)
    val violations = changedPaths.mapNotNull { changed ->
        val normalizedPath = validateOwnershipScope(changed.path)
        if (declaredWrites.any { scope -> ownershipScopeMatchesPath(scope, normalizedPath) }) {
            null
        } else {
            SwarmOwnershipViolation(
                status = changed.status,
                path = normalizedPath,
                reason = if (declaredWrites.isEmpty()) {
                    "Task declared no write ownership"
                } else {
                    "Changed path is outside declared write ownership"
                },
            )
        }
    }
    return SwarmOwnershipAudit(compliant = violations.isEmpty(), violations = violations)
}

fun validateOwnershipScope(scope: String): String {
    val normalized = scope.trim().replace('\\', '/').removePrefix("./").replace(repeatedSlashes, "/")
    require(normalized.isNotBlank()) { "Swarm ownership path cannot be blank" }
    require(!normalized.startsWith('/')) { "Swarm ownership path must be repository-relative: $scope" }
    require(!windowsAbsolutePath.matches(normalized)) { "Swarm ownership path must be repository-relative: $scope" }
    require('\u0000' !in normalized) { "Swarm ownership path contains a null byte" }
    require(normalized.split('/').none { it == ".." }) { "Swarm ownership path escapes the repository: $scope" }
    return normalized
}

private val SwarmTask.hasDeclaredOwnership: Boolean
    get() = readPaths.isNotEmpty() || writePaths.isNotEmpty()

private fun List<String>.firstOverlap(other: List<String>): Pair<String, String>? {
    forEach { first ->
        other.forEach { second ->
            if (ownershipScopesOverlap(first, second)) return first to second
        }
    }
    return null
}

internal fun ownershipScopesOverlap(first: String, second: String): Boolean {
    val left = validateOwnershipScope(first)
    val right = validateOwnershipScope(second)
    if (left == right || left == "**" || right == "**") return true
    val leftWildcard = left.indexOfFirst { it == '*' || it == '?' || it == '[' }
    val rightWildcard = right.indexOfFirst { it == '*' || it == '?' || it == '[' }
    if (leftWildcard < 0 && rightWildcard < 0) return false
    val leftPrefix = left.take(if (leftWildcard < 0) left.length else leftWildcard).trimEnd('/')
    val rightPrefix = right.take(if (rightWildcard < 0) right.length else rightWildcard).trimEnd('/')
    if (leftPrefix.isEmpty() || rightPrefix.isEmpty()) return true
    return leftPrefix == rightPrefix ||
        leftPrefix.startsWith("$rightPrefix/") ||
        rightPrefix.startsWith("$leftPrefix/")
}

internal fun ownershipScopeMatchesPath(scope: String, path: String): Boolean {
    val normalizedScope = validateOwnershipScope(scope)
    val normalizedPath = validateOwnershipScope(path)
    if (normalizedScope == "**") return true
    if ('*' !in normalizedScope && '?' !in normalizedScope) return normalizedScope == normalizedPath
    return ownershipGlobRegex(normalizedScope).matches(normalizedPath)
}

private fun ownershipGlobRegex(scope: String): Regex = buildString {
    append('^')
    var index = 0
    while (index < scope.length) {
        when (val character = scope[index]) {
            '*' -> {
                if (scope.getOrNull(index + 1) == '*') {
                    append(".*")
                    index++
                } else {
                    append("[^/]*")
                }
            }
            '?' -> append("[^/]")
            '.', '(', ')', '+', '|', '^', '$', '{', '}', '[', ']', '\\' -> append('\\').append(character)
            else -> append(character)
        }
        index++
    }
    append('$')
}.toRegex()

private val repeatedSlashes = Regex("/{2,}")
private val windowsAbsolutePath = Regex("[A-Za-z]:/.*")
private const val OWNERSHIP_AUDIT_POLICY_VERSION = "declared-write-glob-v1"
