package com.swarmeditor.backend.service

import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.common.model.McpServerConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class McpService(private val store: McpStore) {
    private val _servers = MutableStateFlow<List<McpServerConfig>>(emptyList())
    val servers: StateFlow<List<McpServerConfig>> = _servers

    suspend fun init() { store.load(); refresh() }
    suspend fun getAll() = store.getAll()
    suspend fun upsert(config: McpServerConfig) { store.upsert(config); refresh() }
    suspend fun delete(id: String) { store.delete(id); refresh() }
    private suspend fun refresh() { _servers.value = store.getAll() }
}
