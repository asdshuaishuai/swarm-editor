package com.swarmeditor.backend.service

import com.swarmeditor.backend.acp.AcpConnectionManager
import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.backend.agent.AgentAdapter
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

private val log = KotlinLogging.logger {}

class AgentService(private val registry: AgentRegistry, private val connectionManager: AcpConnectionManager) {
    private val _agents = MutableStateFlow<List<AgentRuntimeInfo>>(emptyList())
    val agents: StateFlow<List<AgentRuntimeInfo>> = _agents

    suspend fun init() { registry.load(); refresh() }

    suspend fun scan() { registry.scan(); refresh(); registry.save() }

    suspend fun connect(agentId: String): Result<Unit> {
        val config = registry.getConfig(agentId) ?: return Result.failure(Exception("Agent not found"))
        updateStatus(agentId, AgentStatus.CONNECTING)
        val result = connectionManager.connect(config)
        return if (result.isSuccess) { updateStatus(agentId, AgentStatus.CONNECTED); Result.success(Unit) }
        else { updateStatus(agentId, AgentStatus.ERROR); Result.failure(result.exceptionOrNull()!!) }
    }

    suspend fun disconnect(agentId: String) { connectionManager.disconnect(agentId); updateStatus(agentId, AgentStatus.DISCONNECTED) }

    fun getConnection(agentId: String) = connectionManager.getConnection(agentId)
    fun getConfig(agentId: String) = registry.getConfig(agentId)
    fun getAllConfigs() = registry.getAllConfigs()
    fun getAdapter(agentType: AgentType): AgentAdapter? = registry.getAdapter(agentType)

    private fun updateStatus(id: String, status: AgentStatus) {
        registry.updateStatus(id, status)
        _agents.value = _agents.value.map { if (it.config.id == id) it.copy(status = status) else it }
    }

    private fun refresh() {
        _agents.value = registry.getAllConfigs().map { AgentRuntimeInfo(config = it, status = registry.getStatus(it.id), version = registry.getVersion(it.id)) }
    }
}
