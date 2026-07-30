package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.isSafePersistedId
import com.swarmeditor.backend.storage.persistedJsonFile
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireSafePersistedId
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
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
import kotlinx.serialization.json.Json

private val log = KotlinLogging.logger {}

class SwarmStore(
    private val dataDirectory: File,
    private val maxFileBytes: Long = 32L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val runsById = mutableMapOf<String, SwarmRun>()
    private val _runs = MutableStateFlow<List<SwarmRun>>(emptyList())
    val runs: StateFlow<List<SwarmRun>> = _runs.asStateFlow()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
        dataDirectory.mkdirs()
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        val loaded = dataDirectory.listFiles()
            ?.filter { it.isFile && it.extension == "json" }
            ?.mapNotNull { file ->
                val decoded = try {
                    val run = json.decodeFromString(SwarmRun.serializer(), file.readBoundedUtf8(maxFileBytes))
                    require(run.id.isSafePersistedId() && run.id == file.nameWithoutExtension) {
                        "Unsafe or mismatched swarm run id"
                    }
                    run
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    val quarantined = try {
                        file.quarantineCorruptFile()
                    } catch (quarantineError: Exception) {
                        quarantineError.addSuppressed(error)
                        throw quarantineError
                    }
                    log.warn {
                        "Quarantined unreadable swarm run ${file.name} to ${quarantined.name}: ${error.message}"
                    }
                    return@mapNotNull null
                }
                val recovered = decoded.recoverInterruptedRun()
                if (recovered != decoded) {
                    try {
                        write(recovered)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Throwable) {
                        log.warn { "Failed to persist recovered swarm run ${file.name}: ${error.message}" }
                    }
                }
                recovered
            }
            .orEmpty()
        mutex.withLock {
            runsById.clear()
            loaded.forEach { runsById[it.id] = it }
            publishLocked()
        }
    }

    suspend fun get(runId: String): SwarmRun? = mutex.withLock { runsById[runId] }

    suspend fun put(run: SwarmRun): SwarmRun = mutex.withLock {
        requireSafePersistedId(run.id)
        val previous = runsById.put(run.id, run)
        try {
            save(run)
            publishLocked()
            run
        } catch (error: Throwable) {
            if (previous == null) runsById.remove(run.id) else runsById[run.id] = previous
            throw error
        }
    }

    suspend fun update(runId: String, transform: (SwarmRun) -> SwarmRun): SwarmRun = mutex.withLock {
        val previous = checkNotNull(runsById[runId]) { "Swarm run not found: $runId" }
        val updated = transform(previous)
        require(updated.id == previous.id) { "Swarm run id cannot change" }
        runsById[runId] = updated
        try {
            save(updated)
            publishLocked()
            updated
        } catch (error: Throwable) {
            runsById[runId] = previous
            throw error
        }
    }

    private suspend fun save(run: SwarmRun) = withContext(Dispatchers.IO) {
        write(run)
    }

    private fun write(run: SwarmRun) {
        val content = json.encodeToString(SwarmRun.serializer(), run)
            .requireUtf8Size(maxFileBytes, "Swarm run data")
        dataDirectory.persistedJsonFile(run.id).atomicWriteText(content)
    }

    private fun publishLocked() {
        _runs.value = runsById.values.sortedByDescending { it.updatedAt }
    }

    private fun SwarmRun.recoverInterruptedRun(): SwarmRun {
        if (status != SwarmRunStatus.RUNNING) return this
        return copy(
            status = SwarmRunStatus.FAILED,
            tasks = tasks.map { task ->
                if (task.status == SwarmTaskStatus.RUNNING) {
                    val activeAttemptIndex = task.attemptRecords.indexOfLast { attempt ->
                        attempt.outcome == SwarmTaskAttemptOutcome.RUNNING
                    }
                    task.copy(
                        status = SwarmTaskStatus.FAILED,
                        errorMessage = "Swarm task was interrupted by application shutdown",
                        attemptRecords = task.attemptRecords.mapIndexed { index, attempt ->
                            if (index == activeAttemptIndex) {
                                attempt.copy(
                                    outcome = SwarmTaskAttemptOutcome.FAILED,
                                    completedAt = updatedAt,
                                    durationMillis = (
                                        updatedAt.toEpochMilliseconds() - attempt.startedAt.toEpochMilliseconds()
                                        ).coerceAtLeast(0),
                                    errorCategory = "InterruptedByShutdown",
                                )
                            } else {
                                attempt
                            }
                        },
                        completedAt = updatedAt,
                    )
                } else {
                    task
                }
            },
        )
    }
}
