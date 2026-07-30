package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperienceRoutingDecision
import com.swarmeditor.common.model.SwarmExperienceRoutingStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import java.security.MessageDigest
import kotlinx.serialization.Serializable

@Serializable
enum class SwarmRoutingEvaluationTarget {
    PLANNING,
    TASK,
}

@Serializable
enum class SwarmRoutingEvaluationCaseStatus {
    READY_FOR_VARIANT_GENERATION,
    BLOCKED_PROVENANCE,
}

@Serializable
enum class SwarmRoutingEvaluationBlocker {
    SOURCE_RUN_NOT_FOUND,
    SOURCE_TASK_NOT_FOUND,
    SOURCE_ROUTING_DECISION_NOT_FOUND,
    SOURCE_AGENT_NOT_RECORDED,
}

@Serializable
data class SwarmRoutingEvaluationCase(
    val id: String,
    val experienceId: String,
    val challengeReason: SwarmRoutingChallengeReason,
    val priority: Int,
    val repositoryRevision: String,
    val repositoryBaseRevision: String,
    val repositoryTreeHash: String,
    val repositoryDirty: Boolean,
    val repositoryPinnedReference: String?,
    val sourceRunId: String?,
    val sourceTaskId: String?,
    val target: SwarmRoutingEvaluationTarget,
    val objective: String,
    val taskTitle: String?,
    val taskPrompt: String?,
    val taskRole: SwarmAgentRole?,
    val sourceAgentId: String?,
    val sourceAttempt: Int?,
    val sourceRoutingStatus: SwarmExperienceRoutingStatus?,
    val sourceQueryFingerprint: String?,
    val controlExperienceIds: List<String>,
    val treatmentExperienceIds: List<String>,
    val verifierCommand: List<String>,
    val taskFingerprint: String,
    val status: SwarmRoutingEvaluationCaseStatus,
    val blockers: List<SwarmRoutingEvaluationBlocker>,
)

fun interface SwarmRoutingEvaluationCasePlanner {
    suspend fun plan(
        challenges: List<SwarmRoutingChallenge>,
        snapshot: SwarmRepositorySnapshot,
        verifierCommand: List<String>,
    ): List<SwarmRoutingEvaluationCase>
}

class EvidenceDrivenSwarmRoutingEvaluationCasePlanner(
    private val runStore: SwarmStore,
) : SwarmRoutingEvaluationCasePlanner {
    override suspend fun plan(
        challenges: List<SwarmRoutingChallenge>,
        snapshot: SwarmRepositorySnapshot,
        verifierCommand: List<String>,
    ): List<SwarmRoutingEvaluationCase> {
        require(verifierCommand.isNotEmpty() && verifierCommand.none(String::isBlank)) {
            "Evaluation verifier command cannot be empty"
        }
        val runsById = runStore.runs.value.associateBy(SwarmRun::id)
        return challenges.distinctBy(SwarmRoutingChallenge::experienceId).map { challenge ->
            buildCase(challenge, snapshot, verifierCommand, runsById)
        }
    }

    private fun buildCase(
        challenge: SwarmRoutingChallenge,
        snapshot: SwarmRepositorySnapshot,
        verifierCommand: List<String>,
        runsById: Map<String, SwarmRun>,
    ): SwarmRoutingEvaluationCase {
        val located = locateSource(challenge, runsById)
        val source = located.source
        val blockers = buildList {
            if (source == null) {
                add(if (located.runFound) SwarmRoutingEvaluationBlocker.SOURCE_TASK_NOT_FOUND else
                    SwarmRoutingEvaluationBlocker.SOURCE_RUN_NOT_FOUND)
            } else if (source.decision == null) {
                add(SwarmRoutingEvaluationBlocker.SOURCE_ROUTING_DECISION_NOT_FOUND)
            }
            if (source != null &&
                (source.target == SwarmRoutingEvaluationTarget.PLANNING || source.task?.agentId.isNullOrBlank())
            ) {
                add(SwarmRoutingEvaluationBlocker.SOURCE_AGENT_NOT_RECORDED)
            }
        }.distinct()
        val sourceAttempt = source?.decision?.attempt
        val selectedExperienceIds = source?.decisions.orEmpty()
            .filter { decision ->
                decision.status == SwarmExperienceRoutingStatus.SELECTED &&
                    (sourceAttempt == null || decision.attempt == sourceAttempt)
            }
            .map(SwarmExperienceRoutingDecision::experienceId)
            .toSortedSet()
        val controlExperienceIds = selectedExperienceIds.filterNot { it == challenge.experienceId }
        val treatmentExperienceIds = (controlExperienceIds + challenge.experienceId).distinct().sorted()
        val target = source?.target ?: SwarmRoutingEvaluationTarget.TASK
        val objective = source?.run?.objective.orEmpty()
        val taskFingerprint = fingerprint(
            target.name,
            objective,
            source?.task?.title.orEmpty(),
            source?.task?.prompt.orEmpty(),
            source?.task?.role?.name.orEmpty(),
            source?.decision?.queryFingerprint.orEmpty(),
        )
        val id = "route-case-${fingerprint(
            snapshot.revision,
            challenge.experienceId,
            challenge.reason.name,
            source?.run?.id.orEmpty(),
            source?.task?.id.orEmpty(),
            source?.decision?.queryFingerprint.orEmpty(),
            controlExperienceIds.joinToString(","),
            treatmentExperienceIds.joinToString(","),
            verifierCommand.joinToString("\u0000"),
        ).take(24)}"
        return SwarmRoutingEvaluationCase(
            id = id,
            experienceId = challenge.experienceId,
            challengeReason = challenge.reason,
            priority = challenge.priority,
            repositoryRevision = snapshot.revision,
            repositoryBaseRevision = snapshot.baseRevision,
            repositoryTreeHash = snapshot.treeHash,
            repositoryDirty = snapshot.dirty,
            repositoryPinnedReference = snapshot.pinnedReference,
            sourceRunId = source?.run?.id,
            sourceTaskId = source?.task?.id,
            target = target,
            objective = objective,
            taskTitle = source?.task?.title,
            taskPrompt = source?.task?.prompt,
            taskRole = source?.task?.role,
            sourceAgentId = source?.task?.agentId,
            sourceAttempt = sourceAttempt,
            sourceRoutingStatus = source?.decision?.status,
            sourceQueryFingerprint = source?.decision?.queryFingerprint,
            controlExperienceIds = controlExperienceIds,
            treatmentExperienceIds = treatmentExperienceIds,
            verifierCommand = verifierCommand,
            taskFingerprint = taskFingerprint,
            status = if (blockers.isEmpty()) {
                SwarmRoutingEvaluationCaseStatus.READY_FOR_VARIANT_GENERATION
            } else {
                SwarmRoutingEvaluationCaseStatus.BLOCKED_PROVENANCE
            },
            blockers = blockers,
        )
    }

    private fun locateSource(
        challenge: SwarmRoutingChallenge,
        runsById: Map<String, SwarmRun>,
    ): LocatedSource {
        var runFound = false
        val taskSources = challenge.taskKeys.mapNotNull { taskKey ->
            val separator = taskKey.indexOf(':')
            if (separator <= 0 || separator == taskKey.lastIndex) return@mapNotNull null
            val run = runsById[taskKey.substring(0, separator)] ?: return@mapNotNull null
            runFound = true
            val task = run.tasks.singleOrNull { it.id == taskKey.substring(separator + 1) } ?: return@mapNotNull null
            sourceFor(challenge, run, task, task.experienceRoutingDecisions)
        }
        val planningSources = challenge.runIds.mapNotNull { runId ->
            val run = runsById[runId] ?: return@mapNotNull null
            runFound = true
            sourceFor(challenge, run, null, run.planningExperienceRoutingDecisions)
        }
        val source = (taskSources + planningSources).minWithOrNull(
                compareBy<Source> { source -> source.decision == null }
                    .thenBy { source -> routingStatusRank(challenge.reason, source.decision?.status) }
                    .thenBy { source -> if (source.target == SwarmRoutingEvaluationTarget.TASK) 0 else 1 }
                    .thenBy { source -> source.run.id }
                .thenBy { source -> source.task?.id.orEmpty() }
        )
        return LocatedSource(source, runFound)
    }

    private fun sourceFor(
        challenge: SwarmRoutingChallenge,
        run: SwarmRun,
        task: SwarmTask?,
        decisions: List<SwarmExperienceRoutingDecision>,
    ): Source {
        val decision = decisions.filter { it.experienceId == challenge.experienceId }
            .minWithOrNull(
                compareBy<SwarmExperienceRoutingDecision> {
                    it.queryFingerprint !in challenge.queryFingerprints
                }.thenBy { routingStatusRank(challenge.reason, it.status) }
                    .thenByDescending(SwarmExperienceRoutingDecision::attempt)
            )
        return Source(
            run = run,
            task = task,
            target = if (task == null) SwarmRoutingEvaluationTarget.PLANNING else SwarmRoutingEvaluationTarget.TASK,
            decision = decision,
            decisions = decisions,
        )
    }
}

private data class LocatedSource(
    val source: Source?,
    val runFound: Boolean,
)

private data class Source(
    val run: SwarmRun,
    val task: SwarmTask?,
    val target: SwarmRoutingEvaluationTarget,
    val decision: SwarmExperienceRoutingDecision?,
    val decisions: List<SwarmExperienceRoutingDecision>,
)

private fun routingStatusRank(
    reason: SwarmRoutingChallengeReason,
    status: SwarmExperienceRoutingStatus?,
): Int = when (reason) {
    SwarmRoutingChallengeReason.CONTROLLED_REGRESSION_RECHECK -> when (status) {
        SwarmExperienceRoutingStatus.ABSTAINED_CONTROLLED_REGRESSION -> 0
        SwarmExperienceRoutingStatus.SELECTED -> 1
        else -> 2
    }
    SwarmRoutingChallengeReason.OBSERVED_HARM_REQUIRES_LOO ->
        if (status == SwarmExperienceRoutingStatus.ABSTAINED_OBSERVED_HARM) 0 else 1
    SwarmRoutingChallengeReason.SELECTED_FAILURE_REQUIRES_LOO,
    SwarmRoutingChallengeReason.UNVERIFIED_BENEFIT_REQUIRES_LOO,
    -> if (status == SwarmExperienceRoutingStatus.SELECTED) 0 else 1
    SwarmRoutingChallengeReason.CAPACITY_EXCLUSION_REVIEW ->
        if (status == SwarmExperienceRoutingStatus.ABSTAINED_LIMIT) 0 else 1
}

private fun fingerprint(vararg values: String): String = MessageDigest.getInstance("SHA-256")
    .digest(values.joinToString("\u0000").encodeToByteArray())
    .joinToString("") { byte -> "%02x".format(byte) }
