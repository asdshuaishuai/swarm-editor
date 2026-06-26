package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

@androidx.compose.runtime.Immutable
data class AgentConfigField(val label: String, val value: String, val isPassword: Boolean = false, val isSelect: Boolean = false, val options: List<String> = emptyList())

class SettingsViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _selectedAgentId = MutableStateFlow("claude-code")
    val selectedAgentId: StateFlow<String> = _selectedAgentId
    private val _configFields = MutableStateFlow<List<AgentConfigField>>(emptyList())
    val configFields: StateFlow<List<AgentConfigField>> = _configFields
    private val _configPath = MutableStateFlow("")
    val configPath: StateFlow<String> = _configPath
    private val _mcpServers = MutableStateFlow<List<McpServerDto>>(emptyList())
    val mcpServers: StateFlow<List<McpServerDto>> = _mcpServers
    private val _skills = MutableStateFlow<List<SkillDto>>(emptyList())
    val skills: StateFlow<List<SkillDto>> = _skills

    init { selectAgent("claude-code"); loadMcp(); loadSkills() }

    fun selectAgent(id: String) {
        _selectedAgentId.value = id
        scope.launch {
            val resp = ApiClient.getAgentConfig(id)
            _configPath.value = resp.configPath
            _configFields.value = resp.fields.map { (k, v) ->
                AgentConfigField(k, v, isPassword = k.lowercase().contains("key") || k.lowercase().contains("token"))
            }
        }
    }

    fun saveField(key: String, value: String) {
        scope.launch { ApiClient.updateAgentConfig(_selectedAgentId.value, key, value) }
    }

    fun loadMcp() { scope.launch { _mcpServers.value = ApiClient.getMcpServers() } }
    fun loadSkills() { scope.launch { _skills.value = ApiClient.getSkills() } }
    fun scanSkills() { scope.launch { _skills.value = ApiClient.scanSkills() } }

    fun addMcpServer(name: String, command: String) {
        scope.launch {
            ApiClient.addMcpServer(McpServerDto(id = "", name = name, command = command))
            loadMcp()
        }
    }

    fun deleteMcpServer(id: String) {
        scope.launch { ApiClient.deleteMcpServer(id); loadMcp() }
    }

    fun toggleMcpAgent(serverId: String, agentId: String, enabled: Boolean) {
        scope.launch {
            val server = _mcpServers.value.find { it.id == serverId } ?: return@launch
            val updated = server.copy(enabledAgents = server.enabledAgents + (agentId to enabled))
            ApiClient.updateMcpServer(serverId, updated)
            loadMcp()
        }
    }

    fun toggleSkillAgent(skillId: String, agentId: String, enabled: Boolean) {
        scope.launch {
            ApiClient.toggleSkillAgent(skillId, agentId, enabled)
            loadSkills()
        }
    }
}
