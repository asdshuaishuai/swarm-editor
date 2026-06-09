package com.swarmeditor.backend.session

import com.swarmeditor.common.model.*
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.datetime.Instant
import java.time.Instant as JavaInstant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID as JavaUUID

private val log = KotlinLogging.logger {}

@Serializable
private data class SessionFile(
    val id: String, val agentId: String, val title: String = "",
    val createdAt: String, val updatedAt: String,
    val messages: List<MessageFile> = emptyList(), val status: String = "active"
)

@Serializable
private data class MessageFile(
    val id: String, val role: String,
    val content: List<ContentBlockFile>, val createdAt: String
)

@Serializable
private data class ContentBlockFile(val type: String = "text", val text: String = "")

class SessionStore(private val dataDir: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val sessions = mutableMapOf<String, Session>()

    init { dataDir.mkdirs() }

    suspend fun load() = withContext(Dispatchers.IO) {
        dataDir.listFiles()?.filter { it.extension == "json" }?.forEach { file ->
            try {
                val sf = json.decodeFromString(SessionFile.serializer(), file.readText())
                sessions[sf.id] = sf.toSession()
            } catch (e: Exception) { log.warn { "Failed to load session ${file.name}: ${e.message}" } }
        }
        log.info { "Loaded ${sessions.size} sessions" }
    }

    suspend fun create(agentId: String, title: String): Session = mutex.withLock {
        val now = Instant.parse(JavaInstant.now().toString())
        val session = Session(id = JavaUUID.randomUUID().toString().take(8), agentId = agentId, createdAt = now, updatedAt = now, status = SessionStatus.ACTIVE)
        sessions[session.id] = session
        saveToFile(session)
        session
    }

    suspend fun get(id: String): Session? = mutex.withLock { sessions[id] }
    suspend fun getAll(): List<Session> = mutex.withLock { sessions.values.sortedByDescending { it.updatedAt } }

    suspend fun addMessage(sessionId: String, role: MessageRole, text: String): Message? = mutex.withLock {
        val session = sessions[sessionId] ?: return@withLock null
        val now = Instant.parse(JavaInstant.now().toString())
        val message = Message(id = JavaUUID.randomUUID().toString().take(8), role = role, content = listOf(ContentBlock(type = "text", text = text)), createdAt = now)
        val updated = session.copy(messages = session.messages + message, updatedAt = now)
        sessions[sessionId] = updated
        saveToFile(updated)
        message
    }

    suspend fun close(id: String) = mutex.withLock {
        sessions[id]?.let { s -> val u = s.copy(status = SessionStatus.CLOSED, updatedAt = Instant.parse(JavaInstant.now().toString())); sessions[id] = u; saveToFile(u) }
    }

    private suspend fun saveToFile(session: Session) = withContext(Dispatchers.IO) {
        try { File(dataDir, "${session.id}.json").writeText(json.encodeToString(SessionFile.serializer(), session.toFile())) }
        catch (e: Exception) { log.error { "Failed to save session ${session.id}: ${e.message}" } }
    }
}

private fun SessionFile.toSession() = Session(id = id, agentId = agentId, createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
    messages = messages.map { Message(it.id, when(it.role){"user"->MessageRole.USER;"assistant"->MessageRole.ASSISTANT;else->MessageRole.SYSTEM}, it.content.map{c->ContentBlock(c.type,c.text)}, Instant.parse(it.createdAt)) },
    status = when(status){"closed"->SessionStatus.CLOSED;"archived"->SessionStatus.ARCHIVED;else->SessionStatus.ACTIVE})

private fun Session.toFile() = SessionFile(id = id, agentId = agentId, createdAt = createdAt.toString(), updatedAt = updatedAt.toString(),
    messages = messages.map { MessageFile(it.id, it.role.name.lowercase(), it.content.map{c->ContentBlockFile(c.type,c.text)}, it.createdAt.toString()) }, status = status.name.lowercase())
