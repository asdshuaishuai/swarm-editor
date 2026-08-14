package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.WorkspaceService
import com.swarmeditor.common.model.ProjectWorkspaceKind
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

data class WorkspaceOption(
    val id: String,
    val label: String,
    val cwd: String,
    val branch: String?,
    val kind: ProjectWorkspaceKind,
    val active: Boolean,
)

data class WorkspaceUiState(
    val workspaces: List<WorkspaceOption> = emptyList(),
    val activeWorkspaceId: String? = null,
    val isLoading: Boolean = false,
    val isSelecting: Boolean = false,
    val error: String? = null,
)

data class WorkspaceActionEvent(val message: String, val type: ToastType)

class WorkspaceViewModel(
    private val service: WorkspaceService,
    private val projectRoot: File,
    private val scope: CoroutineScope,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO,
    private val onWorkspaceChanged: suspend () -> Unit = {},
) {
    private val _state = MutableStateFlow(WorkspaceUiState())
    val state: StateFlow<WorkspaceUiState> = _state.asStateFlow()
    private val events = Channel<WorkspaceActionEvent>(Channel.BUFFERED)
    val actionEvents = events.receiveAsFlow()
    private var loadJob: Job? = null
    private var selectJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        _state.value = _state.value.copy(isLoading = true, error = null)
        loadJob = scope.launch(ioDispatcher) {
            try {
                val workspaceState = service.list(projectRoot)
                _state.value = workspaceState.toUiState()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = error.message ?: "无法加载工作区",
                )
            }
        }
    }

    fun select(workspaceId: String) {
        if (workspaceId == _state.value.activeWorkspaceId || _state.value.isSelecting) return
        selectJob?.cancel()
        _state.value = _state.value.copy(isSelecting = true, error = null)
        selectJob = scope.launch(ioDispatcher) {
            try {
                service.select(projectRoot, workspaceId)
                onWorkspaceChanged()
                refreshState()
                events.send(WorkspaceActionEvent("已切换工作区", ToastType.SUCCESS))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _state.value = _state.value.copy(isSelecting = false, error = error.message ?: "工作区切换失败")
                events.send(WorkspaceActionEvent(error.message ?: "工作区切换失败", ToastType.ERROR))
            } finally {
                _state.update { it.copy(isSelecting = false) }
            }
        }
    }

    fun createManagedWorktree(branch: String) {
        if (_state.value.isSelecting) return
        runMutation(
            successMessage = "已创建并切换工作区",
            operation = {
                val workspace = service.createManagedWorktree(projectRoot, branch)
                service.select(projectRoot, workspace.id)
            },
        )
    }

    fun attachExistingWorktree(worktree: File) {
        if (_state.value.isSelecting) return
        runMutation(
            successMessage = "已挂载并切换工作区",
            operation = {
                val workspace = service.attachExistingWorktree(projectRoot, worktree)
                service.select(projectRoot, workspace.id)
            },
        )
    }

    fun remove(workspaceId: String) {
        if (_state.value.isSelecting) return
        runMutation(
            successMessage = "工作区已移除",
            operation = { service.remove(projectRoot, workspaceId) },
        )
    }

    private fun runMutation(successMessage: String, operation: suspend () -> Unit) {
        _state.value = _state.value.copy(isSelecting = true, error = null)
        selectJob?.cancel()
        selectJob = scope.launch(ioDispatcher) {
            try {
                operation()
                onWorkspaceChanged()
                refreshState()
                events.send(WorkspaceActionEvent(successMessage, ToastType.SUCCESS))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _state.value = _state.value.copy(error = error.message ?: "工作区操作失败")
                events.send(WorkspaceActionEvent(error.message ?: "工作区操作失败", ToastType.ERROR))
            } finally {
                _state.update { it.copy(isSelecting = false) }
            }
        }
    }

    private suspend fun refreshState() {
        _state.value = service.list(projectRoot).toUiState()
    }
}

private fun com.swarmeditor.common.model.ProjectWorkspaceState.toUiState(): WorkspaceUiState {
    return WorkspaceUiState(
        workspaces = workspaces.map { workspace ->
            WorkspaceOption(
                id = workspace.id,
                label = workspace.branch ?: if (workspace.kind == ProjectWorkspaceKind.DEFAULT) "默认工作区" else File(workspace.cwd).name,
                cwd = workspace.cwd,
                branch = workspace.branch,
                kind = workspace.kind,
                active = workspace.id == activeWorkspaceId,
            )
        },
        activeWorkspaceId = activeWorkspaceId,
    )
}
