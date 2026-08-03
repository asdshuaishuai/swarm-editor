package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmModelDemand
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import kotlin.math.ln
import kotlin.math.round

object SwarmModelDemandAssessor {
    fun assess(
        run: SwarmRun,
        task: SwarmTask,
        graphAnalysis: SwarmGraphAnalysis = SwarmGraph.analyze(run.tasks),
    ): SwarmModelDemand {
        val metrics = graphAnalysis.metrics.getValue(task.id)
        val roleBaseline = when (task.role) {
            SwarmAgentRole.PLANNER -> 0.38
            SwarmAgentRole.IMPLEMENTER -> 0.42
            SwarmAgentRole.REVIEWER -> 0.48
            SwarmAgentRole.INTEGRATOR -> 0.52
            SwarmAgentRole.GENERAL -> 0.20
        }
        val retryContribution = task.attempt.coerceAtMost(3) * 0.07
        val explicitWriteContribution = (task.writePaths.size.coerceAtMost(5) * 0.02)
        val broadWriteContribution = if (task.writePaths.any(::isBroadScope)) 0.06 else 0.0
        val verificationContribution = task.verificationCommands.size.coerceAtMost(4) * 0.035
        val revisionContribution = if (task.revisionContract != null) 0.14 else 0.0
        val downstreamContribution = if (metrics.downstreamReach == 0) {
            0.0
        } else {
            (ln(1.0 + metrics.downstreamReach) / ln(9.0) * 0.12).coerceAtMost(0.12)
        }
        val bridgeContribution = (metrics.bridgeCentrality * 0.12).coerceIn(0.0, 0.12)
        val dependencyClusterSize = matchingDependencyClusterSize(run, task)
        val clusterContribution = when {
            dependencyClusterSize <= 1 -> 0.0
            else -> (0.15 + (dependencyClusterSize - 2).coerceAtMost(6) * 0.025).coerceAtMost(0.30)
        }
        val normalizedScore = rounded(
            (
                roleBaseline + retryContribution + explicitWriteContribution + broadWriteContribution +
                    verificationContribution + revisionContribution + downstreamContribution +
                    bridgeContribution + clusterContribution
                ).coerceIn(0.0, 1.0)
        )
        val repositoryRiskScore = rounded(
            (
                clusterContribution * 1.8 + broadWriteContribution * 1.5 + revisionContribution * 0.8 +
                    bridgeContribution + downstreamContribution * 0.5
                ).coerceIn(0.0, 1.0)
        )
        val reasons = buildList {
            add("role=${task.role.name.lowercase()}")
            if (task.attempt > 0) add("retries=${task.attempt}")
            if (task.writePaths.isNotEmpty()) add("writeScopes=${task.writePaths.size}")
            if (broadWriteContribution > 0.0) add("broadWriteScope")
            if (task.verificationCommands.isNotEmpty()) add("verification=${task.verificationCommands.size}")
            if (task.revisionContract != null) add("revisionContract")
            if (metrics.downstreamReach > 0) add("downstream=${metrics.downstreamReach}")
            if (metrics.bridgeCentrality > 0.0) add("bridge=${rounded(metrics.bridgeCentrality)}")
            if (dependencyClusterSize > 1) add("sccFiles=$dependencyClusterSize")
        }
        return SwarmModelDemand(
            normalizedScore = normalizedScore,
            targetThinkingLevel = targetThinkingLevel(normalizedScore),
            repositoryRiskScore = repositoryRiskScore,
            dependencyClusterSize = dependencyClusterSize,
            reasons = reasons,
        )
    }

    private fun targetThinkingLevel(score: Double): AgentThinkingLevel = when {
        score >= 0.82 -> AgentThinkingLevel.XHIGH
        score >= 0.64 -> AgentThinkingLevel.HIGH
        score >= 0.43 -> AgentThinkingLevel.MEDIUM
        score >= 0.25 -> AgentThinkingLevel.LOW
        else -> AgentThinkingLevel.MINIMAL
    }

    private fun matchingDependencyClusterSize(run: SwarmRun, task: SwarmTask): Int = run.planningEvidence
        ?.evidence
        .orEmpty()
        .asSequence()
        .filter { it.kind == SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER }
        .filter { evidence -> evidence.matches(task) }
        .maxOfOrNull { evidence -> evidence.clusterSize() }
        ?: 0

    private fun SwarmRepositoryEvidence.matches(task: SwarmTask): Boolean {
        val members = clusterMembers()
        val scopes = task.readPaths + task.writePaths
        return members.any { member ->
            scopes.any { scope -> scopeMatchesPath(scope, member) } ||
                task.prompt.contains(member, ignoreCase = true)
        }
    }

    private fun SwarmRepositoryEvidence.clusterMembers(): Set<String> = buildSet {
        path?.normalizeRepositoryPath()?.takeIf(String::isNotBlank)?.let(::add)
        excerpt.orEmpty().split(',').forEach { candidate ->
            candidate.normalizeRepositoryPath().takeIf(String::isNotBlank)?.let(::add)
        }
    }

    private fun SwarmRepositoryEvidence.clusterSize(): Int = dependencyClusterSize
        .find(summary)
        ?.groupValues
        ?.getOrNull(1)
        ?.toIntOrNull()
        ?: clusterMembers().size

    private fun scopeMatchesPath(scope: String, path: String): Boolean {
        val normalizedScope = scope.normalizeRepositoryPath()
        val normalizedPath = path.normalizeRepositoryPath()
        if (normalizedScope == normalizedPath) return true
        if ('*' !in normalizedScope && '?' !in normalizedScope) {
            return normalizedPath.startsWith(normalizedScope.trimEnd('/') + "/")
        }
        return globRegex(normalizedScope).matches(normalizedPath)
    }

    private fun globRegex(scope: String): Regex = buildString {
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

    private fun isBroadScope(scope: String): Boolean {
        val normalized = scope.normalizeRepositoryPath()
        return normalized == "**" || normalized == "*" || normalized.endsWith("/**") ||
            normalized.count { it == '/' } < 2 && '*' in normalized
    }

    private fun rounded(value: Double): Double = round(value * 1_000.0) / 1_000.0

    private val dependencyClusterSize = Regex("Strongly connected source cluster: (\\d+)")
}
