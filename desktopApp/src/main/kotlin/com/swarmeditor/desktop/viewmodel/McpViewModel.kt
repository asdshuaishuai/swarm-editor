package com.swarmeditor.desktop.viewmodel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class McpViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _servers = MutableStateFlow<List<com.swarmeditor.desktop.api.McpServerDto>>(emptyList())
    val servers: StateFlow<List<com.swarmeditor.desktop.api.McpServerDto>> = _servers

    fun load() {
        scope.launch { _servers.value = demoMcpServers }
    }
}
