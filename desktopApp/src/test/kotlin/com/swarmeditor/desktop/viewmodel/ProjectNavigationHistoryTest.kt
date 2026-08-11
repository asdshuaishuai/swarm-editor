package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.ProjectService
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, ExperimentalPathApi::class)
class ProjectNavigationHistoryTest {
    @Test
    fun `editor navigation preserves back and forward locations including source lines`() = runTest {
        val directory = Files.createTempDirectory("project-navigation-history")
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
            viewModel.navigateToFile("Second.kt", 12)
            runCurrent()

            assertEquals(EditorLocation("Second.kt", 12), viewModel.navigationState.value.current)
            assertEquals(
                listOf(EditorLocation("First.kt"), EditorLocation("Second.kt")),
                viewModel.navigationState.value.backStack,
            )

            viewModel.navigateBack()
            runCurrent()
            assertEquals(EditorLocation("Second.kt"), viewModel.navigationState.value.current)
            assertEquals("Second.kt", viewModel.filePreview.value.path)
            assertTrue(viewModel.navigationState.value.canNavigateForward)

            viewModel.navigateBack()
            runCurrent()
            assertEquals(EditorLocation("First.kt"), viewModel.navigationState.value.current)

            viewModel.navigateForward()
            runCurrent()
            assertEquals(EditorLocation("Second.kt"), viewModel.navigationState.value.current)
            assertEquals(listOf(EditorLocation("Second.kt", 12)), viewModel.navigationState.value.forwardStack)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `new navigation clears the forward stack`() = runTest {
        val directory = Files.createTempDirectory("project-navigation-forward")
        try {
            listOf("First.kt", "Second.kt", "Third.kt").forEach { name ->
                directory.resolve(name).writeText("class ${name.substringBefore('.')} ")
            }
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile()),
                backgroundScope,
                StandardTestDispatcher(testScheduler),
            )

            viewModel.selectFile("First.kt")
            viewModel.selectFile("Second.kt")
            viewModel.navigateBack()
            runCurrent()
            assertTrue(viewModel.navigationState.value.canNavigateForward)

            viewModel.selectFile("Third.kt")
            runCurrent()

            assertFalse(viewModel.navigationState.value.canNavigateForward)
            assertEquals(EditorLocation("Third.kt"), viewModel.navigationState.value.current)
        } finally {
            directory.deleteRecursively()
        }
    }
}
