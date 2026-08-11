package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.GitService
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitCommitDto
import com.swarmeditor.desktop.api.GitHistoryDto
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
    private val historyMutex = Mutex()
    private val _status = MutableStateFlow(GitStatusDto())
    val status: StateFlow<GitStatusDto> = _status.asStateFlow()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    private val _commitMessage = MutableStateFlow("")
    val commitMessage: StateFlow<String> = _commitMessage.asStateFlow()
    private val _history = MutableStateFlow(GitHistoryDto())
    val history: StateFlow<GitHistoryDto> = _history.asStateFlow()
    private val _isHistoryLoading = MutableStateFlow(false)
    val isHistoryLoading: StateFlow<Boolean> = _isHistoryLoading.asStateFlow()
    private val eventChannel = Channel<String>(Channel.BUFFERED)
    val errorEvents = eventChannel.receiveAsFlow()
    private val successChannel = Channel<String>(Channel.BUFFERED)
    val successEvents = successChannel.receiveAsFlow()

    fun refresh() {
        scope.launch(ioDispatcher) { refreshLocked() }
    }

    fun refreshHistory() {
        scope.launch(ioDispatcher) { refreshHistoryLocked() }
    }

    fun stage(path: String) {
        mutate(path) { service.stage(it) }
    }

    fun stageAll(paths: Collection<String>) {
        runOperation("Git 暂存失败") { service.stage(paths) }
    }

    fun unstage(path: String) {
        mutate(path) { service.unstage(it) }
    }

    fun unstageAll(paths: Collection<String>) {
        runOperation("Git 取消暂存失败") { service.unstage(paths) }
    }

    fun setCommitMessage(message: String) {
        _commitMessage.value = message
    }

    fun commit() {
        val message = _commitMessage.value
        runOperation("Git 提交失败", refreshHistory = true) {
            val commitHash = service.commit(message)
            _commitMessage.value = ""
            successChannel.trySend("已提交 ${commitHash.ifBlank { "HEAD" }}")
        }
    }

    private fun mutate(path: String, action: (String) -> Unit) {
        runOperation("Git 操作失败") { action(path) }
    }

    private fun runOperation(
        fallbackMessage: String,
        refreshHistory: Boolean = false,
        action: () -> Unit,
    ) {
        scope.launch(ioDispatcher) {
            operationMutex.withLock {
                _isLoading.value = true
                try {
                    action()
                    _status.value = service.getStatus().toDto()
                    if (refreshHistory) {
                        historyMutex.withLock { _history.value = service.getHistory().toDto() }
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    eventChannel.send(error.message ?: fallbackMessage)
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

    private suspend fun refreshHistoryLocked() {
        historyMutex.withLock {
            _isHistoryLoading.value = true
            try {
                _history.value = service.getHistory().toDto()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(error.message ?: "读取 Git 历史失败")
            } finally {
                _isHistoryLoading.value = false
            }
        }
    }
}

private fun GitService.GitStatus.toDto() = GitStatusDto(
    isRepository = isRepository,
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
            stagedAdded = change.stagedAdded,
            stagedRemoved = change.stagedRemoved,
            unstagedAdded = change.unstagedAdded,
            unstagedRemoved = change.unstagedRemoved,
            diffLines = change.diffLines,
            stagedDiffLines = change.stagedDiffLines,
            unstagedDiffLines = change.unstagedDiffLines,
        )
    }
)

private fun GitService.GitHistory.toDto() = GitHistoryDto(
    commits = commits.map { commit ->
        GitCommitDto(
            hash = commit.hash,
            shortHash = commit.shortHash,
            parentHashes = commit.parentHashes,
            authorName = commit.authorName,
            authorEmail = commit.authorEmail,
            authoredAtEpochSeconds = commit.authoredAtEpochSeconds,
            subject = commit.subject,
            refs = commit.refs,
        )
    },
    truncated = truncated,
)
