package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.GitService
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class GitViewModel(
    private val service: GitService,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    private val operationMutex = Mutex()
    private val _status = MutableStateFlow(GitStatusDto())
    val status: StateFlow<GitStatusDto> = _status.asStateFlow()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    private val eventChannel = Channel<String>(Channel.BUFFERED)
    val errorEvents = eventChannel.receiveAsFlow()

    fun refresh() {
        scope.launch(ioDispatcher) { refreshLocked() }
    }

    fun stage(path: String) {
        mutate(path) { service.stage(it) }
    }

    fun stageAll(paths: Collection<String>) {
        scope.launch(ioDispatcher) {
            operationMutex.withLock {
                _isLoading.value = true
                try {
                    service.stage(paths)
                    _status.value = service.getStatus().toDto()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    eventChannel.send(error.message ?: "Git 暂存失败")
                } finally {
                    _isLoading.value = false
                }
            }
        }
    }

    fun unstage(path: String) {
        mutate(path) { service.unstage(it) }
    }

    private fun mutate(path: String, action: (String) -> Unit) {
        scope.launch(ioDispatcher) {
            operationMutex.withLock {
                _isLoading.value = true
                try {
                    action(path)
                    _status.value = service.getStatus().toDto()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    eventChannel.send(error.message ?: "Git 操作失败")
                } finally {
                    _isLoading.value = false
                }
            }
        }
    }

    private suspend fun refreshLocked() {
        operationMutex.withLock {
            _isLoading.value = true
            try {
                _status.value = service.getStatus().toDto()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(error.message ?: "读取 Git 状态失败")
            } finally {
                _isLoading.value = false
            }
        }
    }
}

private fun GitService.GitStatus.toDto() = GitStatusDto(
    branch = branch,
    ahead = ahead,
    behind = behind,
    staged = staged,
    modified = modified,
    untracked = untracked,
    changes = changes.map { change ->
        GitFileChangeDto(
            path = change.path,
            status = change.status,
            hasStagedChanges = change.hasStagedChanges,
            hasUnstagedChanges = change.hasUnstagedChanges,
            isUntracked = change.isUntracked,
            added = change.added,
            removed = change.removed,
            diffLines = change.diffLines
        )
    }
)
