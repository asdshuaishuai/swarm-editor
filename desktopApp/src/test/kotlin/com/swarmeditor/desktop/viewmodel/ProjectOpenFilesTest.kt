package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ProjectService
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, ExperimentalPathApi::class)
class ProjectOpenFilesTest {
    @Test
    fun `closing active editor tab selects its nearest neighbor`() = runTest {
        val directory = Files.createTempDirectory("project-open-files")
        try {
            directory.resolve("First.kt").writeText("class First")
            directory.resolve("Second.kt").writeText("class Second")
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile()),
                backgroundScope,
                StandardTestDispatcher(testScheduler),
            )

            runCurrent()
            viewModel.selectFile("First.kt")
            runCurrent()
            viewModel.selectFile("Second.kt")
            runCurrent()

            assertEquals(listOf("First.kt", "Second.kt"), viewModel.openFiles.value)
            viewModel.closeFile("Second.kt")
            runCurrent()

            assertEquals(listOf("First.kt"), viewModel.openFiles.value)
            assertEquals("First.kt", viewModel.filePreview.value.path)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `recent files follow active editor order without reordering editor tabs`() = runTest {
        val directory = Files.createTempDirectory("project-recent-files")
        try {
            directory.resolve("First.kt").writeText("class First")
            directory.resolve("Second.kt").writeText("class Second")
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile()),
                backgroundScope,
                StandardTestDispatcher(testScheduler),
            )

            viewModel.selectFile("First.kt")
            runCurrent()
            viewModel.selectFile("Second.kt")
            runCurrent()
            viewModel.selectFile("First.kt")
            runCurrent()

            assertEquals(listOf("First.kt", "Second.kt"), viewModel.openFiles.value)
            assertEquals(listOf("First.kt", "Second.kt"), viewModel.recentFiles.value)

            viewModel.closeFile("First.kt")
            runCurrent()

            assertEquals(listOf("Second.kt", "First.kt"), viewModel.recentFiles.value)
        } finally {
            directory.deleteRecursively()
        }
    }
}
