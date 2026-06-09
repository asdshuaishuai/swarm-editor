package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.api.McpServerDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class McpViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _servers = MutableStateFlow<List<McpServerDto>>(emptyList())
    val servers: StateFlow<List<McpServerDto>> = _servers

    fun load() {
        scope.launch { _servers.value = ApiClient.getMcpServers() }
    }
}
