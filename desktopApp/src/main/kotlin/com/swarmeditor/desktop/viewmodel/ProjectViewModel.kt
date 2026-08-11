package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceFoldingRange
import com.swarmeditor.backend.lsp.SourceLocation
import com.swarmeditor.backend.lsp.SourcePositionInsight
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.ConcurrentHashMap
import java.net.URI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class EditorLocation(
    val path: String,
    val line: Int? = null,
)

data class EditorNavigationState(
    val current: EditorLocation? = null,
    val backStack: List<EditorLocation> = emptyList(),
    val forwardStack: List<EditorLocation> = emptyList(),
) {
    val canNavigateBack: Boolean get() = backStack.isNotEmpty()
    val canNavigateForward: Boolean get() = forwardStack.isNotEmpty()
}

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
        val positionInsight: SourcePositionInsight? = null,
        val isInspectingPosition: Boolean = false,
        val draftContent: String? = null,
        val isSaving: Boolean = false,
        val navigationLine: Int? = null,
        val navigationRequestId: Long = 0,
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
    private val _recentFiles = MutableStateFlow<List<String>>(emptyList())
    val recentFiles: StateFlow<List<String>> = _recentFiles.asStateFlow()
    private val _navigationState = MutableStateFlow(EditorNavigationState())
    val navigationState: StateFlow<EditorNavigationState> = _navigationState.asStateFlow()
    private var previewJob: Job? = null
    private var positionJob: Job? = null
    private val previewRequestIds = AtomicLong()
    private val positionRequestIds = AtomicLong()
    private val drafts = ConcurrentHashMap<String, String>()
    private val draftBaselines = ConcurrentHashMap<String, String>()
    private val _dirtyPaths = MutableStateFlow<Set<String>>(emptySet())
    val dirtyPaths: StateFlow<Set<String>> = _dirtyPaths.asStateFlow()

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

    fun selectFile(path: String) = selectFile(path, navigationLine = null, recordNavigation = true)

    fun navigateToFile(path: String, line: Int) = selectFile(
        path,
        navigationLine = line.coerceAtLeast(0),
        recordNavigation = true,
    )

    fun navigateBack() = navigateHistory(backward = true)

    fun navigateForward() = navigateHistory(backward = false)

    private fun selectFile(path: String, navigationLine: Int?, recordNavigation: Boolean) {
        if (recordNavigation) recordEditorLocation(EditorLocation(path, navigationLine))
        _openFiles.value = (_openFiles.value + path).distinct().takeLast(MAX_OPEN_FILES)
        _recentFiles.value = (listOf(path) + _recentFiles.value.filterNot { it == path }).take(MAX_RECENT_FILES)
        val requestId = previewRequestIds.incrementAndGet()
        previewJob?.cancel()
        positionRequestIds.incrementAndGet()
        positionJob?.cancel()
        val navigationRequestId = if (navigationLine == null) 0 else System.nanoTime()
        _filePreview.value = FilePreviewState(
            path = path,
            isLoading = true,
            navigationLine = navigationLine,
            navigationRequestId = navigationRequestId,
        )
        previewJob = scope.launch(ioDispatcher) {
            try {
                val preview = service.readFile(path)
                val shouldInspect = !preview.binary && preview.content.isNotEmpty()
                val markdownStructure = markdownDocumentStructure(path, preview.content)
                val pathLanguageId = sourceLanguageId(path)
                val contentState = FilePreviewState(
                    path = preview.path,
                    content = preview.content,
                    sizeBytes = preview.sizeBytes,
                    truncated = preview.truncated,
                    binary = preview.binary,
                    languageId = pathLanguageId,
                    symbols = markdownStructure.symbols,
                    foldingRanges = markdownStructure.foldingRanges,
                    isInspecting = shouldInspect,
                    navigationLine = navigationLine,
                    navigationRequestId = navigationRequestId,
                    draftContent = drafts[path],
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
                            symbols = (markdownStructure.symbols + insight.symbols).distinctBy { symbol ->
                                Triple(symbol.name, symbol.kind, symbol.line)
                            },
                            diagnostics = insight.diagnostics,
                            foldingRanges = (markdownStructure.foldingRanges + insight.foldingRanges).distinctBy { range ->
                                Triple(range.startLine, range.endLine, range.kind)
                            },
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

    fun inspectPosition(line: Int, character: Int) {
        val current = _filePreview.value
        val path = current.path ?: return
        if (current.binary || current.content.isEmpty()) return
        if (current.positionInsight?.let { it.line == line && it.character == character } == true) return
        val requestId = positionRequestIds.incrementAndGet()
        positionJob?.cancel()
        positionJob = scope.launch(ioDispatcher) {
            try {
                delay(POSITION_INSIGHT_DEBOUNCE_MILLIS)
                if (requestId != positionRequestIds.get() || _filePreview.value.path != path) return@launch
                _filePreview.value = _filePreview.value.copy(positionInsight = null, isInspectingPosition = true)
                val insight = service.inspectPosition(path, current.content, line, character)
                if (requestId == positionRequestIds.get() && _filePreview.value.path == path) {
                    _filePreview.value = _filePreview.value.copy(
                        positionInsight = insight,
                        isInspectingPosition = false,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                if (requestId == positionRequestIds.get() && _filePreview.value.path == path) {
                    _filePreview.value = _filePreview.value.copy(positionInsight = null, isInspectingPosition = false)
                }
            }
        }
    }

    fun clearPositionInsight() {
        positionRequestIds.incrementAndGet()
        positionJob?.cancel()
        _filePreview.value = _filePreview.value.copy(positionInsight = null, isInspectingPosition = false)
    }

    fun beginEditing() {
        val current = _filePreview.value
        val path = current.path ?: return
        if (current.binary || current.truncated || current.error != null) return
        val draft = drafts[path] ?: current.content
        drafts[path] = draft
        draftBaselines.putIfAbsent(path, current.content)
        updateDirtyPaths()
        _filePreview.value = current.copy(draftContent = draft)
    }

    fun updateDraft(content: String) {
        val current = _filePreview.value
        val path = current.path ?: return
        if (current.draftContent == null) return
        drafts[path] = content
        updateDirtyPaths()
        _filePreview.value = current.copy(draftContent = content, error = null)
    }

    fun cancelEditing() {
        val current = _filePreview.value
        val path = current.path ?: return
        drafts.remove(path)
        draftBaselines.remove(path)
        updateDirtyPaths()
        _filePreview.value = current.copy(draftContent = null, isSaving = false)
    }

    fun saveEditing() {
        val current = _filePreview.value
        val path = current.path ?: return
        val draft = current.draftContent ?: return
        if (current.isSaving) return
        _filePreview.value = current.copy(isSaving = true, error = null)
        scope.launch(ioDispatcher) {
            try {
                service.writeFile(path, draft)
                drafts.remove(path)
                draftBaselines.remove(path)
                updateDirtyPaths()
                selectFile(path, current.navigationLine, recordNavigation = false)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (_filePreview.value.path == path) {
                    _filePreview.value = _filePreview.value.copy(
                        isSaving = false,
                        error = error.message ?: "保存文件失败",
                    )
                }
            }
        }
    }

    private fun updateDirtyPaths() {
        _dirtyPaths.value = drafts.entries
            .asSequence()
            .filter { (path, content) -> draftBaselines[path] != content }
            .mapTo(linkedSetOf()) { it.key }
    }

    fun openDefinition(location: SourceLocation) {
        val root = java.io.File(projectPath).toPath().toRealPath()
        val target = runCatching { java.nio.file.Path.of(URI(location.uri)).toRealPath() }.getOrNull() ?: return
        if (!target.startsWith(root)) return
        selectFile(
            root.relativize(target).toString().replace('\\', '/'),
            navigationLine = location.line,
            recordNavigation = true,
        )
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
            selectFile(nextPath, navigationLine = null, recordNavigation = true)
        }
    }

    private fun recordEditorLocation(location: EditorLocation) {
        while (true) {
            val state = _navigationState.value
            if (state.current == location) return
            val next = state.copy(
                current = location,
                backStack = (state.backStack + listOfNotNull(state.current)).takeLast(MAX_NAVIGATION_PLACES),
                forwardStack = emptyList(),
            )
            if (_navigationState.compareAndSet(state, next)) return
        }
    }

    private fun navigateHistory(backward: Boolean) {
        while (true) {
            val state = _navigationState.value
            val target = (if (backward) state.backStack.lastOrNull() else state.forwardStack.lastOrNull())
                ?: return
            val current = state.current
            val next = if (backward) {
                state.copy(
                    current = target,
                    backStack = state.backStack.dropLast(1),
                    forwardStack = (state.forwardStack + listOfNotNull(current)).takeLast(MAX_NAVIGATION_PLACES),
                )
            } else {
                state.copy(
                    current = target,
                    backStack = (state.backStack + listOfNotNull(current)).takeLast(MAX_NAVIGATION_PLACES),
                    forwardStack = state.forwardStack.dropLast(1),
                )
            }
            if (_navigationState.compareAndSet(state, next)) {
                selectFile(target.path, target.line, recordNavigation = false)
                return
            }
        }
    }

    private companion object {
        const val MAX_OPEN_FILES = 12
        const val MAX_RECENT_FILES = 30
        const val MAX_NAVIGATION_PLACES = 64
        const val POSITION_INSIGHT_DEBOUNCE_MILLIS = 120L
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
