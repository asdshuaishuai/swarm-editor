package com.swarmeditor.backend.service

import com.swarmeditor.backend.capability.CapabilityRegistry
import com.swarmeditor.backend.pi.WASM_PLUGIN_RUNTIME_VERSION
import com.swarmeditor.backend.pi.WasmPluginRegistry
import com.swarmeditor.backend.pi.WasmSandbox
import com.swarmeditor.backend.pi.WasmtimeRuntimeManager
import com.swarmeditor.backend.pi.WasmtimeRuntimeStatus
import com.swarmeditor.common.model.CapabilityDescriptor
import com.swarmeditor.common.model.CapabilityKind
import com.swarmeditor.common.model.CapabilityPermission
import com.swarmeditor.common.model.CapabilityTrust
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

data class WasmPluginInfo(
    val id: String,
    val name: String,
    val description: String,
    val moduleFileName: String,
    val sha256: String,
    val timeoutMillis: Long,
    val maxInputBytes: Int,
    val maxOutputChars: Int,
)

data class WasmPluginState(
    val plugins: List<WasmPluginInfo> = emptyList(),
    val validationErrors: List<String> = emptyList(),
    val runtime: WasmtimeRuntimeStatus? = null,
    val pluginDirectory: String,
    val isRefreshing: Boolean = false,
    val isInstallingRuntime: Boolean = false,
    val lastError: String? = null,
)

data class WasmPluginExecution(
    val pluginId: String,
    val sha256: String,
    val output: JsonElement,
    val durationMillis: Long,
)

class WasmPluginService(
    private val registry: WasmPluginRegistry,
    private val runtimeManager: WasmtimeRuntimeManager,
    pluginDirectory: File,
    private val sandboxProvider: suspend () -> WasmSandbox? = runtimeManager::sandboxOrNull,
    private val json: Json = Json,
    private val capabilityRegistry: CapabilityRegistry? = null,
) {
    private val operationMutex = Mutex()
    private val _state = MutableStateFlow(WasmPluginState(pluginDirectory = pluginDirectory.absolutePath))
    val state: StateFlow<WasmPluginState> = _state.asStateFlow()

    suspend fun init() {
        refresh().getOrThrow()
    }

    suspend fun refresh(): Result<Unit> = guardedOperation(
        markBusy = { current -> current.copy(isRefreshing = true, lastError = null) },
    ) {
        loadState(isRefreshing = false, isInstalling = false)
    }

    suspend fun installRuntime(): Result<Unit> = guardedOperation(
        markBusy = { current -> current.copy(isInstallingRuntime = true, lastError = null) },
    ) {
        runtimeManager.install()
        loadState(isRefreshing = false, isInstalling = false)
    }

    suspend fun execute(pluginId: String, input: String): Result<WasmPluginExecution> = try {
        val parsedInput = json.parseToJsonElement(input.ifBlank { "null" })
        val catalog = registry.scan()
        val plugin = catalog.plugins.firstOrNull { it.id == pluginId }
            ?: error("Enabled WASM plugin not found: $pluginId")
        val sandbox = sandboxProvider()
            ?: error("Wasmtime $WASM_PLUGIN_RUNTIME_VERSION is not ready")
        val result = sandbox.execute(plugin.module, parsedInput)
        Result.success(
            WasmPluginExecution(
                pluginId = plugin.id,
                sha256 = plugin.module.sha256,
                output = result.output,
                durationMillis = result.durationMillis,
            )
        )
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }

    private suspend fun guardedOperation(
        markBusy: (WasmPluginState) -> WasmPluginState,
        operation: suspend () -> Unit,
    ): Result<Unit> = operationMutex.withLock {
        _state.update(markBusy)
        try {
            operation()
            Result.success(Unit)
        } catch (error: CancellationException) {
            _state.update { current ->
                current.copy(isRefreshing = false, isInstallingRuntime = false)
            }
            throw error
        } catch (error: Throwable) {
            _state.update { current ->
                current.copy(
                    isRefreshing = false,
                    isInstallingRuntime = false,
                    lastError = error.message ?: error::class.simpleName,
                )
            }
            Result.failure(error)
        }
    }

    private suspend fun loadState(isRefreshing: Boolean, isInstalling: Boolean) {
        val catalog = registry.scan()
        capabilityRegistry?.reconcile(
            source = WASM_PLUGIN_CAPABILITY_SOURCE,
            capabilities = catalog.plugins.map { plugin ->
                CapabilityDescriptor(
                    id = "wasm.plugin.${plugin.id}",
                    kind = CapabilityKind.WASM_PLUGIN,
                    version = plugin.module.sha256,
                    displayName = plugin.name,
                    description = plugin.description,
                    trust = CapabilityTrust.USER_APPROVED,
                    permissions = setOf(CapabilityPermission.EXECUTE_PROCESS),
                    source = WASM_PLUGIN_CAPABILITY_SOURCE,
                )
            },
        )
        val runtime = runtimeManager.inspect()
        _state.update { current ->
            current.copy(
                plugins = catalog.plugins.map { plugin ->
                    WasmPluginInfo(
                        id = plugin.id,
                        name = plugin.name,
                        description = plugin.description,
                        moduleFileName = plugin.module.file.name,
                        sha256 = plugin.module.sha256,
                        timeoutMillis = plugin.module.timeout.inWholeMilliseconds,
                        maxInputBytes = plugin.module.maxInputBytes,
                        maxOutputChars = plugin.module.maxOutputChars,
                    )
                },
                validationErrors = catalog.errors,
                runtime = runtime,
                isRefreshing = isRefreshing,
                isInstallingRuntime = isInstalling,
                lastError = null,
            )
        }
    }
}

private const val WASM_PLUGIN_CAPABILITY_SOURCE = "wasm-plugin"
