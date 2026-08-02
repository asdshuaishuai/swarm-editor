package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.pi.WasmtimeRuntimeHealth
import com.swarmeditor.backend.pi.WasmtimeRuntimeSource
import com.swarmeditor.backend.pi.WasmtimeRuntimeStatus
import com.swarmeditor.backend.service.WasmPluginInfo
import com.swarmeditor.backend.service.WasmPluginState
import com.swarmeditor.desktop.api.WasmtimeRuntimeHealthDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WasmPluginViewModelTest {
    @Test
    fun `backend runtime and plugin evidence maps without losing hashes`() {
        val state = WasmPluginState(
            plugins = listOf(
                WasmPluginInfo(
                    id = "formatter",
                    name = "Formatter",
                    description = "Deterministic formatter",
                    moduleFileName = "module.wasm",
                    sha256 = "a".repeat(64),
                    timeoutMillis = 5_000,
                    maxInputBytes = 1_024,
                    maxOutputChars = 4_096,
                )
            ),
            validationErrors = listOf("broken: plugin.json is missing"),
            runtime = WasmtimeRuntimeStatus(
                health = WasmtimeRuntimeHealth.READY,
                source = WasmtimeRuntimeSource.MANAGED,
                platform = "x86_64-linux",
                executablePath = "/runtime/wasmtime",
                detectedVersion = "47.0.2",
                installSupported = true,
                artifactSha256 = "b".repeat(64),
                binarySha256 = "c".repeat(64),
                message = "ready",
            ),
            pluginDirectory = "/plugins",
        )

        val mapped = state.toUiState()

        assertEquals(WasmtimeRuntimeHealthDto.READY, mapped.runtime?.health)
        assertEquals("managed", mapped.runtime?.source)
        assertEquals("a".repeat(64), mapped.plugins.single().sha256)
        assertEquals("b".repeat(64), mapped.runtime?.artifactSha256)
        assertTrue(mapped.validationErrors.single().startsWith("broken:"))
    }
}
