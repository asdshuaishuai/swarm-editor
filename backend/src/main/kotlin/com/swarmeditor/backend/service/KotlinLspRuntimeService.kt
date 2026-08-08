package com.swarmeditor.backend.service

import com.swarmeditor.backend.lsp.KotlinLspRuntimeManager
import com.swarmeditor.backend.lsp.KotlinLspRuntimeStatus
import com.swarmeditor.backend.lsp.LspService
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class KotlinLspRuntimeState(
    val runtime: KotlinLspRuntimeStatus? = null,
    val runtimeDirectory: String,
    val isRefreshing: Boolean = false,
    val isInstalling: Boolean = false,
    val isProbing: Boolean = false,
    val downloadedBytes: Long = 0,
    val totalDownloadBytes: Long = 0,
    val lastConnectedServer: String? = null,
    val lastProbeFile: String? = null,
    val lastError: String? = null,
)

class KotlinLspRuntimeService(
    private val runtimeManager: KotlinLspRuntimeManager,
    private val lspService: LspService,
    private val projectRoot: File,
    runtimeDirectory: File,
) {
    private val operationMutex = Mutex()
    private val _state = MutableStateFlow(KotlinLspRuntimeState(runtimeDirectory = runtimeDirectory.absolutePath))
    val state: StateFlow<KotlinLspRuntimeState> = _state.asStateFlow()

    suspend fun init() {
        refresh().getOrThrow()
    }

    suspend fun refresh(): Result<Unit> = guardedOperation(
        markBusy = { current -> current.copy(isRefreshing = true, lastError = null) },
    ) {
        val runtime = runtimeManager.inspect()
        _state.update { current ->
            current.copy(
                runtime = runtime,
                isRefreshing = false,
                downloadedBytes = runtime.downloadedBytes,
                totalDownloadBytes = runtime.archiveSizeBytes,
            )
        }
    }

    suspend fun install(): Result<Unit> = guardedOperation(
        markBusy = { current -> current.copy(isInstalling = true, lastError = null) },
    ) {
        val runtime = runtimeManager.install { progress ->
            _state.update { current ->
                current.copy(
                    downloadedBytes = progress.downloadedBytes,
                    totalDownloadBytes = progress.totalBytes,
                )
            }
        }
        lspService.restart(KOTLIN_SERVER_ID)
        _state.update { current ->
            current.copy(
                runtime = runtime,
                isInstalling = false,
                lastConnectedServer = null,
                lastProbeFile = null,
                downloadedBytes = 0,
                totalDownloadBytes = runtime.archiveSizeBytes,
            )
        }
    }

    suspend fun probe(): Result<Unit> = guardedOperation(
        markBusy = { current -> current.copy(isProbing = true, lastError = null) },
    ) {
        val sourceFile = findProbeFile()
        val content = withContext(Dispatchers.IO) {
            require(sourceFile.length() <= MAX_PROBE_FILE_BYTES) { "Kotlin LSP probe file is too large" }
            sourceFile.readText()
        }
        lspService.restart(KOTLIN_SERVER_ID)
        val result = lspService.highlight(sourceFile, content)
        val serverName = result.serverName
            ?: error(result.message ?: "Kotlin LSP did not establish a semantic-token session")
        _state.update { current ->
            current.copy(
                runtime = runtimeManager.inspect(),
                isProbing = false,
                lastConnectedServer = serverName,
                lastProbeFile = sourceFile.relativeTo(projectRoot).invariantSeparatorsPath,
            )
        }
    }

    private suspend fun guardedOperation(
        markBusy: (KotlinLspRuntimeState) -> KotlinLspRuntimeState,
        operation: suspend () -> Unit,
    ): Result<Unit> = operationMutex.withLock {
        _state.update(markBusy)
        try {
            operation()
            Result.success(Unit)
        } catch (error: CancellationException) {
            _state.update { current -> current.copy(isRefreshing = false, isInstalling = false, isProbing = false) }
            throw error
        } catch (error: Throwable) {
            _state.update { current ->
                current.copy(
                    isRefreshing = false,
                    isInstalling = false,
                    isProbing = false,
                    lastError = safeMessage(error),
                )
            }
            Result.failure(error)
        }
    }

    private suspend fun findProbeFile(): File = withContext(Dispatchers.IO) {
        PROBE_FILE_CANDIDATES
            .asSequence()
            .map { relativePath -> File(projectRoot, relativePath) }
            .firstOrNull(File::isFile)
            ?: Files.find(
                projectRoot.toPath(),
                MAX_PROBE_SEARCH_DEPTH,
                { path, attributes ->
                    attributes.isRegularFile &&
                        path.fileName.toString().let { name -> name.endsWith(".kt") || name.endsWith(".kts") } &&
                        path.none { segment -> segment.toString() in IGNORED_DIRECTORIES }
                },
            ).use { paths -> paths.findFirst().orElseThrow { IllegalStateException("项目中没有可用于连接测试的 Kotlin 文件") }.toFile() }
    }
}

private fun safeMessage(error: Throwable): String = error.message
    ?.replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
    ?.trim()
    ?.take(500)
    ?.ifBlank { null }
    ?: error::class.simpleName.orEmpty().ifBlank { "Kotlin LSP operation failed" }

private const val KOTLIN_SERVER_ID = "kotlin"
private const val MAX_PROBE_FILE_BYTES = 2L * 1024 * 1024
private const val MAX_PROBE_SEARCH_DEPTH = 8
private val PROBE_FILE_CANDIDATES = listOf(
    "settings.gradle.kts",
    "build.gradle.kts",
    "desktopApp/src/main/kotlin/com/swarmeditor/desktop/Main.kt",
    "backend/src/main/kotlin/com/swarmeditor/backend/Main.kt",
)
private val IGNORED_DIRECTORIES = setOf(".git", ".gradle", "build", "node_modules")
