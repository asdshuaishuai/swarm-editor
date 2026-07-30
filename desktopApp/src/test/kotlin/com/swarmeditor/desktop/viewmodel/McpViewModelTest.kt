package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class McpViewModelTest {
    @Test
    fun `upsert persists configuration and emits user event`() = runTest {
        val directory = createTempDirectory("mcp-vm-").toFile()
        try {
            val service = McpService(McpStore(File(directory, "mcp.json")))
            val viewModel = McpViewModel(service, MutableStateFlow<PiSessionState?>(null), backgroundScope)
            viewModel.servers.onEach {}.launchIn(backgroundScope)
            val event = async { viewModel.events.first() }

            viewModel.upsert(McpServerDto(id = "search", name = "Search", command = "search-mcp"))
            val emittedEvent = event.await()
            advanceUntilIdle()

            assertEquals(listOf("search"), service.servers.value.map { it.id })
            assertEquals(listOf("search"), viewModel.servers.value.map { it.id })
            assertEquals(McpRuntimeStatus.CONFIGURED, viewModel.servers.value.single().runtimeStatus)
            assertEquals("MCP 配置已保存；重启当前会话后生效", emittedEvent.message)
        } finally {
            directory.deleteRecursively()
        }
    }
}
