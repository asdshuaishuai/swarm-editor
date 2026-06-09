package com.swarmeditor.backend.acp

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentStatus
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private val log = KotlinLogging.logger {}

/**
 * ACP 连接管理器 — 管理所有 Agent 连接的生命周期。
 *
 * 线程安全，使用 Mutex 保护连接 Map。
 */
class AcpConnectionManager {
    private val connections = mutableMapOf<String, AcpConnection>()
    private val mutex = Mutex()

    /**
     * 连接到 Agent。
     */
    suspend fun connect(config: AgentConfig): Result<AcpConnection> = mutex.withLock {
        // 如果已有连接，先关闭
        connections[config.id]?.let { existing ->
            if (existing.isConnected) {
                log.info { "Closing existing connection for ${config.id}" }
                existing.close()
            }
        }

        val connection = AcpConnection(config.id, config)
        connections[config.id] = connection

        val result = connection.connect()
        if (result.isFailure) {
            log.error { "Failed to connect to ${config.id}: ${result.exceptionOrNull()?.message}" }
        } else {
            log.info { "Connected to ${config.id} (${config.agentType})" }
        }

        if (result.isSuccess) Result.success(connection)
        else Result.failure(result.exceptionOrNull()!!)
    }

    /**
     * 断开 Agent 连接。
     */
    suspend fun disconnect(agentId: String) = mutex.withLock {
        connections.remove(agentId)?.let {
            it.close()
            log.info { "Disconnected from $agentId" }
        }
    }

    /**
     * 获取 Agent 连接。
     */
    fun getConnection(agentId: String): AcpConnection? = connections[agentId]

    /**
     * 获取所有连接状态。
     */
    fun getAllStatus(): Map<String, AgentStatus> = connections.mapValues { it.value.status }

    /**
     * 断开所有连接。
     */
    suspend fun disconnectAll() = mutex.withLock {
        connections.values.forEach { it.close() }
        connections.clear()
        log.info { "Disconnected from all agents" }
    }
}
