package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.GitService
import java.io.File
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

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
}

private fun runGit(directory: File, vararg args: String) {
    val process = ProcessBuilder(listOf("git") + args.toList())
        .directory(directory)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText()
    check(process.waitFor() == 0) { "git ${args.joinToString(" ")} failed: $output" }
}
