package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.backend.lsp.SemanticHighlight
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
    private val onFileSaved: () -> Unit = {},
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
        val lspMessage: String? = null,
        val isLoading: Boolean = false,
        val isSaving: Boolean = false,
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
        val requestId = previewRequestIds.incrementAndGet()
        previewJob?.cancel()
        _filePreview.value = FilePreviewState(path = path, isLoading = true)
        previewJob = scope.launch(ioDispatcher) {
            try {
                val preview = service.readFile(path)
                val semantic = if (!preview.binary && preview.content.isNotEmpty()) {
                    service.highlightFile(path, preview.content)
                } else {
                    null
                }
                val state = FilePreviewState(
                    path = preview.path,
                    content = preview.content,
                    sizeBytes = preview.sizeBytes,
                    truncated = preview.truncated,
                    binary = preview.binary,
                    languageId = semantic?.languageId ?: path.substringAfterLast('.', "").lowercase(),
                    lspServer = semantic?.serverName,
                    semanticHighlights = semantic?.highlights.orEmpty(),
                    lspMessage = semantic?.message,
                )
                if (requestId == previewRequestIds.get()) _filePreview.value = state
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

    fun saveFile(content: String) {
        val current = _filePreview.value
        val path = current.path ?: return
        if (current.binary || current.truncated || current.isLoading || current.isSaving) return

        val requestId = previewRequestIds.incrementAndGet()
        previewJob?.cancel()
        _filePreview.value = current.copy(isSaving = true, error = null)
        previewJob = scope.launch(ioDispatcher) {
            try {
                val preview = service.writeFile(path, content)
                val persistedState = FilePreviewState(
                    path = preview.path,
                    content = preview.content,
                    sizeBytes = preview.sizeBytes,
                    truncated = preview.truncated,
                    binary = preview.binary,
                    languageId = path.substringAfterLast('.', "").lowercase(),
                )
                if (requestId == previewRequestIds.get()) _filePreview.value = persistedState

                val refreshFailures = mutableListOf<String>()
                try {
                    onFileSaved()
                } catch (error: Throwable) {
                    refreshFailures += "变更刷新失败: ${error.message ?: error::class.simpleName}"
                }
                val semantic = try {
                    service.highlightFile(path, preview.content)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    refreshFailures += "语义高亮失败: ${error.message ?: error::class.simpleName}"
                    null
                }
                val state = persistedState.copy(
                    languageId = semantic?.languageId ?: persistedState.languageId,
                    lspServer = semantic?.serverName,
                    semanticHighlights = semantic?.highlights.orEmpty(),
                    lspMessage = semantic?.message,
                    error = refreshFailures.takeIf(List<String>::isNotEmpty)
                        ?.joinToString(prefix = "文件已保存，但", separator = "；"),
                )
                if (requestId == previewRequestIds.get()) _filePreview.value = state
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (requestId == previewRequestIds.get()) {
                    _filePreview.value = current.copy(error = error.message ?: "无法保存文件")
                }
            }
        }
    }
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
