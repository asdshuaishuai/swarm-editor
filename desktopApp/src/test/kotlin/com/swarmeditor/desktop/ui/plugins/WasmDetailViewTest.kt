package com.swarmeditor.desktop.ui.plugins

import com.swarmeditor.desktop.api.WasmtimeRuntimeHealthDto
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.Err
import kotlin.test.Test
import kotlin.test.assertEquals

class WasmDetailViewTest {
    @Test
    fun `runtime presentation distinguishes ready missing and invalid states`() {
        assertEquals("运行时就绪", wasmRuntimeLabel(WasmtimeRuntimeHealthDto.READY))
        assertEquals("未安装", wasmRuntimeLabel(WasmtimeRuntimeHealthDto.MISSING))
        assertEquals("校验失败", wasmRuntimeLabel(WasmtimeRuntimeHealthDto.INVALID))
        assertEquals(AgentGemini, wasmRuntimeColor(WasmtimeRuntimeHealthDto.READY))
        assertEquals(Err, wasmRuntimeColor(WasmtimeRuntimeHealthDto.INVALID))
    }

    @Test
    fun `runtime source and limits remain human readable`() {
        assertEquals("Swarm Editor 管理", runtimeSourceLabel("managed"))
        assertEquals("SWARM_WASMTIME", runtimeSourceLabel("environment"))
        assertEquals("1 MiB", formatWasmBytes(1024 * 1024))
        assertEquals("4 KiB", formatWasmBytes(4096))
    }
}
