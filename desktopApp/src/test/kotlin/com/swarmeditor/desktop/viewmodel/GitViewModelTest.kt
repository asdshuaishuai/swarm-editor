package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.GitService
import com.swarmeditor.desktop.api.GitCommitChangeDto
import java.io.File
import java.nio.file.Files
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, ExperimentalPathApi::class)
class GitViewModelTest {
    @Test
    fun `refresh history exposes commits and commit operation reloads log`() = runTest {
        val directory = Files.createTempDirectory("git-view-model-history")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "viewmodel@example.com")
            runGit(root, "config", "user.name", "ViewModel Author")
            File(root, "notes.txt").writeText("initial\n")
            runGit(root, "add", "notes.txt")
            runGit(root, "commit", "-qm", "Initial commit")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = GitViewModel(GitService(root), backgroundScope, dispatcher)

            viewModel.refreshHistory()
            runCurrent()

            assertFalse(viewModel.isHistoryLoading.value)
            assertEquals("Initial commit", viewModel.history.value.commits.single().subject)

            File(root, "notes.txt").appendText("next\n")
            runGit(root, "add", "notes.txt")
            viewModel.setCommitMessage("Second commit")
            viewModel.commit()
            runCurrent()

            assertEquals("Second commit", viewModel.history.value.commits.first().subject)
            assertEquals(2, viewModel.history.value.commits.size)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `commit selection rejects stale results and reuses immutable caches`() = runTest {
        val directory = Files.createTempDirectory("git-view-model-selection")
        val dispatcher = Executors.newFixedThreadPool(2).asCoroutineDispatcher()
        try {
            val firstHash = "a".repeat(40)
            val secondHash = "b".repeat(40)
            val firstStarted = CountDownLatch(1)
            val releaseFirst = CountDownLatch(1)
            val calls = ConcurrentHashMap<String, Int>()
            val viewModel = GitViewModel(
                service = GitService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                commitChangesLoader = { hash ->
                    calls.compute(hash) { _, count -> (count ?: 0) + 1 }
                    if (hash == firstHash) {
                        firstStarted.countDown()
                        releaseFirst.await()
                    }
                    GitService.GitCommitChanges(
                        commitHash = hash,
                        changes = listOf(GitService.GitCommitChange("$hash.txt", status = "M", added = 1, removed = 0)),
                    )
                },
            )

            viewModel.selectCommit(firstHash)
            assertEquals(true, firstStarted.await(5, java.util.concurrent.TimeUnit.SECONDS))
            viewModel.selectCommit(secondHash)
            withTimeout(5_000) {
                viewModel.commitSelection.filter { it.commitHash == secondHash && !it.isLoading }.first()
            }
            releaseFirst.countDown()
            Thread.sleep(50)

            assertEquals(secondHash, viewModel.commitSelection.value.commitHash)
            assertEquals("$secondHash.txt", viewModel.commitSelection.value.changes.single().path)
            viewModel.selectCommit(secondHash)
            assertEquals(1, calls[secondHash])
        } finally {
            dispatcher.close()
            directory.deleteRecursively()
        }
    }

    @Test
    fun `historical diff cache survives drawer dismissal`() = runTest {
        val directory = Files.createTempDirectory("git-view-model-diff-cache")
        try {
            val dispatcher = StandardTestDispatcher(testScheduler)
            var calls = 0
            val hash = "c".repeat(40)
            val change = GitCommitChangeDto("notes.txt", status = "M", added = 1, removed = 0)
            val viewModel = GitViewModel(
                service = GitService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                commitDiffLoader = { _, _, _ ->
                    calls++
                    listOf("@@ -1 +1,2 @@", " before", "+after")
                },
            )

            viewModel.openHistoricalDiff(hash, change)
            runCurrent()
            assertEquals("+after", viewModel.historicalDiff.value.diffLines.last())
            viewModel.dismissHistoricalDiff()
            viewModel.openHistoricalDiff(hash, change)
            runCurrent()

            assertEquals(1, calls)
            assertFalse(viewModel.historicalDiff.value.isLoading)
        } finally {
            directory.deleteRecursively()
        }
    }
}

private fun runGit(directory: File, vararg args: String) {
    val process = ProcessBuilder(listOf("git") + args.toList())
        .directory(directory)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText()
    check(process.waitFor() == 0) { "git ${args.joinToString(" ")} failed: $output" }
}
