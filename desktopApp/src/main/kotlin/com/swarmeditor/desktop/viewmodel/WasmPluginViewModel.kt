package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.pi.WasmtimeRuntimeHealth
import com.swarmeditor.backend.service.WasmPluginService
import com.swarmeditor.backend.service.WasmPluginState
import com.swarmeditor.desktop.api.WasmPluginDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeHealthDto
import java.awt.Desktop
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

data class WasmPluginUiState(
    val plugins: List<WasmPluginDto> = emptyList(),
    val validationErrors: List<String> = emptyList(),
    val runtime: WasmtimeRuntimeDto? = null,
    val pluginDirectory: String = "",
    val isRefreshing: Boolean = false,
    val isInstallingRuntime: Boolean = false,
    val lastError: String? = null,
)

data class WasmPluginExecutionState(
    val pluginId: String? = null,
    val input: String = "{}",
    val isRunning: Boolean = false,
    val output: String = "",
    val error: String? = null,
    val durationMillis: Long? = null,
)

data class WasmPluginActionEvent(val message: String, val type: ToastType)

class WasmPluginViewModel(
    private val service: WasmPluginService,
    private val scope: CoroutineScope,
) {
    private val prettyJson = Json { prettyPrint = true }
    private val eventChannel = Channel<WasmPluginActionEvent>(Channel.BUFFERED)
    private val _execution = MutableStateFlow(WasmPluginExecutionState())

    val events = eventChannel.receiveAsFlow()
    val execution: StateFlow<WasmPluginExecutionState> = _execution.asStateFlow()
    val state: StateFlow<WasmPluginUiState> = service.state
        .map(WasmPluginState::toUiState)
        .stateIn(scope, SharingStarted.WhileSubscribed(5_000), WasmPluginUiState())

    fun load() {
        refresh(notifySuccess = false)
    }

    fun refresh() {
        refresh(notifySuccess = true)
    }

    fun installRuntime() {
        launchAction(
            successMessage = "Wasmtime 运行时已安装并通过校验",
            failureMessage = "Wasmtime 运行时安装失败",
        ) { service.installRuntime() }
    }

    fun updateTestInput(value: String) {
        _execution.update { current -> current.copy(input = value, error = null) }
    }

    fun execute(pluginId: String) {
        val input = _execution.value.input
        _execution.value = WasmPluginExecutionState(
            pluginId = pluginId,
            input = input,
            isRunning = true,
        )
        scope.launch {
            try {
                service.execute(pluginId, input).fold(
                    onSuccess = { execution ->
                        _execution.update { current ->
                            current.copy(
                                pluginId = pluginId,
                                isRunning = false,
                                output = prettyJson.encodeToString(JsonElement.serializer(), execution.output),
                                error = null,
                                durationMillis = execution.durationMillis,
                            )
                        }
                        eventChannel.send(WasmPluginActionEvent("WASM 插件执行完成", ToastType.SUCCESS))
                    },
                    onFailure = { error ->
                        _execution.update { current ->
                            current.copy(
                                pluginId = pluginId,
                                isRunning = false,
                                output = "",
                                error = error.message ?: "WASM 插件执行失败",
                                durationMillis = null,
                            )
                        }
                        eventChannel.send(
                            WasmPluginActionEvent(error.message ?: "WASM 插件执行失败", ToastType.ERROR)
                        )
                    },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _execution.update { current ->
                    current.copy(isRunning = false, error = error.message ?: "WASM 插件执行失败")
                }
                eventChannel.send(WasmPluginActionEvent(error.message ?: "WASM 插件执行失败", ToastType.ERROR))
            }
        }
    }

    fun openPluginDirectory() {
        val path = state.value.pluginDirectory.takeIf(String::isNotBlank) ?: return
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val directory = File(path).apply { mkdirs() }
                    require(directory.isDirectory) { "WASM 插件目录不可用: $path" }
                    require(Desktop.isDesktopSupported()) { "当前系统不支持打开文件管理器" }
                    Desktop.getDesktop().open(directory)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(WasmPluginActionEvent(error.message ?: "无法打开 WASM 插件目录", ToastType.ERROR))
            }
        }
    }

    private fun refresh(notifySuccess: Boolean) {
        launchAction(
            successMessage = "WASM 插件与运行时状态已刷新",
            failureMessage = "WASM 插件刷新失败",
            notifySuccess = notifySuccess,
        ) { service.refresh() }
    }

    private fun launchAction(
        successMessage: String,
        failureMessage: String,
        notifySuccess: Boolean = true,
        action: suspend () -> Result<Unit>,
    ) {
        scope.launch {
            try {
                action().fold(
                    onSuccess = {
                        if (notifySuccess) {
                            eventChannel.send(WasmPluginActionEvent(successMessage, ToastType.SUCCESS))
                        }
                    },
                    onFailure = { error ->
                        eventChannel.send(WasmPluginActionEvent(error.message ?: failureMessage, ToastType.ERROR))
                    },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(WasmPluginActionEvent(error.message ?: failureMessage, ToastType.ERROR))
            }
        }
    }
}

internal fun WasmPluginState.toUiState(): WasmPluginUiState = WasmPluginUiState(
    plugins = plugins.map { plugin ->
        WasmPluginDto(
            id = plugin.id,
            name = plugin.name,
            description = plugin.description,
            moduleFileName = plugin.moduleFileName,
            sha256 = plugin.sha256,
            timeoutMillis = plugin.timeoutMillis,
            maxInputBytes = plugin.maxInputBytes,
            maxOutputChars = plugin.maxOutputChars,
        )
    },
    validationErrors = validationErrors,
    runtime = runtime?.let { runtime ->
        WasmtimeRuntimeDto(
            expectedVersion = runtime.expectedVersion,
            health = when (runtime.health) {
                WasmtimeRuntimeHealth.READY -> WasmtimeRuntimeHealthDto.READY
                WasmtimeRuntimeHealth.MISSING -> WasmtimeRuntimeHealthDto.MISSING
                WasmtimeRuntimeHealth.INVALID -> WasmtimeRuntimeHealthDto.INVALID
                WasmtimeRuntimeHealth.UNSUPPORTED -> WasmtimeRuntimeHealthDto.UNSUPPORTED
            },
            source = runtime.source.name.lowercase(),
            platform = runtime.platform,
            executablePath = runtime.executablePath.orEmpty(),
            detectedVersion = runtime.detectedVersion.orEmpty(),
            installSupported = runtime.installSupported,
            artifactSha256 = runtime.artifactSha256.orEmpty(),
            binarySha256 = runtime.binarySha256.orEmpty(),
            message = runtime.message,
        )
    },
    pluginDirectory = pluginDirectory,
    isRefreshing = isRefreshing,
    isInstallingRuntime = isInstallingRuntime,
    lastError = lastError,
)
