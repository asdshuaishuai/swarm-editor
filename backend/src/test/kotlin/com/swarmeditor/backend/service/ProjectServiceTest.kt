package com.swarmeditor.backend.service

import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.lsp.WorkspaceSourceSymbol
import com.swarmeditor.backend.spec.ProjectSpecGraphScanner
import com.swarmeditor.common.model.ContextEvidenceKind
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProjectServiceTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project service exposes the current read-only spec graph`() = runTest {
        val directory = Files.createTempDirectory("project-service-spec-graph")
        try {
            Files.writeString(
                directory.resolve("architecture.md"),
                """
                ---
                id: architecture
                type: design
                title: Architecture
                ---
                """.trimIndent(),
            )
            val service = ProjectService(directory.toFile(), specGraphScanner = ProjectSpecGraphScanner())

            val graph = service.getSpecGraph()

            assertEquals(listOf("architecture"), graph.nodes.map { it.id })
            assertTrue(graph.diagnostics.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project code inspection returns semantic symbols and diagnostics`() = runTest {
        val directory = Files.createTempDirectory("project-service-insight")
        try {
            directory.resolve("Main.kt").toFile().writeText("class Main")
            val highlight = SemanticHighlight(0, 0, 5, "class")
            val symbol = SourceSymbol("Main", "Class", 0)
            val diagnostic = SourceDiagnostic(0, "warning", "Example warning")
            val intelligence = object : SourceCodeIntelligence {
                override suspend fun highlight(file: File, content: String) = LspHighlightResult("kotlin")

                override suspend fun inspect(file: File, content: String) = LspDocumentInsight(
                    languageId = "kotlin",
                    serverName = "test-lsp",
                    highlights = listOf(highlight),
                    symbols = listOf(symbol),
                    diagnostics = listOf(diagnostic),
                )
            }
            val service = ProjectService(directory.toFile(), intelligence)

            val insight = service.inspectFile("Main.kt", "class Main")!!

            assertEquals("test-lsp", insight.serverName)
            assertEquals(listOf(highlight), insight.highlights)
            assertEquals(listOf(symbol), insight.symbols)
            assertEquals(listOf(diagnostic), insight.diagnostics)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `workspace symbol search keeps only navigable project files`() = runTest {
        val directory = Files.createTempDirectory("project-service-workspace-symbol")
        val external = Files.createTempFile("project-service-external-symbol", ".kt")
        try {
            val source = directory.resolve("src/Main.kt")
            Files.createDirectories(source.parent)
            Files.writeString(source, "class Main")
            val intelligence = object : SourceCodeIntelligence {
                override suspend fun highlight(file: File, content: String) = LspHighlightResult("kotlin")
                override suspend fun inspect(file: File, content: String) = LspDocumentInsight("kotlin")
                override suspend fun searchWorkspaceSymbols(query: String, maxResults: Int) = listOf(
                    WorkspaceSourceSymbol("Main", "class", source.toUri().toString(), 0),
                    WorkspaceSourceSymbol("External", "class", external.toUri().toString(), 0),
                    WorkspaceSourceSymbol("Malformed", "class", "https://example.com/Main.kt", 0),
                )
            }

            val symbols = ProjectService(directory.toFile(), intelligence).searchWorkspaceSymbols("Main")

            assertEquals(listOf("src/Main.kt"), symbols.map(WorkspaceSourceSymbol::uri))
        } finally {
            Files.deleteIfExists(external)
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `context evidence aggregates project search symbols and spec metadata`() = runTest {
        val directory = Files.createTempDirectory("project-service-context-evidence")
        try {
            val source = directory.resolve("src/Main.kt")
            Files.createDirectories(source.parent)
            Files.writeString(source, "class Main")
            Files.writeString(
                directory.resolve("architecture.md"),
                """
                ---
                id: main-architecture
                type: design
                title: Main architecture
                ---
                """.trimIndent(),
            )
            val intelligence = object : SourceCodeIntelligence {
                override suspend fun highlight(file: File, content: String) = LspHighlightResult("kotlin")
                override suspend fun inspect(file: File, content: String) = LspDocumentInsight("kotlin")
                override suspend fun searchWorkspaceSymbols(query: String, maxResults: Int) = listOf(
                    WorkspaceSourceSymbol("Main", "class", source.toUri().toString(), 0, 0),
                )
            }

            val bundle = ProjectService(directory.toFile(), intelligence).collectContextEvidence("Main")

            assertTrue(bundle.evidence.any { it.kind == ContextEvidenceKind.TEXT_MATCH })
            assertEquals(1, bundle.evidence.count { it.kind == ContextEvidenceKind.SOURCE_SYMBOL })
            assertEquals(1, bundle.evidence.count { it.kind == ContextEvidenceKind.SPEC_NODE })
            assertTrue(bundle.evidence.all { it.queryFingerprint == bundle.queryFingerprint })
            assertTrue(bundle.queryFingerprint.matches(Regex("[0-9a-f]{64}")))
            assertEquals("src/Main.kt", bundle.evidence.first { it.kind == ContextEvidenceKind.SOURCE_SYMBOL }.path)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `context evidence retries broad search when path filtered query is empty`() = runTest {
        val directory = Files.createTempDirectory("project-service-context-retry")
        try {
            Files.createDirectories(directory.resolve("src"))
            Files.writeString(directory.resolve("docs.md"), "Swarm context")

            val bundle = ProjectService(directory.toFile()).collectContextEvidence(
                query = "Swarm",
                pathPrefix = "src",
                broadRetryBudget = 1,
            )

            assertTrue(bundle.broadSearchRetried)
            assertEquals(1, bundle.retryCount)
            assertEquals(listOf("docs.md"), bundle.evidence.mapNotNull { it.path })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project tree paths remain relative and openable across directory depths`() {
        val directory = Files.createTempDirectory("project-service-tree-paths")
        try {
            val source = directory.resolve("src/main/kotlin/App.kt")
            Files.createDirectories(source.parent)
            Files.writeString(source, "fun main() = Unit")
            val service = ProjectService(directory.toFile())

            val tree = service.getTree()
            val src = tree.children.single { it.name == "src" }
            val main = src.children.single { it.name == "main" }
            val kotlin = main.children.single { it.name == "kotlin" }
            val app = kotlin.children.single { it.name == "App.kt" }

            assertEquals(".", tree.path)
            assertEquals("src", src.path)
            assertEquals("src/main", main.path)
            assertEquals("src/main/kotlin", kotlin.path)
            assertEquals("src/main/kotlin/App.kt", app.path)
            assertEquals("fun main() = Unit", service.readFile(app.path).content)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `invalid UTF-8 files are never exposed as editable text`() {
        val directory = Files.createTempDirectory("project-service-invalid-utf8")
        try {
            val file = directory.resolve("legacy.txt")
            val original = byteArrayOf(0xC3.toByte(), 0x28)
            Files.write(file, original)
            val service = ProjectService(directory.toFile())

            val preview = service.readFile("legacy.txt")
            val error = assertFailsWith<IllegalArgumentException> {
                service.writeFile("legacy.txt", "replacement")
            }

            assertTrue(preview.binary)
            assertEquals("", preview.content)
            assertContains(error.message.orEmpty(), "UTF-8")
            assertTrue(original.contentEquals(Files.readAllBytes(file)))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `truncated UTF-8 preview discards only an incomplete trailing code point`() {
        val directory = Files.createTempDirectory("project-service-truncated-utf8")
        try {
            val prefix = ByteArray(MAX_PROJECT_FILE_BYTES - 1) { 'a'.code.toByte() }
            val file = directory.resolve("large.txt")
            Files.write(file, prefix + "€tail".toByteArray())
            val service = ProjectService(directory.toFile())

            val preview = service.readFile("large.txt")

            assertTrue(preview.truncated)
            assertFalse(preview.binary)
            assertEquals(MAX_PROJECT_FILE_BYTES - 1, preview.content.length)
            assertTrue(preview.content.all { it == 'a' })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `backend rejects overwriting files that were only partially previewed`() {
        val directory = Files.createTempDirectory("project-service-large-write")
        try {
            val file = directory.resolve("large.txt")
            val original = ByteArray(MAX_PROJECT_FILE_BYTES + 1) { 'x'.code.toByte() }
            Files.write(file, original)
            val service = ProjectService(directory.toFile())

            val error = assertFailsWith<IllegalArgumentException> {
                service.writeFile("large.txt", "small replacement")
            }

            assertContains(error.message.orEmpty(), "Truncated")
            assertTrue(original.contentEquals(Files.readAllBytes(file)))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project text search returns precise matches across searchable source files`() = runTest {
        val directory = Files.createTempDirectory("project-service-search")
        try {
            val source = directory.resolve("src/Main.kt")
            Files.createDirectories(source.parent)
            Files.writeString(source, "fun main() {\n    println(\"Swarm swarm\")\n}")
            Files.writeString(directory.resolve("README.md"), "SWARM editor")
            Files.createDirectories(directory.resolve("build"))
            Files.writeString(directory.resolve("build/generated.kt"), "swarm")
            Files.write(directory.resolve("binary.dat"), byteArrayOf(0, 1, 2, 3))
            val service = ProjectService(directory.toFile())

            val result = service.searchText("swarm")

            assertEquals(3, result.matches.size)
            assertEquals(2, result.filesSearched)
            assertFalse(result.truncated)
            assertEquals(
                listOf(
                    ProjectService.SearchMatch("src/Main.kt", 1, 13, 18, "    println(\"Swarm swarm\")"),
                    ProjectService.SearchMatch("src/Main.kt", 1, 19, 24, "    println(\"Swarm swarm\")"),
                    ProjectService.SearchMatch("README.md", 0, 0, 5, "SWARM editor"),
                ),
                result.matches,
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project text search honors case and bounded result limits`() = runTest {
        val directory = Files.createTempDirectory("project-service-search-limit")
        try {
            Files.writeString(directory.resolve("matches.txt"), "Swarm swarm swarm")
            val service = ProjectService(directory.toFile())

            val sensitive = service.searchText("Swarm", caseSensitive = true)
            val limited = service.searchText("swarm", maxMatches = 2)

            assertEquals(listOf(0), sensitive.matches.map { it.startCharacter })
            assertEquals(2, limited.matches.size)
            assertTrue(limited.truncated)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `project reads follow the active project directory provider`() {
        val directory = Files.createTempDirectory("project-service-active")
        try {
            val first = directory.resolve("first").toFile().apply { mkdirs() }
            val second = directory.resolve("second").toFile().apply { mkdirs() }
            File(first, "active.txt").writeText("first")
            File(second, "active.txt").writeText("second")
            var activeDirectory = first
            val service = ProjectService(first, projectDirProvider = { activeDirectory })

            assertEquals("first", service.readFile("active.txt").content)
            activeDirectory = second
            assertEquals("second", service.readFile("active.txt").content)
            assertEquals(second.canonicalPath, service.projectPath)
        } finally {
            directory.deleteRecursively()
        }
    }
}
