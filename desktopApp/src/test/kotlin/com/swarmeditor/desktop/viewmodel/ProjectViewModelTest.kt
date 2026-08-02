package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSemanticHighlighter
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.withContext
import java.nio.file.Files
import java.io.File
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.createDirectories
import kotlin.io.path.createFile
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, ExperimentalPathApi::class)
class ProjectViewModelTest {
    @Test
    fun `loads real project tree and excludes internal directories`() = runTest {
        val directory = Files.createTempDirectory("project-vm")
        try {
            directory.resolve("src").createDirectories()
            directory.resolve("src/Main.kt").createFile()
            directory.resolve("build").createDirectories()
            directory.resolve("build/generated.kt").createFile()
            directory.resolve(".hidden").createFile()
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            runCurrent()
            viewModel.load()
            runCurrent()

            val tree = assertNotNull(viewModel.tree.value)
            assertFalse(viewModel.isLoading.value)
            assertEquals(directory.fileName.toString(), tree.name)
            assertTrue(tree.children.any { it.name == "src" })
            assertFalse(tree.children.any { it.name == "build" || it.name == ".hidden" })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `git status updates existing tree without filesystem reload`() = runTest {
        val directory = Files.createTempDirectory("project-git-state")
        try {
            directory.resolve("Main.kt").createFile()
            val dispatcher = StandardTestDispatcher(testScheduler)
            val gitStatus = MutableStateFlow(GitStatusDto())
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher, gitStatus)

            runCurrent()
            viewModel.load()
            runCurrent()
            gitStatus.value = GitStatusDto(
                modified = 1,
                changes = listOf(
                    GitFileChangeDto("Main.kt", "M", false, true, false, 1, 0)
                )
            )
            runCurrent()

            assertEquals("M", viewModel.tree.value?.children?.single()?.changeStatus)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `late project tree cannot replace a newer refresh`() = runTest {
        val directory = Files.createTempDirectory("project-tree-race")
        try {
            val firstStarted = CompletableDeferred<Unit>()
            val releaseFirst = CompletableDeferred<Unit>()
            var loadCount = 0
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                service = ProjectService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                loadTree = {
                    loadCount += 1
                    if (loadCount == 1) {
                        firstStarted.complete(Unit)
                        withContext(NonCancellable) { releaseFirst.await() }
                        ProjectService.FileNode("stale", "", isDirectory = true)
                    } else {
                        ProjectService.FileNode("current", "", isDirectory = true)
                    }
                },
            )

            viewModel.load()
            runCurrent()
            firstStarted.await()

            viewModel.load()
            runCurrent()

            assertEquals("current", viewModel.tree.value?.name)
            assertFalse(viewModel.isLoading.value)

            releaseFirst.complete(Unit)
            runCurrent()

            assertEquals("current", viewModel.tree.value?.name)
            assertFalse(viewModel.isLoading.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `project tree refresh failure preserves data and can recover`() = runTest {
        val directory = Files.createTempDirectory("project-tree-recovery")
        try {
            var loadCount = 0
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                service = ProjectService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                loadTree = {
                    loadCount += 1
                    when (loadCount) {
                        1 -> ProjectService.FileNode("initial", "", isDirectory = true)
                        2 -> error("temporary filesystem failure")
                        else -> ProjectService.FileNode("recovered", "", isDirectory = true)
                    }
                },
            )

            viewModel.load()
            runCurrent()
            assertEquals("initial", viewModel.tree.value?.name)

            viewModel.load()
            runCurrent()
            assertEquals("initial", viewModel.tree.value?.name)
            assertEquals("temporary filesystem failure", viewModel.treeError.value)
            assertFalse(viewModel.isLoading.value)

            viewModel.load()
            runCurrent()
            assertEquals("recovered", viewModel.tree.value?.name)
            assertEquals(null, viewModel.treeError.value)
            assertFalse(viewModel.isLoading.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `project tree hides symbolic link directories outside project root`() = runTest {
        val directory = Files.createTempDirectory("project-symlink")
        val external = Files.createTempDirectory("project-external")
        try {
            external.resolve("secret.txt").createFile()
            Files.createSymbolicLink(directory.resolve("linked"), external)

            val tree = ProjectService(directory.toFile()).getTree()

            assertFalse(tree.children.any { it.name == "linked" })
        } finally {
            directory.deleteRecursively()
            external.deleteRecursively()
        }
    }

    @Test
    fun `selected text file loads real preview content`() = runTest {
        val directory = Files.createTempDirectory("project-preview")
        try {
            directory.resolve("README.md").writeText("# Preview\nreal content")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            runCurrent()
            viewModel.selectFile("README.md")
            runCurrent()

            val preview = viewModel.filePreview.value
            assertEquals("README.md", preview.path)
            assertEquals("# Preview\nreal content", preview.content)
            assertFalse(preview.binary)
            assertFalse(preview.truncated)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `saving a source file persists content and refreshes semantic highlighting`() = runTest {
        val directory = Files.createTempDirectory("project-save-preview")
        try {
            directory.resolve("Main.kt").writeText("class Old")
            val highlightedContents = mutableListOf<String>()
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String): LspHighlightResult {
                    highlightedContents += content
                    return LspHighlightResult(languageId = "kotlin", serverName = "fake-kotlin-lsp")
                }
            }
            val dispatcher = StandardTestDispatcher(testScheduler)
            var savedCount = 0
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile(), highlighter),
                backgroundScope,
                dispatcher,
                onFileSaved = { savedCount++ },
            )

            runCurrent()
            viewModel.selectFile("Main.kt")
            runCurrent()
            viewModel.saveFile("class Updated")
            runCurrent()

            assertEquals("class Updated", directory.resolve("Main.kt").toFile().readText())
            assertEquals("class Updated", viewModel.filePreview.value.content)
            assertEquals("fake-kotlin-lsp", viewModel.filePreview.value.lspServer)
            assertEquals(listOf("class Old", "class Updated"), highlightedContents)
            assertEquals(1, savedCount)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `successful save keeps persisted content when follow-up refreshes fail`() = runTest {
        val directory = Files.createTempDirectory("project-save-refresh-failure")
        try {
            directory.resolve("Main.kt").writeText("class Old")
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String): LspHighlightResult {
                    if (content == "class Updated") error("language server unavailable")
                    return LspHighlightResult(languageId = "kotlin", serverName = "fake-kotlin-lsp")
                }
            }
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile(), highlighter),
                backgroundScope,
                dispatcher,
                onFileSaved = { error("git refresh unavailable") },
            )

            runCurrent()
            viewModel.selectFile("Main.kt")
            runCurrent()
            viewModel.saveFile("class Updated")
            runCurrent()

            val preview = viewModel.filePreview.value
            assertEquals("class Updated", directory.resolve("Main.kt").toFile().readText())
            assertEquals("class Updated", preview.content)
            assertFalse(preview.isSaving)
            assertContains(preview.error.orEmpty(), "文件已保存")
            assertContains(preview.error.orEmpty(), "git refresh unavailable")
            assertContains(preview.error.orEmpty(), "language server unavailable")
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `semantic highlighting metadata reaches file preview state`() = runTest {
        val directory = Files.createTempDirectory("project-semantic-preview")
        try {
            directory.resolve("Main.kt").writeText("class Main")
            val expectedHighlight = SemanticHighlight(
                line = 0,
                startCharacter = 0,
                length = 5,
                tokenType = "class",
                modifiers = setOf("declaration"),
            )
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String) = LspHighlightResult(
                    languageId = "kotlin",
                    serverName = "fake-kotlin-lsp",
                    highlights = listOf(expectedHighlight),
                    message = "semantic tokens ready",
                )
            }
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile(), highlighter),
                backgroundScope,
                dispatcher,
            )

            runCurrent()
            viewModel.selectFile("Main.kt")
            runCurrent()

            val preview = viewModel.filePreview.value
            assertEquals("kotlin", preview.languageId)
            assertEquals("fake-kotlin-lsp", preview.lspServer)
            assertEquals(listOf(expectedHighlight), preview.semanticHighlights)
            assertEquals("semantic tokens ready", preview.lspMessage)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `LSP symbols and diagnostics reach file preview navigation state`() = runTest {
        val directory = Files.createTempDirectory("project-preview-insight")
        try {
            directory.resolve("Main.kt").writeText("class Main")
            val symbol = SourceSymbol("Main", "Class", 0)
            val diagnostic = SourceDiagnostic(0, "warning", "Example warning")
            val intelligence = object : SourceCodeIntelligence {
                override suspend fun highlight(file: File, content: String) = LspHighlightResult("kotlin")

                override suspend fun inspect(file: File, content: String) = LspDocumentInsight(
                    languageId = "kotlin",
                    serverName = "fake-kotlin-lsp",
                    symbols = listOf(symbol),
                    diagnostics = listOf(diagnostic),
                )
            }
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile(), intelligence),
                backgroundScope,
                dispatcher,
            )

            runCurrent()
            viewModel.selectFile("Main.kt")
            runCurrent()

            val preview = viewModel.filePreview.value
            assertEquals(listOf(symbol), preview.symbols)
            assertEquals(listOf(diagnostic), preview.diagnostics)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `late semantic result cannot replace a newer file preview`() = runTest {
        val directory = Files.createTempDirectory("project-preview-race")
        try {
            directory.resolve("First.kt").writeText("class First")
            directory.resolve("Second.kt").writeText("class Second")
            val firstStarted = CompletableDeferred<Unit>()
            val releaseFirst = CompletableDeferred<Unit>()
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String): LspHighlightResult {
                    if (file.name == "First.kt") {
                        firstStarted.complete(Unit)
                        withContext(NonCancellable) { releaseFirst.await() }
                    }
                    return LspHighlightResult(
                        languageId = "kotlin",
                        serverName = file.name,
                    )
                }
            }
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                ProjectService(directory.toFile(), highlighter),
                backgroundScope,
                dispatcher,
            )

            runCurrent()
            viewModel.selectFile("First.kt")
            runCurrent()
            firstStarted.await()

            viewModel.selectFile("Second.kt")
            runCurrent()
            assertEquals("Second.kt", viewModel.filePreview.value.path)

            releaseFirst.complete(Unit)
            runCurrent()

            val preview = viewModel.filePreview.value
            assertEquals("Second.kt", preview.path)
            assertEquals("class Second", preview.content)
            assertEquals("Second.kt", preview.lspServer)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `file preview rejects symlink escaping project root`() = runTest {
        val directory = Files.createTempDirectory("project-preview-root")
        val external = Files.createTempFile("project-preview-external", ".txt")
        try {
            external.writeText("secret")
            Files.createSymbolicLink(directory.resolve("outside.txt"), external)

            assertFailsWith<IllegalArgumentException> {
                ProjectService(directory.toFile()).readFile("outside.txt")
            }
        } finally {
            directory.deleteRecursively()
            Files.deleteIfExists(external)
        }
    }

    @Test
    fun `project tree hides symlinks escaping project root`() {
        val directory = Files.createTempDirectory("project-tree-root")
        val external = Files.createTempFile("project-tree-external", ".txt")
        try {
            Files.createSymbolicLink(directory.resolve("outside.txt"), external)

            val tree = ProjectService(directory.toFile()).getTree()

            assertFalse(tree.children.any { it.name == "outside.txt" })
        } finally {
            directory.deleteRecursively()
            Files.deleteIfExists(external)
        }
    }

    @Test
    fun `file editing rejects symlink escaping project root`() {
        val directory = Files.createTempDirectory("project-edit-root")
        val external = Files.createTempFile("project-edit-external", ".txt")
        try {
            external.writeText("secret")
            Files.createSymbolicLink(directory.resolve("outside.txt"), external)

            assertFailsWith<IllegalArgumentException> {
                ProjectService(directory.toFile()).writeFile("outside.txt", "changed")
            }
            assertEquals("secret", Files.readString(external))
        } finally {
            directory.deleteRecursively()
            Files.deleteIfExists(external)
        }
    }
}
