package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.GitService
import com.swarmeditor.desktop.api.GitCommitChangeDto
import com.swarmeditor.desktop.api.GitCommitChangesDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitCommitDto
import com.swarmeditor.desktop.api.GitHistoryDto
import com.swarmeditor.desktop.api.GitStatusDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

data class GitCommitSelectionState(
    val commitHash: String? = null,
    val changes: List<GitCommitChangeDto> = emptyList(),
    val truncated: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class HistoricalGitDiffState(
    val commitHash: String? = null,
    val change: GitCommitChangeDto? = null,
    val diffLines: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

private data class HistoricalDiffKey(
    val commitHash: String,
    val path: String,
    val previousPath: String?,
)

class GitViewModel(
    private val service: GitService,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val commitChangesLoader: (String) -> GitService.GitCommitChanges = { hash ->
        service.getCommitChanges(hash)
    },
    private val commitDiffLoader: (String, String, String?) -> List<String> = service::getCommitFileDiff,
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
    private val _commitSelection = MutableStateFlow(GitCommitSelectionState())
    val commitSelection: StateFlow<GitCommitSelectionState> = _commitSelection.asStateFlow()
    private val _historicalDiff = MutableStateFlow(HistoricalGitDiffState())
    val historicalDiff: StateFlow<HistoricalGitDiffState> = _historicalDiff.asStateFlow()
    private val commitChangesCache = ConcurrentHashMap<String, GitCommitChangesDto>()
    private val commitDiffCache = ConcurrentHashMap<HistoricalDiffKey, List<String>>()
    private val commitSelectionRequestId = AtomicLong()
    private val historicalDiffRequestId = AtomicLong()
    private var commitSelectionJob: Job? = null
    private var historicalDiffJob: Job? = null
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

    fun selectCommit(commitHash: String?) {
        val normalizedHash = commitHash?.trim()?.takeIf(String::isNotEmpty)
        val requestId = commitSelectionRequestId.incrementAndGet()
        commitSelectionJob?.cancel()
        if (normalizedHash == null) {
            _commitSelection.value = GitCommitSelectionState()
            dismissHistoricalDiff()
            return
        }
        if (_historicalDiff.value.commitHash != null && _historicalDiff.value.commitHash != normalizedHash) {
            dismissHistoricalDiff()
        }
        commitChangesCache[normalizedHash]?.let { cached ->
            _commitSelection.value = cached.toSelectionState()
            return
        }

        _commitSelection.value = GitCommitSelectionState(commitHash = normalizedHash, isLoading = true)
        commitSelectionJob = scope.launch(ioDispatcher) {
            try {
                val loaded = commitChangesLoader(normalizedHash).toDto()
                commitChangesCache[normalizedHash] = loaded
                if (commitSelectionRequestId.get() == requestId) {
                    _commitSelection.value = loaded.toSelectionState()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (commitSelectionRequestId.get() == requestId) {
                    _commitSelection.value = GitCommitSelectionState(
                        commitHash = normalizedHash,
                        error = error.message ?: "读取提交变更失败",
                    )
                }
            }
        }
    }

    fun openHistoricalDiff(commitHash: String, change: GitCommitChangeDto) {
        val key = HistoricalDiffKey(commitHash, change.path, change.previousPath)
        val requestId = historicalDiffRequestId.incrementAndGet()
        historicalDiffJob?.cancel()
        commitDiffCache[key]?.let { cached ->
            _historicalDiff.value = HistoricalGitDiffState(commitHash, change, cached)
            return
        }

        _historicalDiff.value = HistoricalGitDiffState(commitHash, change, isLoading = true)
        historicalDiffJob = scope.launch(ioDispatcher) {
            try {
                val diffLines = commitDiffLoader(commitHash, change.path, change.previousPath)
                commitDiffCache[key] = diffLines
                if (historicalDiffRequestId.get() == requestId) {
                    _historicalDiff.value = HistoricalGitDiffState(commitHash, change, diffLines)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (historicalDiffRequestId.get() == requestId) {
                    _historicalDiff.value = HistoricalGitDiffState(
                        commitHash = commitHash,
                        change = change,
                        error = error.message ?: "读取历史 Diff 失败",
                    )
                }
            }
        }
    }

    fun dismissHistoricalDiff() {
        historicalDiffRequestId.incrementAndGet()
        historicalDiffJob?.cancel()
        historicalDiffJob = null
        _historicalDiff.value = HistoricalGitDiffState()
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

private fun GitService.GitCommitChanges.toDto() = GitCommitChangesDto(
    commitHash = commitHash,
    changes = changes.map { change ->
        GitCommitChangeDto(
            path = change.path,
            previousPath = change.previousPath,
            status = change.status,
            added = change.added,
            removed = change.removed,
        )
    },
    truncated = truncated,
)

private fun GitCommitChangesDto.toSelectionState() = GitCommitSelectionState(
    commitHash = commitHash,
    changes = changes,
    truncated = truncated,
)
