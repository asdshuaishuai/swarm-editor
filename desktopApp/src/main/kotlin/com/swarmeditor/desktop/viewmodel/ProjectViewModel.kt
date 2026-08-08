package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceFoldingRange
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProjectViewModel(
    private val service: ProjectService,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    gitStatus: StateFlow<GitStatusDto> = MutableStateFlow(GitStatusDto()),
    private val loadTree: suspend () -> ProjectService.FileNode = { service.getTree() },
) {
    val projectPath: String = service.projectPath

    data class FilePreviewState(
        val path: String? = null,
        val content: String = "",
        val sizeBytes: Long = 0,
        val truncated: Boolean = false,
        val binary: Boolean = false,
        val languageId: String = "",
        val lspServer: String? = null,
        val semanticHighlights: List<SemanticHighlight> = emptyList(),
        val symbols: List<SourceSymbol> = emptyList(),
        val diagnostics: List<SourceDiagnostic> = emptyList(),
        val foldingRanges: List<SourceFoldingRange> = emptyList(),
        val lspMessage: String? = null,
        val isLoading: Boolean = false,
        val isInspecting: Boolean = false,
        val error: String? = null,
    )

    private val rawTree = MutableStateFlow<FileNodeDto?>(null)
    val tree: StateFlow<FileNodeDto?> = combine(rawTree, gitStatus) { tree, status ->
        tree?.withGitChanges(status.changes.associateBy(GitFileChangeDto::path))
    }.stateIn(scope, SharingStarted.Eagerly, null)
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    private val _treeError = MutableStateFlow<String?>(null)
    val treeError: StateFlow<String?> = _treeError
    private var treeJob: Job? = null
    private val treeRequestIds = AtomicLong()
    private val _filePreview = MutableStateFlow(FilePreviewState())
    val filePreview: StateFlow<FilePreviewState> = _filePreview
    private val _openFiles = MutableStateFlow<List<String>>(emptyList())
    val openFiles: StateFlow<List<String>> = _openFiles
    private var previewJob: Job? = null
    private val previewRequestIds = AtomicLong()

    fun load() {
        val requestId = treeRequestIds.incrementAndGet()
        treeJob?.cancel()
        _isLoading.value = true
        _treeError.value = null
        treeJob = scope.launch(ioDispatcher) {
            try {
                val tree = loadTree().toDto()
                if (requestId == treeRequestIds.get()) rawTree.value = tree
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (requestId == treeRequestIds.get()) {
                    _treeError.value = error.message ?: "无法加载项目文件"
                }
            } finally {
                if (requestId == treeRequestIds.get()) _isLoading.value = false
            }
        }
    }

    fun selectFile(path: String) {
        _openFiles.value = (_openFiles.value + path).distinct().takeLast(MAX_OPEN_FILES)
        val requestId = previewRequestIds.incrementAndGet()
        previewJob?.cancel()
        _filePreview.value = FilePreviewState(path = path, isLoading = true)
        previewJob = scope.launch(ioDispatcher) {
            try {
                val preview = service.readFile(path)
                val shouldInspect = !preview.binary && preview.content.isNotEmpty()
                val localSymbols = markdownOutlineSymbols(path, preview.content)
                val pathLanguageId = sourceLanguageId(path)
                val contentState = FilePreviewState(
                    path = preview.path,
                    content = preview.content,
                    sizeBytes = preview.sizeBytes,
                    truncated = preview.truncated,
                    binary = preview.binary,
                    languageId = pathLanguageId,
                    symbols = localSymbols,
                    isInspecting = shouldInspect,
                )
                if (requestId != previewRequestIds.get()) return@launch
                _filePreview.value = contentState
                if (!shouldInspect) return@launch

                val insight = try {
                    service.inspectFile(path, preview.content)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    if (requestId == previewRequestIds.get()) {
                        _filePreview.value = contentState.copy(
                            isInspecting = false,
                            lspMessage = "代码智能不可用：${error.message ?: error::class.simpleName}",
                        )
                    }
                    return@launch
                }
                if (requestId == previewRequestIds.get()) {
                    _filePreview.value = if (insight == null) {
                        contentState.copy(isInspecting = false)
                    } else {
                        contentState.copy(
                            languageId = pathLanguageId.ifBlank { insight.languageId },
                            lspServer = insight.serverName,
                            semanticHighlights = insight.highlights,
                            symbols = (localSymbols + insight.symbols).distinctBy { symbol ->
                                Triple(symbol.name, symbol.kind, symbol.line)
                            },
                            diagnostics = insight.diagnostics,
                            foldingRanges = insight.foldingRanges,
                            lspMessage = insight.message,
                            isInspecting = false,
                        )
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (requestId == previewRequestIds.get()) {
                    _filePreview.value = FilePreviewState(
                        path = path,
                        error = error.message ?: "无法读取文件",
                    )
                }
            }
        }
    }

    fun closeFile(path: String) {
        val current = _openFiles.value
        val closedIndex = current.indexOf(path)
        if (closedIndex < 0) return

        val remaining = current.filterNot { it == path }
        _openFiles.value = remaining
        if (_filePreview.value.path != path) return

        previewRequestIds.incrementAndGet()
        previewJob?.cancel()
        val nextPath = remaining.getOrNull(closedIndex.coerceAtMost(remaining.lastIndex))
        if (nextPath == null) {
            _filePreview.value = FilePreviewState()
        } else {
            selectFile(nextPath)
        }
    }

    private companion object {
        const val MAX_OPEN_FILES = 12
    }
}

internal fun sourceLanguageId(path: String): String = when (val extension = path.substringAfterLast('.', "").lowercase()) {
    "kt", "kts" -> "kotlin"
    "md", "markdown" -> "markdown"
    "htm", "html" -> "html"
    "js", "jsx" -> "javascript"
    "ts", "tsx" -> "typescript"
    "py" -> "python"
    "rs" -> "rust"
    "rb" -> "ruby"
    "cs" -> "csharp"
    "c", "h", "cc", "cpp", "cxx", "hpp" -> "cpp"
    else -> extension
}

private fun ProjectService.FileNode.toDto(): FileNodeDto = FileNodeDto(
    name = name,
    path = path,
    isDirectory = isDirectory,
    children = children.map { it.toDto() },
    changeStatus = changeStatus
)

private fun FileNodeDto.withGitChanges(changes: Map<String, GitFileChangeDto>): FileNodeDto {
    return copy(
        changeStatus = changes[path]?.status,
        children = children.map { child -> child.withGitChanges(changes) }
    )
}
