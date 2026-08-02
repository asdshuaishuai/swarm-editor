package com.swarmeditor.backend.service

import com.swarmeditor.backend.pi.WASM_PLUGIN_RUNTIME_VERSION
import com.swarmeditor.backend.pi.WasmExecutionResult
import com.swarmeditor.backend.pi.WasmPluginRegistry
import com.swarmeditor.backend.pi.WasmSandbox
import com.swarmeditor.backend.pi.WasmtimeRuntimeHealth
import com.swarmeditor.backend.pi.WasmtimeRuntimeManager
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import java.security.MessageDigest
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeBytes
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@OptIn(ExperimentalPathApi::class)
class WasmPluginServiceTest {
    @Test
    fun `service exposes runtime catalog errors and test execution`() = runTest {
        val root = kotlin.io.path.createTempDirectory("wasm-service-")
        val plugins = root.resolve("plugins").createDirectories()
        val runtime = root.resolve("wasmtime").apply {
            writeText("runtime")
            toFile().setExecutable(true)
        }
        try {
            val module = byteArrayOf(0, 97, 115, 109)
            plugins.resolve("formatter").createDirectories()
            plugins.resolve("formatter/module.wasm").writeBytes(module)
            plugins.resolve("formatter/plugin.json").writeText(
                """
                {
                  "id": "formatter",
                  "name": "Formatter",
                  "description": "Formats structured input",
                  "module": "module.wasm",
                  "sha256": "${sha256(module)}"
                }
                """.trimIndent()
            )
            plugins.resolve("broken").createDirectories()
            val runtimeManager = WasmtimeRuntimeManager(
                installRoot = root.resolve("managed").toFile(),
                environmentProvider = {
                    mapOf("SWARM_WASMTIME" to runtime.toFile().absolutePath, "PATH" to "")
                },
                resourcesDirectoryProvider = { null },
                commandRunner = CommandRunner {
                    CommandResult(0, "wasmtime $WASM_PLUGIN_RUNTIME_VERSION", 1)
                },
            )
            val service = WasmPluginService(
                registry = WasmPluginRegistry(plugins.toFile()),
                runtimeManager = runtimeManager,
                pluginDirectory = plugins.toFile(),
                sandboxProvider = {
                    WasmSandbox { _, input ->
                        WasmExecutionResult(
                            output = buildJsonObject { put("received", input) },
                            durationMillis = 7,
                        )
                    }
                },
            )

            service.init()
            val state = service.state.value
            val execution = service.execute("formatter", "{\"source\":\"x\"}").getOrThrow()

            assertEquals(WasmtimeRuntimeHealth.READY, state.runtime?.health)
            assertEquals(listOf("formatter"), state.plugins.map(WasmPluginInfo::id))
            assertTrue(state.validationErrors.single().startsWith("broken:"))
            assertEquals("x", execution.output.jsonObject["received"]!!.jsonObject["source"]!!.jsonPrimitive.content)
            assertEquals(7, execution.durationMillis)
        } finally {
            root.deleteRecursively()
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }
}
