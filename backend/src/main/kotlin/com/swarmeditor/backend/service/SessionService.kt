package com.swarmeditor.backend.service

import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.Session
import com.swarmeditor.common.model.Message
import com.swarmeditor.common.model.TokenUsage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SessionService(private val store: SessionStore) {
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions.asStateFlow()

    suspend fun init() { store.load(); refresh() }
    suspend fun create(agentId: String, title: String): Session { val s = store.create(agentId, title); refresh(); return s }
    suspend fun get(id: String) = store.get(id)
    suspend fun getAll() = store.getAll()
    suspend fun addMessage(sessionId: String, role: MessageRole, text: String) =
        addMessage(sessionId, role, listOf(ContentBlock(type = "text", text = text)))
    suspend fun addMessage(sessionId: String, role: MessageRole, content: List<ContentBlock>) =
        store.addMessage(sessionId, role, content).also { refresh() }
    suspend fun close(id: String) { store.close(id); refresh() }
    suspend fun associateRemoteSession(sessionId: String, remoteSessionId: String) {
        store.associateRemoteSession(sessionId, remoteSessionId)
        refresh()
    }
    suspend fun applyRemoteBranch(
        sessionId: String,
        remoteSessionId: String,
        messages: List<Message>,
    ): Pair<Session, Session> = store.applyRemoteBranch(sessionId, remoteSessionId, messages).also { refresh() }
    suspend fun reconcileRemoteSession(
        sessionId: String,
        remoteSessionId: String,
        messages: List<Message>,
    ): Pair<Session, Session?> = store.reconcileRemoteSession(sessionId, remoteSessionId, messages).also { refresh() }
    suspend fun updateTokenUsage(sessionId: String, tokenUsage: TokenUsage) {
        store.updateTokenUsage(sessionId, tokenUsage)
        refresh()
    }
    private suspend fun refresh() { _sessions.value = store.getAll() }
}
