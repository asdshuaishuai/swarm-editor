package com.swarmeditor.backend.activity

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Session
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

private val log = KotlinLogging.logger {}

@Serializable
private data class ActivityFile(val events: List<ActivityEvent> = emptyList())

class ActivityStore(
    private val file: File,
    private val maxEvents: Int = 2_000,
    private val maxFileBytes: Long = 16L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val _events = MutableStateFlow<List<ActivityEvent>>(emptyList())

    val events: StateFlow<List<ActivityEvent>> = _events.asStateFlow()

    init {
        require(maxEvents > 0) { "maxEvents must be positive" }
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        val persisted: List<ActivityEvent>? = try {
            if (!file.exists()) {
                emptyList()
            } else {
                require(file.isFile) { "Activity path is not a regular file: ${file.path}" }
                json.decodeFromString(
                    ActivityFile.serializer(),
                    file.readBoundedUtf8(maxFileBytes),
                ).events
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val quarantined = try {
                file.quarantineCorruptFile()
            } catch (quarantineError: Throwable) {
                quarantineError.addSuppressed(error)
                throw quarantineError
            }
            log.warn {
                "Quarantined unreadable activities from ${file.path} to ${quarantined.path}: ${error.message}"
            }
            null
        }
        if (persisted == null) return@withContext
        val loaded = persisted.takeLast(maxEvents)
        if (loaded.size != persisted.size) persist(loaded)
        mutex.withLock { _events.value = loaded }
    }

    suspend fun append(event: ActivityEvent) = mutex.withLock {
        val previous = _events.value
        val updated = (previous + event).takeLast(maxEvents)
        _events.value = updated
        try {
            persist(updated)
        } catch (error: Throwable) {
            _events.value = previous
            throw error
        }
    }

    suspend fun seedFromSessions(sessions: List<Session>) = mutex.withLock {
        if (_events.value.isNotEmpty()) return@withLock
        val seeded = sessions.asSequence()
            .flatMap { session ->
                session.messages.asSequence().map { message ->
                    val imageCount = message.content.count { it.image != null }
                    val detail = buildString {
                        append(message.content.joinToString(" ") { it.text }.trim().take(120))
                        if (imageCount > 0) {
                            if (isNotEmpty()) append(" · ")
                            append("$imageCount 张图片")
                        }
                    }
                    ActivityEvent(
                        id = "legacy-${session.id}-${message.id}",
                        sessionId = session.id,
                        timestamp = message.createdAt,
                        actor = when (message.role) {
                            MessageRole.USER -> "用户"
                            MessageRole.ASSISTANT -> "Pi"
                            MessageRole.SYSTEM -> "系统"
                        },
                        action = when (message.role) {
                            MessageRole.USER -> "发送"
                            MessageRole.ASSISTANT -> "回复"
                            MessageRole.SYSTEM -> "系统消息"
                        },
                        detail = detail,
                        type = ActivityType.MESSAGE,
                    )
                }
            }
            .sortedBy(ActivityEvent::timestamp)
            .toList()
            .takeLast(maxEvents)
        if (seeded.isEmpty()) return@withLock
        persist(seeded)
        _events.value = seeded
    }

    private suspend fun persist(events: List<ActivityEvent>) = withContext(Dispatchers.IO) {
        val content = json.encodeToString(ActivityFile.serializer(), ActivityFile(events))
        file.atomicWriteText(content.requireUtf8Size(maxFileBytes, "Activity data"))
    }
}
