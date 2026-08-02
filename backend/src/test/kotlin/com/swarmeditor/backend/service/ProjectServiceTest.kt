package com.swarmeditor.backend.service

import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSymbol
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
}
