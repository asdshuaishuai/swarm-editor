package com.swarmeditor.desktop.viewmodel

import kotlin.test.Test
import kotlin.test.assertEquals

class MarkdownStructureTest {
    @Test
    fun `JetBrains markdown parser produces navigable heading symbols`() {
        val symbols = markdownOutlineSymbols(
            path = "README.md",
            content = """
                # Overview

                ## Setup ##

                Details

                Runtime
                =======
            """.trimIndent(),
        )

        assertEquals(listOf("Overview", "Setup", "Runtime"), symbols.map { it.name })
        assertEquals(listOf("Heading 1", "Heading 2", "Heading 1"), symbols.map { it.kind })
        assertEquals(listOf(null, "Overview", null), symbols.map { it.containerName })
        assertEquals(listOf(0, 2, 6), symbols.map { it.line })
    }

    @Test
    fun `JetBrains markdown parser produces section folding ranges`() {
        val structure = markdownDocumentStructure(
            path = "README.md",
            content = """
                # Overview

                ## Setup

                Details

                # Runtime
                Notes
            """.trimIndent(),
        )

        assertEquals(listOf(0 to 5, 2 to 5, 6 to 7), structure.foldingRanges.map { it.startLine to it.endLine })
    }

    @Test
    fun `non markdown files do not produce markdown symbols`() {
        assertEquals(emptyList(), markdownOutlineSymbols("Main.kt", "# Not a heading"))
    }

    @Test
    fun `source language ids are canonical for editor rendering`() {
        assertEquals("kotlin", sourceLanguageId("src/Main.kts"))
        assertEquals("markdown", sourceLanguageId("README.md"))
        assertEquals("html", sourceLanguageId("docs/index.htm"))
        assertEquals("typescript", sourceLanguageId("web/App.tsx"))
        assertEquals("json", sourceLanguageId("config/app.json"))
    }
}
