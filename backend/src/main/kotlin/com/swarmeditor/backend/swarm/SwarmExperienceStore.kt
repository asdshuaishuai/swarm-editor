package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperience
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTaskStatus
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
import kotlin.time.Instant

private val experienceLog = KotlinLogging.logger {}

internal enum class SwarmExperienceEvidence {
    SUCCESS,
    FAILURE,
}

internal data class SwarmExperienceInsight(
    val id: String,
    val principle: String,
    val rationale: String,
    val kind: SwarmExperienceKind,
    val role: SwarmAgentRole?,
    val tags: List<String>,
    val evidence: SwarmExperienceEvidence,
)

internal data class SwarmExperienceMatch(
    val experience: SwarmExperience,
    val relevanceScore: Int,
)

@Serializable
private data class SwarmExperienceFile(val experiences: List<SwarmExperience> = emptyList())

class SwarmExperienceStore(
    private val file: File,
    private val maxFileBytes: Long = 8L * 1024 * 1024,
    private val maxExperiences: Int = 256,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val experiencesById = mutableMapOf<String, SwarmExperience>()
    private val _experiences = MutableStateFlow<List<SwarmExperience>>(emptyList())
    val experiences: StateFlow<List<SwarmExperience>> = _experiences.asStateFlow()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
        require(maxExperiences > 0) { "maxExperiences must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            mutex.withLock {
                experiencesById.clear()
                publishLocked()
            }
            return@withContext
        }
        val loaded = try {
            json.decodeFromString(SwarmExperienceFile.serializer(), file.readBoundedUtf8(maxFileBytes)).experiences
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val quarantined = try {
                file.quarantineCorruptFile()
            } catch (quarantineError: Exception) {
                quarantineError.addSuppressed(error)
                throw quarantineError
            }
            experienceLog.warn {
                "Quarantined unreadable swarm experience file to ${quarantined.name}: ${error.message}"
            }
            emptyList()
        }
        mutex.withLock {
            experiencesById.clear()
            loaded.filter(SwarmExperience::isValid).forEach { experiencesById[it.id] = it }
            publishLocked()
        }
    }

    internal suspend fun applyInsights(
        runId: String,
        insights: List<SwarmExperienceInsight>,
        timestamp: Instant,
    ): List<SwarmExperience> = mutex.withLock {
        if (insights.isEmpty()) return@withLock _experiences.value
        val previous = experiencesById.toMap()
        insights.forEach { insight ->
            require(insight.id.matches(experienceIdPattern)) { "Invalid swarm experience id: ${insight.id}" }
            require(insight.principle.isNotBlank()) { "Swarm experience principle cannot be blank" }
            require(insight.rationale.isNotBlank()) { "Swarm experience rationale cannot be blank" }
            val current = experiencesById[insight.id]
            experiencesById[insight.id] = SwarmExperience(
                id = insight.id,
                principle = insight.principle.trim().take(MAX_PRINCIPLE_LENGTH),
                rationale = insight.rationale.trim().take(MAX_RATIONALE_LENGTH),
                kind = insight.kind,
                role = insight.role,
                tags = ((current?.tags.orEmpty()) + insight.tags)
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct()
                    .take(MAX_TAGS),
                successfulEvidence = current.orZero(SwarmExperience::successfulEvidence) +
                    if (insight.evidence == SwarmExperienceEvidence.SUCCESS) 1 else 0,
                failedEvidence = current.orZero(SwarmExperience::failedEvidence) +
                    if (insight.evidence == SwarmExperienceEvidence.FAILURE) 1 else 0,
                successfulUses = current.orZero(SwarmExperience::successfulUses),
                recoveredUses = current.orZero(SwarmExperience::recoveredUses),
                failedUses = current.orZero(SwarmExperience::failedUses),
                evaluatedTaskKeys = current?.evaluatedTaskKeys.orEmpty(),
                sourceRunIds = (current?.sourceRunIds.orEmpty() + runId).distinct().takeLast(MAX_SOURCE_RUNS),
                createdAt = current?.createdAt ?: timestamp,
                updatedAt = timestamp,
            )
        }
        pruneLocked()
        try {
            saveLocked()
            publishLocked()
            _experiences.value
        } catch (error: Throwable) {
            experiencesById.clear()
            experiencesById.putAll(previous)
            throw error
        }
    }

    internal suspend fun recordUsage(run: SwarmRun, timestamp: Instant = run.updatedAt): List<SwarmExperience> =
        mutex.withLock {
            val previous = experiencesById.toMap()
            var changed = false
            run.tasks.forEach { task ->
                val outcome = when {
                    task.status == SwarmTaskStatus.SUCCEEDED && task.attempt <= 1 -> UsageOutcome.SUCCESS
                    task.status == SwarmTaskStatus.SUCCEEDED -> UsageOutcome.RECOVERED
                    task.status == SwarmTaskStatus.FAILED -> UsageOutcome.FAILURE
                    else -> null
                } ?: return@forEach
                val taskKey = "${run.id}:${task.id}"
                task.experienceIds.distinct().forEach { experienceId ->
                    val current = experiencesById[experienceId] ?: return@forEach
                    if (taskKey in current.evaluatedTaskKeys) return@forEach
                    experiencesById[experienceId] = current.copy(
                        successfulUses = current.successfulUses + if (outcome == UsageOutcome.SUCCESS) 1 else 0,
                        recoveredUses = current.recoveredUses + if (outcome == UsageOutcome.RECOVERED) 1 else 0,
                        failedUses = current.failedUses + if (outcome == UsageOutcome.FAILURE) 1 else 0,
                        evaluatedTaskKeys = (current.evaluatedTaskKeys + taskKey)
                            .distinct()
                            .takeLast(MAX_EVALUATED_TASKS),
                        sourceRunIds = (current.sourceRunIds + run.id).distinct().takeLast(MAX_SOURCE_RUNS),
                        updatedAt = timestamp,
                    )
                    changed = true
                }
            }
            if (!changed) return@withLock _experiences.value
            try {
                saveLocked()
                publishLocked()
                _experiences.value
            } catch (error: Throwable) {
                experiencesById.clear()
                experiencesById.putAll(previous)
                throw error
            }
        }

    suspend fun findRelevant(
        query: String,
        role: SwarmAgentRole? = null,
        limit: Int = 6,
    ): List<SwarmExperience> = findRelevantMatches(query, role, limit).map(SwarmExperienceMatch::experience)

    internal suspend fun findRelevantMatches(
        query: String,
        role: SwarmAgentRole? = null,
        limit: Int = 6,
    ): List<SwarmExperienceMatch> = mutex.withLock {
        require(limit > 0) { "limit must be positive" }
        val queryTerms = tokenize(query)
        experiencesById.values
            .mapNotNull { experience ->
                val overlap = queryTerms.intersect(experience.searchTerms()).size
                val roleScore = when {
                    role == null -> 0
                    experience.role == role -> 30
                    experience.role == null -> 5
                    else -> 0
                }
                if (overlap == 0 && roleScore == 0) return@mapNotNull null
                val evidence = (experience.successfulEvidence + experience.failedEvidence).coerceAtMost(20)
                SwarmExperienceMatch(experience, overlap * 100 + roleScore + evidence)
            }
            .sortedWith(compareByDescending<SwarmExperienceMatch>(SwarmExperienceMatch::relevanceScore)
                .thenByDescending { it.experience.updatedAt })
            .take(limit)
    }

    suspend fun get(experienceId: String): SwarmExperience? = mutex.withLock { experiencesById[experienceId] }

    private suspend fun saveLocked() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            SwarmExperienceFile.serializer(),
            SwarmExperienceFile(experiencesById.values.sortedBy(SwarmExperience::id)),
        ).requireUtf8Size(maxFileBytes, "Swarm experience data")
        file.atomicWriteText(content)
    }

    private fun pruneLocked() {
        if (experiencesById.size <= maxExperiences) return
        val retained = experiencesById.values
            .sortedWith(compareByDescending<SwarmExperience> {
                it.successfulEvidence + it.failedEvidence
            }.thenByDescending(SwarmExperience::updatedAt))
            .take(maxExperiences)
        experiencesById.clear()
        retained.forEach { experiencesById[it.id] = it }
    }

    private fun publishLocked() {
        _experiences.value = experiencesById.values.sortedByDescending(SwarmExperience::updatedAt)
    }
}

private fun SwarmExperience.isValid(): Boolean =
    id.matches(experienceIdPattern) && principle.isNotBlank() && rationale.isNotBlank()

private fun SwarmExperience.searchTerms(): Set<String> =
    tokenize(listOf(principle, rationale, tags.joinToString(" ")).joinToString(" "))

private fun tokenize(value: String): Set<String> = tokenPattern.findAll(value.lowercase())
    .map(MatchResult::value)
    .filter { it.length >= 2 }
    .toSet()

private fun SwarmExperience?.orZero(selector: (SwarmExperience) -> Int): Int = this?.let(selector) ?: 0

private val experienceIdPattern = Regex("[a-z0-9][a-z0-9_-]{2,63}")
private val tokenPattern = Regex("[\\p{L}\\p{N}_-]+")
private const val MAX_PRINCIPLE_LENGTH = 800
private const val MAX_RATIONALE_LENGTH = 2_400
private const val MAX_TAGS = 16
private const val MAX_SOURCE_RUNS = 12
private const val MAX_EVALUATED_TASKS = 64

private enum class UsageOutcome {
    SUCCESS,
    RECOVERED,
    FAILURE,
}
