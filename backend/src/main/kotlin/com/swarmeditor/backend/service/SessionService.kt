package com.swarmeditor.backend.service

import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class SessionService(private val store: SessionStore) {
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions

    suspend fun init() { store.load(); refresh() }
    suspend fun create(agentId: String, title: String): Session { val s = store.create(agentId, title); refresh(); return s }
    suspend fun get(id: String) = store.get(id)
    suspend fun getAll() = store.getAll()
    suspend fun addMessage(sessionId: String, role: MessageRole, text: String) = store.addMessage(sessionId, role, text).also { refresh() }
    suspend fun close(id: String) { store.close(id); refresh() }
    private suspend fun refresh() { _sessions.value = store.getAll() }
}
