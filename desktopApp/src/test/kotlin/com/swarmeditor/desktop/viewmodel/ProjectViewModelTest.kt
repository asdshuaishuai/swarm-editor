package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSemanticHighlighter
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.lsp.WorkspaceSourceSymbol
import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.api.ProjectSpecGraphDto
import com.swarmeditor.desktop.api.ProjectSpecNodeDto
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
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
    fun `spec graph loading exposes nodes and recovers from loader failure`() = runTest {
        val directory = Files.createTempDirectory("project-spec-graph-vm")
        try {
            var loadCount = 0
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                service = ProjectService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                loadSpecGraphData = {
                    loadCount += 1
                    if (loadCount == 1) {
                        ProjectSpecGraphDto(
                            nodes = listOf(
                                ProjectSpecNodeDto(
                                    id = "architecture",
                                    type = "design",
                                    title = "Architecture",
                                    path = "architecture.md",
                                )
                            )
                        )
                    } else {
                        error("spec read failed")
                    }
                },
            )

            viewModel.loadSpecGraph()
            assertTrue(viewModel.specGraph.value.isLoading)
            runCurrent()
            assertEquals("architecture", viewModel.specGraph.value.graph?.nodes?.single()?.id)
            assertFalse(viewModel.specGraph.value.isLoading)

            viewModel.loadSpecGraph()
            runCurrent()
            assertEquals("spec read failed", viewModel.specGraph.value.error)
            assertFalse(viewModel.specGraph.value.isLoading)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `workspace symbol search debounces and rejects stale results`() = runTest {
        val directory = Files.createTempDirectory("project-workspace-symbol-vm")
        try {
            val firstStarted = CompletableDeferred<Unit>()
            val releaseFirst = CompletableDeferred<Unit>()
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(
                service = ProjectService(directory.toFile()),
                scope = backgroundScope,
                ioDispatcher = dispatcher,
                searchWorkspaceSymbols = { query ->
                    if (query == "Pro") {
                        firstStarted.complete(Unit)
                        withContext(NonCancellable) { releaseFirst.await() }
                    }
                    listOf(WorkspaceSourceSymbol(query, "class", "$query.kt", 0))
                },
            )

            viewModel.updateWorkspaceSymbolQuery("P")
            assertFalse(viewModel.workspaceSymbolSearch.value.isSearching)
            viewModel.updateWorkspaceSymbolQuery("Pro")
            advanceTimeBy(180)
            runCurrent()
            firstStarted.await()
            viewModel.updateWorkspaceSymbolQuery("Project")
            advanceTimeBy(180)
            runCurrent()
            assertEquals("Project", viewModel.workspaceSymbolSearch.value.symbols.single().name)

            releaseFirst.complete(Unit)
            runCurrent()
            assertEquals("Project", viewModel.workspaceSymbolSearch.value.query)
            assertEquals("Project", viewModel.workspaceSymbolSearch.value.symbols.single().name)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `find in files debounces queries and exposes navigable source matches`() = runTest {
        val directory = Files.createTempDirectory("project-search-vm")
        try {
            directory.resolve("src").createDirectories()
            directory.resolve("src/Main.kt").writeText("fun main() = println(\"swarm\")")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            viewModel.updateSearchQuery("swa")
            viewModel.updateSearchQuery("swarm")
            runCurrent()
            assertTrue(viewModel.searchState.value.isSearching)

            advanceTimeBy(180)
            runCurrent()

            val state = viewModel.searchState.value
            assertFalse(state.isSearching)
            assertEquals("swarm", state.query)
            assertEquals("src/Main.kt", state.matches.single().path)
            assertEquals(0, state.matches.single().line)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `find in files reruns immediately when case sensitivity changes`() = runTest {
        val directory = Files.createTempDirectory("project-search-case-vm")
        try {
            directory.resolve("README.md").writeText("Swarm swarm")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            viewModel.updateSearchQuery("Swarm")
            advanceTimeBy(180)
            runCurrent()
            assertEquals(2, viewModel.searchState.value.matches.size)

            viewModel.toggleSearchCaseSensitive()
            runCurrent()

            assertTrue(viewModel.searchState.value.caseSensitive)
            assertEquals(1, viewModel.searchState.value.matches.size)
        } finally {
            directory.deleteRecursively()
        }
    }

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
    fun `editing saves atomically and reloads the source preview`() = runTest {
        val directory = Files.createTempDirectory("project-edit")
        try {
            val file = directory.resolve("Main.kt")
            file.writeText("class Before")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            viewModel.selectFile("Main.kt")
            runCurrent()
            viewModel.beginEditing()
            assertTrue(viewModel.dirtyPaths.value.isEmpty())
            viewModel.updateDraft("class After")
            assertEquals(setOf("Main.kt"), viewModel.dirtyPaths.value)
            viewModel.saveEditing()
            runCurrent()

            assertEquals("class After", file.toFile().readText())
            assertEquals("class After", viewModel.filePreview.value.content)
            assertEquals(null, viewModel.filePreview.value.draftContent)
            assertTrue(viewModel.dirtyPaths.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `dirty marker clears when draft returns to persisted content`() = runTest {
        val directory = Files.createTempDirectory("project-dirty-state")
        try {
            directory.resolve("Main.kt").writeText("class Main")
            val dispatcher = StandardTestDispatcher(testScheduler)
            val viewModel = ProjectViewModel(ProjectService(directory.toFile()), backgroundScope, dispatcher)

            viewModel.selectFile("Main.kt")
            runCurrent()
            viewModel.beginEditing()
            viewModel.updateDraft("class Changed")
            assertEquals(setOf("Main.kt"), viewModel.dirtyPaths.value)

            viewModel.updateDraft("class Main")

            assertTrue(viewModel.dirtyPaths.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `source content renders before code intelligence completes`() = runTest {
        val directory = Files.createTempDirectory("project-progressive-preview")
        try {
            directory.resolve("Main.kt").writeText("class Main")
            val inspectionStarted = CompletableDeferred<Unit>()
            val releaseInspection = CompletableDeferred<Unit>()
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String): LspHighlightResult {
                    inspectionStarted.complete(Unit)
                    releaseInspection.await()
                    return LspHighlightResult(languageId = "kotlin", serverName = "fake-kotlin-lsp")
                }
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
            inspectionStarted.await()

            val contentPreview = viewModel.filePreview.value
            assertEquals("class Main", contentPreview.content)
            assertFalse(contentPreview.isLoading)
            assertTrue(contentPreview.isInspecting)

            releaseInspection.complete(Unit)
            runCurrent()

            val enrichedPreview = viewModel.filePreview.value
            assertFalse(enrichedPreview.isInspecting)
            assertEquals("fake-kotlin-lsp", enrichedPreview.lspServer)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `code intelligence failure keeps readable source content`() = runTest {
        val directory = Files.createTempDirectory("project-preview-lsp-failure")
        try {
            directory.resolve("Main.kt").writeText("class Main")
            val highlighter = object : SourceSemanticHighlighter {
                override suspend fun highlight(file: File, content: String): LspHighlightResult =
                    error("language server unavailable")
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
            assertEquals("class Main", preview.content)
            assertFalse(preview.isLoading)
            assertFalse(preview.isInspecting)
            assertEquals(null, preview.error)
            assertContains(preview.lspMessage.orEmpty(), "language server unavailable")
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
