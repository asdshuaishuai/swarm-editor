package com.swarmeditor.backend.service

import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.mcp.UserMcpScanner
import com.swarmeditor.common.model.McpServerConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * MCP 配置库。
 *
 * stdio 配置由内置 pi extension 在新建 runtime 时读取并桥接；HTTP server 当前不受支持。
 */
class McpService(
    private val store: McpStore,
    private val userScanner: UserMcpScanner? = null,
    private val invalidateAllRuntimes: suspend () -> Unit = {}
) {
    private val _servers = MutableStateFlow<List<McpServerConfig>>(emptyList())
    val servers: StateFlow<List<McpServerConfig>> = _servers.asStateFlow()

    suspend fun init() {
        reload().getOrThrow()
    }

    suspend fun getAll(): List<McpServerConfig> = store.getAll()

    suspend fun upsert(config: McpServerConfig): Result<Unit> = resultOf {
        store.upsert(config)
        refresh()
        invalidateAllRuntimes()
    }

    suspend fun delete(id: String): Result<Unit> = resultOf {
        store.delete(id)
        refresh()
        invalidateAllRuntimes()
    }

    suspend fun reload(): Result<Unit> = resultOf {
        store.load()
        userScanner?.let { scanner -> store.synchronizeDiscovered(scanner.scan()) }
        refresh()
        invalidateAllRuntimes()
    }

    private suspend fun refresh() {
        _servers.value = store.getAll()
    }
}

private suspend fun resultOf(action: suspend () -> Unit): Result<Unit> {
    return try {
        action()
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}
