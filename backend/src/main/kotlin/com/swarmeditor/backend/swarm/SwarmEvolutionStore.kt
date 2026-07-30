package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmSkillCandidate
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val evolutionLog = KotlinLogging.logger {}

@Serializable
private data class SwarmEvolutionFile(
    val evaluations: List<SwarmExperienceEvaluation> = emptyList(),
    val candidates: List<SwarmSkillCandidate> = emptyList(),
    val routingEvaluationCases: List<SwarmRoutingEvaluationCase> = emptyList(),
)

data class SwarmPromotionPolicy(
    val minimumCases: Int = 3,
    val minimumDistinctTasks: Int = 3,
    val minimumObservationalSuccesses: Int = 3,
    val minimumSuccessfulReflections: Int = 2,
    val minimumMedianQualityDelta: Double = 0.05,
    val maximumRegressions: Int = 0,
    val maximumDistinctEnvironments: Int = 1,
) {
    init {
        require(minimumCases > 0)
        require(minimumDistinctTasks > 0)
        require(minimumObservationalSuccesses >= 0)
        require(minimumSuccessfulReflections >= 0)
        require(minimumMedianQualityDelta >= 0.0)
        require(maximumRegressions >= 0)
        require(maximumDistinctEnvironments > 0)
    }
}

data class SwarmPromotionAssessment(
    val eligible: Boolean,
    val reasons: List<String>,
    val evaluationIds: List<String>,
    val distinctTasks: Int,
    val distinctEnvironments: Int,
    val treatmentWins: Int,
    val regressions: Int,
    val medianQualityDelta: Double,
)

class SwarmEvolutionStore(
    private val file: File,
    private val maxFileBytes: Long = 16L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val evaluationsById = mutableMapOf<String, SwarmExperienceEvaluation>()
    private val candidatesById = mutableMapOf<String, SwarmSkillCandidate>()
    private val routingEvaluationCasesById = mutableMapOf<String, SwarmRoutingEvaluationCase>()
    private val _evaluations = MutableStateFlow<List<SwarmExperienceEvaluation>>(emptyList())
    private val _candidates = MutableStateFlow<List<SwarmSkillCandidate>>(emptyList())
    private val _routingEvaluationCases = MutableStateFlow<List<SwarmRoutingEvaluationCase>>(emptyList())
    val evaluations: StateFlow<List<SwarmExperienceEvaluation>> = _evaluations.asStateFlow()
    val candidates: StateFlow<List<SwarmSkillCandidate>> = _candidates.asStateFlow()
    val routingEvaluationCases: StateFlow<List<SwarmRoutingEvaluationCase>> =
        _routingEvaluationCases.asStateFlow()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            mutex.withLock {
                evaluationsById.clear()
                candidatesById.clear()
                routingEvaluationCasesById.clear()
                publishLocked()
            }
            return@withContext
        }
        val loaded = try {
            json.decodeFromString(SwarmEvolutionFile.serializer(), file.readBoundedUtf8(maxFileBytes))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val quarantined = try {
                file.quarantineCorruptFile()
            } catch (quarantineError: Exception) {
                quarantineError.addSuppressed(error)
                throw quarantineError
            }
            evolutionLog.warn { "Quarantined unreadable swarm evolution file to ${quarantined.name}: ${error.message}" }
            SwarmEvolutionFile()
        }
        mutex.withLock {
            evaluationsById.clear()
            candidatesById.clear()
            routingEvaluationCasesById.clear()
            loaded.evaluations.filter(SwarmExperienceEvaluation::isValid).forEach { evaluationsById[it.id] = it }
            loaded.candidates.filter(SwarmSkillCandidate::isValid).forEach { candidatesById[it.id] = it }
            loaded.routingEvaluationCases.filter(SwarmRoutingEvaluationCase::isValid)
                .forEach { routingEvaluationCasesById[it.id] = it }
            publishLocked()
        }
    }

    suspend fun recordEvaluation(evaluation: SwarmExperienceEvaluation): SwarmExperienceEvaluation = mutex.withLock {
        require(evaluation.isValid()) { "Invalid swarm experience evaluation" }
        val existing = evaluationsById[evaluation.id]
        require(existing == null || existing == evaluation) { "Swarm evaluation id already exists: ${evaluation.id}" }
        if (existing == evaluation) return@withLock evaluation
        val previous = evaluationsById.put(evaluation.id, evaluation)
        try {
            saveLocked()
            publishLocked()
            evaluation
        } catch (error: Throwable) {
            if (previous == null) evaluationsById.remove(evaluation.id) else evaluationsById[evaluation.id] = previous
            throw error
        }
    }

    internal suspend fun upsertCandidate(candidate: SwarmSkillCandidate): SwarmSkillCandidate = mutex.withLock {
        require(candidate.isValid()) { "Invalid swarm skill candidate" }
        val previous = candidatesById.put(candidate.id, candidate)
        try {
            saveLocked()
            publishLocked()
            candidate
        } catch (error: Throwable) {
            if (previous == null) candidatesById.remove(candidate.id) else candidatesById[candidate.id] = previous
            throw error
        }
    }

    suspend fun recordRoutingEvaluationCases(
        cases: List<SwarmRoutingEvaluationCase>,
    ): List<SwarmRoutingEvaluationCase> = mutex.withLock {
        require(cases.map(SwarmRoutingEvaluationCase::id).distinct().size == cases.size) {
            "Duplicate swarm routing evaluation case ids"
        }
        require(cases.all(SwarmRoutingEvaluationCase::isValid)) { "Invalid swarm routing evaluation case" }
        cases.forEach { case ->
            val existing = routingEvaluationCasesById[case.id]
            require(existing == null || existing == case) {
                "Swarm routing evaluation case id already exists: ${case.id}"
            }
        }
        val previous = cases.associate { case -> case.id to routingEvaluationCasesById[case.id] }
        cases.forEach { case -> routingEvaluationCasesById[case.id] = case }
        try {
            saveLocked()
            publishLocked()
            cases
        } catch (error: Throwable) {
            previous.forEach { (id, case) ->
                if (case == null) routingEvaluationCasesById.remove(id) else routingEvaluationCasesById[id] = case
            }
            throw error
        }
    }

    suspend fun candidateForExperience(experienceId: String): SwarmSkillCandidate? = mutex.withLock {
        candidatesById.values
            .filter { it.experienceId == experienceId }
            .maxByOrNull(SwarmSkillCandidate::updatedAt)
    }

    suspend fun evaluationsForExperience(experienceId: String): List<SwarmExperienceEvaluation> = mutex.withLock {
        evaluationsById.values
            .filter { it.experienceId == experienceId }
            .sortedBy(SwarmExperienceEvaluation::createdAt)
    }

    suspend fun assessPromotion(
        experience: SwarmExperience,
        policy: SwarmPromotionPolicy = SwarmPromotionPolicy(),
    ): SwarmPromotionAssessment = mutex.withLock {
        val relevant = evaluationsById.values
            .filter { it.experienceId == experience.id }
            .sortedBy(SwarmExperienceEvaluation::createdAt)
        val distinctTasks = relevant.map(SwarmExperienceEvaluation::taskFingerprint).distinct().size
        val distinctEnvironments = relevant.map(SwarmExperienceEvaluation::environmentFingerprint).distinct().size
        val wins = relevant.count { it.treatment.passed && !it.control.passed }
        val regressions = relevant.count {
            (!it.treatment.passed && it.control.passed) ||
                it.treatment.qualityScore + QUALITY_REGRESSION_TOLERANCE < it.control.qualityScore
        }
        val medianDelta = relevant.map { it.treatment.qualityScore - it.control.qualityScore }.median()
        val reasons = buildList {
            if (relevant.size < policy.minimumCases) add("Need at least ${policy.minimumCases} matched evaluations")
            if (distinctTasks < policy.minimumDistinctTasks) {
                add("Need at least ${policy.minimumDistinctTasks} distinct task fingerprints")
            }
            if (distinctEnvironments > policy.maximumDistinctEnvironments) {
                add("Evaluation environment fingerprints are not comparable")
            }
            if (experience.successfulUses + experience.recoveredUses < policy.minimumObservationalSuccesses) {
                add("Insufficient observational successful uses")
            }
            if (experience.successfulEvidence < policy.minimumSuccessfulReflections) {
                add("Insufficient successful reflection evidence")
            }
            if (wins < 1) add("Treatment has not produced a control-to-pass improvement")
            if (regressions > policy.maximumRegressions) add("Regression budget exceeded")
            if (medianDelta < policy.minimumMedianQualityDelta) add("Median quality improvement is too small")
        }
        SwarmPromotionAssessment(
            eligible = reasons.isEmpty(),
            reasons = reasons,
            evaluationIds = relevant.map(SwarmExperienceEvaluation::id),
            distinctTasks = distinctTasks,
            distinctEnvironments = distinctEnvironments,
            treatmentWins = wins,
            regressions = regressions,
            medianQualityDelta = medianDelta,
        )
    }

    private suspend fun saveLocked() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            SwarmEvolutionFile.serializer(),
            SwarmEvolutionFile(
                evaluations = evaluationsById.values.sortedBy(SwarmExperienceEvaluation::id),
                candidates = candidatesById.values.sortedBy(SwarmSkillCandidate::id),
                routingEvaluationCases = routingEvaluationCasesById.values.sortedBy(SwarmRoutingEvaluationCase::id),
            ),
        ).requireUtf8Size(maxFileBytes, "Swarm evolution data")
        file.atomicWriteText(content)
    }

    private fun publishLocked() {
        _evaluations.value = evaluationsById.values.sortedByDescending(SwarmExperienceEvaluation::createdAt)
        _candidates.value = candidatesById.values.sortedByDescending(SwarmSkillCandidate::updatedAt)
        _routingEvaluationCases.value = routingEvaluationCasesById.values.sortedWith(
            compareByDescending<SwarmRoutingEvaluationCase>(SwarmRoutingEvaluationCase::priority)
                .thenBy(SwarmRoutingEvaluationCase::id)
        )
    }
}

private fun SwarmExperienceEvaluation.isValid(): Boolean =
    id.matches(persistedIdPattern) &&
        experienceId.matches(persistedIdPattern) &&
        taskFingerprint.isNotBlank() &&
        environmentFingerprint.isNotBlank() &&
        control.isValid() &&
        treatment.isValid()

private fun com.swarmeditor.common.model.SwarmEvaluationMetrics.isValid(): Boolean =
    qualityScore in 0.0..1.0 && retries >= 0 && durationMillis >= 0

private fun SwarmSkillCandidate.isValid(): Boolean =
    id.matches(persistedIdPattern) &&
        experienceId.matches(persistedIdPattern) &&
        name.matches(skillNamePattern) &&
        description.isNotBlank() &&
        markdown.isNotBlank() &&
        evaluationIds.isNotEmpty()

private fun SwarmRoutingEvaluationCase.isValid(): Boolean =
    id.matches(persistedIdPattern) &&
        experienceId.matches(persistedIdPattern) &&
        repositoryRevision.matches(commitPattern) &&
        repositoryBaseRevision.matches(commitPattern) &&
        repositoryTreeHash.matches(commitPattern) &&
        sourceRunId?.matches(persistedIdPattern) != false &&
        sourceTaskId?.matches(persistedIdPattern) != false &&
        sourceAgentId?.matches(persistedIdPattern) != false &&
        sourceAttempt?.let { it >= 0 } != false &&
        verifierCommand.isNotEmpty() &&
        verifierCommand.none(String::isBlank) &&
        taskFingerprint.matches(fingerprintPattern) &&
        controlExperienceIds.all { it.matches(persistedIdPattern) } &&
        treatmentExperienceIds.all { it.matches(persistedIdPattern) } &&
        controlExperienceIds.distinct().size == controlExperienceIds.size &&
        treatmentExperienceIds.distinct().size == treatmentExperienceIds.size &&
        experienceId !in controlExperienceIds &&
        experienceId in treatmentExperienceIds &&
        status == if (blockers.isEmpty()) {
            SwarmRoutingEvaluationCaseStatus.READY_FOR_VARIANT_GENERATION
        } else {
            SwarmRoutingEvaluationCaseStatus.BLOCKED_PROVENANCE
        }

private fun List<Double>.median(): Double {
    if (isEmpty()) return 0.0
    val sorted = sorted()
    val middle = sorted.size / 2
    return if (sorted.size % 2 == 0) (sorted[middle - 1] + sorted[middle]) / 2.0 else sorted[middle]
}

private val persistedIdPattern = Regex("[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}")
private val skillNamePattern = Regex("[a-z0-9]+(?:-[a-z0-9]+)*")
private val commitPattern = Regex("[0-9a-fA-F]{40}")
private val fingerprintPattern = Regex("[0-9a-f]{64}")
private const val QUALITY_REGRESSION_TOLERANCE = 0.05
