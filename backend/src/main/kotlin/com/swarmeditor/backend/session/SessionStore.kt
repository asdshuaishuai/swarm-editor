package com.swarmeditor.backend.session

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.common.model.*
import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.isSafePersistedId
import com.swarmeditor.backend.storage.persistedJsonFile
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.util.UUID as JavaUUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private val log = KotlinLogging.logger {}

@Serializable
private data class SessionFile(
    val id: String, val agentId: String, val title: String = "",
    val createdAt: String, val updatedAt: String,
    val messages: List<MessageFile> = emptyList(), val status: String = "active",
    val remoteSessionId: String? = null,
    val tokenUsage: TokenUsage = TokenUsage(),
    val workspaceId: String? = null,
    val cwd: String? = null,
)

@Serializable
private data class MessageFile(
    val id: String, val role: String,
    val content: List<ContentBlock>, val createdAt: String
)

@OptIn(ExperimentalTime::class)
class SessionStore(
    private val dataDir: File,
    private val maxFileBytes: Long = 128L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val sessions = mutableMapOf<String, Session>()

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
        dataDir.mkdirs()
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        val loaded = dataDir.listFiles()
            ?.filter { it.isFile && it.extension == "json" }
            ?.mapNotNull { file ->
                val decoded = try {
                    val sf = json.decodeFromString(SessionFile.serializer(), file.readBoundedUtf8(maxFileBytes))
                    require(sf.id.isSafePersistedId() && sf.id == file.nameWithoutExtension) {
                        "Unsafe or mismatched session id"
                    }
                    val normalized = if (sf.agentId == AgentRegistry.DEFAULT_AGENT_ID) {
                        sf
                    } else {
                        sf.copy(agentId = AgentRegistry.DEFAULT_AGENT_ID)
                    }
                    Triple(sf, normalized, normalized.toSession())
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
                        "Quarantined unreadable session ${file.name} to ${quarantined.name}: ${error.message}"
                    }
                    return@mapNotNull null
                }
                val (original, normalized, session) = decoded
                if (normalized !== original) {
                    try {
                        val content = json.encodeToString(SessionFile.serializer(), normalized)
                            .requireUtf8Size(maxFileBytes, "Session data")
                        file.atomicWriteText(content)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        log.warn { "Failed to persist migrated session ${file.name}: ${error.message}" }
                    }
                }
                normalized.id to session
            }
            .orEmpty()
        mutex.withLock {
            sessions.clear()
            loaded.forEach { (id, session) -> sessions[id] = session }
        }
        log.info { "Loaded ${sessions.size} sessions" }
    }

    suspend fun create(agentId: String, title: String, workspaceId: String? = null, cwd: String? = null): Session = mutex.withLock {
        require(agentId == AgentRegistry.DEFAULT_AGENT_ID) { "会话只能使用内置 Pi Agent" }
        val now = Clock.System.now()
        val session = Session(
            id = JavaUUID.randomUUID().toString().take(8),
            agentId = agentId,
            title = title,
            createdAt = now,
            updatedAt = now,
            status = SessionStatus.ACTIVE,
            workspaceId = workspaceId,
            cwd = cwd,
        )
        sessions[session.id] = session
        try {
            saveToFile(session)
        } catch (error: Throwable) {
            sessions.remove(session.id)
            throw error
        }
        session
    }

    suspend fun get(id: String): Session? = mutex.withLock { sessions[id] }
    suspend fun getAll(): List<Session> = mutex.withLock { sessions.values.sortedByDescending { it.updatedAt } }

    suspend fun addMessage(sessionId: String, role: MessageRole, content: List<ContentBlock>): Message? = mutex.withLock {
        val session = sessions[sessionId] ?: return@withLock null
        val now = Clock.System.now()
        val message = Message(id = JavaUUID.randomUUID().toString().take(8), role = role, content = content, createdAt = now)
        val updated = session.copy(messages = session.messages + message, updatedAt = now)
        sessions[sessionId] = updated
        try {
            saveToFile(updated)
        } catch (error: Throwable) {
            sessions[sessionId] = session
            throw error
        }
        message
    }

    suspend fun associateRemoteSession(id: String, remoteSessionId: String) = mutex.withLock {
        val session = sessions[id] ?: return@withLock
        val updated = session.copy(
            remoteSessionId = remoteSessionId,
            updatedAt = Clock.System.now()
        )
        sessions[id] = updated
        try {
            saveToFile(updated)
        } catch (error: Throwable) {
            sessions[id] = session
            throw error
        }
    }

    suspend fun applyRemoteBranch(
        id: String,
        remoteSessionId: String,
        messages: List<Message>,
    ): Pair<Session, Session> = mutex.withLock {
        applyRemoteBranchLocked(id, remoteSessionId, messages)
    }

    suspend fun reconcileRemoteSession(
        id: String,
        remoteSessionId: String,
        messages: List<Message>,
    ): Pair<Session, Session?> = mutex.withLock {
        val original = sessions[id] ?: error("Session not found: $id")
        if (original.remoteSessionId != remoteSessionId) {
            return@withLock applyRemoteBranchLocked(id, remoteSessionId, messages)
        }
        if (original.messages == messages) return@withLock original to null

        val synchronized = original.copy(messages = messages, updatedAt = Clock.System.now())
        sessions[id] = synchronized
        try {
            saveToFile(synchronized)
        } catch (error: Throwable) {
            sessions[id] = original
            throw error
        }
        synchronized to null
    }

    private suspend fun applyRemoteBranchLocked(
        id: String,
        remoteSessionId: String,
        messages: List<Message>,
    ): Pair<Session, Session> {
        val original = sessions[id] ?: error("Session not found: $id")
        val now = Clock.System.now()
        var backupId: String
        do {
            backupId = JavaUUID.randomUUID().toString().take(8)
        } while (sessions.containsKey(backupId))
        val backup = original.copy(
            id = backupId,
            title = "${original.title.ifBlank { "Session" }} · 原分支",
            updatedAt = now,
        )
        val branched = original.copy(
            remoteSessionId = remoteSessionId,
            messages = messages,
            updatedAt = now,
        )
        sessions[backup.id] = backup
        sessions[id] = branched
        try {
            saveToFile(backup)
            saveToFile(branched)
        } catch (error: Throwable) {
            sessions.remove(backup.id)
            sessions[id] = original
            withContext(Dispatchers.IO) { dataDir.persistedJsonFile(backup.id).delete() }
            throw error
        }
        return branched to backup
    }

    suspend fun updateTokenUsage(id: String, tokenUsage: TokenUsage) = mutex.withLock {
        val session = sessions[id] ?: return@withLock
        val updated = session.copy(tokenUsage = tokenUsage, updatedAt = Clock.System.now())
        sessions[id] = updated
        try {
            saveToFile(updated)
        } catch (error: Throwable) {
            sessions[id] = session
            throw error
        }
    }

    suspend fun close(id: String) = mutex.withLock {
        sessions[id]?.let { session ->
            val updated = session.copy(status = SessionStatus.CLOSED, updatedAt = Clock.System.now())
            sessions[id] = updated
            try {
                saveToFile(updated)
            } catch (error: Throwable) {
                sessions[id] = session
                throw error
            }
        }
    }

    suspend fun rename(id: String, title: String) = mutex.withLock {
        sessions[id]?.let { session ->
            val updated = session.copy(title = title.trim().ifBlank { session.title }, updatedAt = Clock.System.now())
            sessions[id] = updated
            try {
                saveToFile(updated)
            } catch (error: Throwable) {
                sessions[id] = session
                throw error
            }
        }
    }

    /** 归档会话：将其从常规列表隐藏，保留数据与消息。 */
    suspend fun archive(id: String) = mutex.withLock {
        setStatus(id, SessionStatus.ARCHIVED)
    }

    /** 将归档会话恢复到活动的会话列表。 */
    suspend fun unarchive(id: String) = mutex.withLock {
        sessions[id]?.let { session ->
            val restored = session.copy(status = SessionStatus.ACTIVE, updatedAt = Clock.System.now())
            sessions[id] = restored
            try {
                saveToFile(restored)
            } catch (error: Throwable) {
                sessions[id] = session
                throw error
            }
        }
    }

    /** 永久删除会话文件与内存记录。 */
    suspend fun delete(id: String) = mutex.withLock {
        val session = sessions.remove(id) ?: return@withLock
        try {
            withContext(Dispatchers.IO) {
                val target = dataDir.persistedJsonFile(id)
                if (target.isFile && !target.delete()) {
                    throw IllegalStateException("无法删除会话文件: ${target.path}")
                }
            }
        } catch (error: Throwable) {
            sessions[id] = session
            throw error
        }
    }

    private suspend fun setStatus(id: String, status: SessionStatus) {
        sessions[id]?.let { session ->
            val updated = session.copy(status = status, updatedAt = Clock.System.now())
            sessions[id] = updated
            try {
                saveToFile(updated)
            } catch (error: Throwable) {
                sessions[id] = session
                throw error
            }
        }
    }

    private suspend fun saveToFile(session: Session) = withContext(Dispatchers.IO) {
        try {
            val content = json.encodeToString(SessionFile.serializer(), session.toFile())
                .requireUtf8Size(maxFileBytes, "Session data")
            dataDir.persistedJsonFile(session.id).atomicWriteText(content)
        } catch (error: Throwable) {
            log.error { "Failed to save session ${session.id}: ${error.message}" }
            throw error
        }
    }
}

private fun SessionFile.toSession() = Session(id = id, agentId = agentId, title = title, createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
    messages = messages.map { Message(it.id, when(it.role){"user"->MessageRole.USER;"assistant"->MessageRole.ASSISTANT;else->MessageRole.SYSTEM}, it.content, Instant.parse(it.createdAt)) },
    status = when(status){"closed"->SessionStatus.CLOSED;"archived"->SessionStatus.ARCHIVED;else->SessionStatus.ACTIVE},
    remoteSessionId = remoteSessionId,
    tokenUsage = tokenUsage,
    workspaceId = workspaceId,
    cwd = cwd)

private fun Session.toFile() = SessionFile(id = id, agentId = agentId, title = title, createdAt = createdAt.toString(), updatedAt = updatedAt.toString(),
    messages = messages.map { MessageFile(it.id, it.role.name.lowercase(), it.content, it.createdAt.toString()) }, status = status.name.lowercase(),
    remoteSessionId = remoteSessionId, tokenUsage = tokenUsage, workspaceId = workspaceId, cwd = cwd)
