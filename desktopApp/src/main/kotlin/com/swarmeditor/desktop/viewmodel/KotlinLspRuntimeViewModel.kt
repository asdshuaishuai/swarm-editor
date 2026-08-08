package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.lsp.KotlinLspRuntimeHealth
import com.swarmeditor.backend.lsp.KotlinLspRuntimeSource
import com.swarmeditor.backend.lsp.LspConnectionPhase
import com.swarmeditor.backend.lsp.LspService
import com.swarmeditor.backend.service.KotlinLspRuntimeService
import com.swarmeditor.backend.service.KotlinLspRuntimeState
import java.awt.Desktop
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class KotlinLspRuntimeUiState(
    val expectedVersion: String = "",
    val health: KotlinLspRuntimeHealth = KotlinLspRuntimeHealth.MISSING,
    val source: KotlinLspRuntimeSource = KotlinLspRuntimeSource.NONE,
    val platform: String = "",
    val command: String = "",
    val installSupported: Boolean = false,
    val artifactSha256: String = "",
    val launcherSha256: String = "",
    val runtimeMessage: String = "",
    val runtimeDirectory: String = "",
    val connectionPhase: LspConnectionPhase = LspConnectionPhase.IDLE,
    val connectionCommand: String = "",
    val connectedServer: String = "",
    val connectionMessage: String = "",
    val lastProbeFile: String = "",
    val isRefreshing: Boolean = false,
    val isInstalling: Boolean = false,
    val isProbing: Boolean = false,
    val downloadedBytes: Long = 0,
    val totalDownloadBytes: Long = 0,
    val lastError: String? = null,
)

data class KotlinLspActionEvent(val message: String, val type: ToastType)

class KotlinLspRuntimeViewModel(
    private val service: KotlinLspRuntimeService,
    lspService: LspService,
    private val scope: CoroutineScope,
) {
    private val eventsChannel = Channel<KotlinLspActionEvent>(Channel.BUFFERED)
    val events = eventsChannel.receiveAsFlow()
    val state: StateFlow<KotlinLspRuntimeUiState> = combine(service.state, lspService.serverStates) { runtime, servers ->
        runtime.toUiState(servers[KOTLIN_SERVER_ID])
    }.stateIn(scope, SharingStarted.WhileSubscribed(5_000), KotlinLspRuntimeUiState())

    fun load() {
        refresh(notifySuccess = false)
    }

    fun refresh() {
        refresh(notifySuccess = true)
    }

    fun install() {
        launchAction("Kotlin LSP 已安装并通过完整性校验", "Kotlin LSP 安装失败") { service.install() }
    }

    fun probe() {
        launchAction("Kotlin LSP 连接测试通过", "Kotlin LSP 连接测试失败") { service.probe() }
    }

    fun openRuntimeDirectory() {
        val path = state.value.runtimeDirectory.takeIf(String::isNotBlank) ?: return
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val directory = File(path).apply { mkdirs() }
                    require(directory.isDirectory) { "Kotlin LSP 运行时目录不可用: $path" }
                    require(Desktop.isDesktopSupported()) { "当前系统不支持打开文件管理器" }
                    Desktop.getDesktop().open(directory)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventsChannel.send(KotlinLspActionEvent(error.message ?: "无法打开 Kotlin LSP 目录", ToastType.ERROR))
            }
        }
    }

    private fun refresh(notifySuccess: Boolean) {
        launchAction(
            successMessage = "Kotlin LSP 状态已刷新",
            failureMessage = "Kotlin LSP 状态刷新失败",
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
                        if (notifySuccess) eventsChannel.send(KotlinLspActionEvent(successMessage, ToastType.SUCCESS))
                    },
                    onFailure = { error ->
                        eventsChannel.send(KotlinLspActionEvent(error.message ?: failureMessage, ToastType.ERROR))
                    },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventsChannel.send(KotlinLspActionEvent(error.message ?: failureMessage, ToastType.ERROR))
            }
        }
    }
}

private fun KotlinLspRuntimeState.toUiState(
    connection: com.swarmeditor.backend.lsp.LspServerConnectionState?,
): KotlinLspRuntimeUiState {
    val runtime = runtime
    return KotlinLspRuntimeUiState(
        expectedVersion = runtime?.expectedVersion.orEmpty(),
        health = runtime?.health ?: KotlinLspRuntimeHealth.MISSING,
        source = runtime?.source ?: KotlinLspRuntimeSource.NONE,
        platform = runtime?.platform.orEmpty(),
        command = runtime?.command.orEmpty().joinToString(" "),
        installSupported = runtime?.installSupported == true,
        artifactSha256 = runtime?.artifactSha256.orEmpty(),
        launcherSha256 = runtime?.launcherSha256.orEmpty(),
        runtimeMessage = runtime?.message.orEmpty(),
        runtimeDirectory = runtimeDirectory,
        connectionPhase = connection?.phase ?: LspConnectionPhase.IDLE,
        connectionCommand = connection?.command.orEmpty().joinToString(" "),
        connectedServer = connection?.serverName ?: lastConnectedServer.orEmpty(),
        connectionMessage = connection?.message.orEmpty(),
        lastProbeFile = lastProbeFile.orEmpty(),
        isRefreshing = isRefreshing,
        isInstalling = isInstalling,
        isProbing = isProbing,
        downloadedBytes = downloadedBytes,
        totalDownloadBytes = totalDownloadBytes,
        lastError = lastError,
    )
}

private const val KOTLIN_SERVER_ID = "kotlin"
