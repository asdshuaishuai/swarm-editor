package com.swarmeditor.desktop.ui.files

import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceFoldingRange
import com.swarmeditor.desktop.theme.AgentGemini
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class FileContentRendererTest {
    @Test
    fun `startup render preference only opts into preview explicitly`() {
        assertEquals(FileRenderMode.PREVIEW, initialFileRenderMode("preview"))
        assertEquals(FileRenderMode.PREVIEW, initialFileRenderMode("PREVIEW"))
        assertEquals(FileRenderMode.SPLIT, initialFileRenderMode("split"))
        assertEquals(FileRenderMode.SPLIT, initialFileRenderMode("SPLIT"))
        assertEquals(FileRenderMode.SOURCE, initialFileRenderMode(null))
        assertEquals(FileRenderMode.SOURCE, initialFileRenderMode("source"))
    }

    @Test
    fun `rendered preview requires a complete supported text file`() {
        assertTrue(supportsRenderedPreview("README.md", binary = false, truncated = false))
        assertTrue(supportsRenderedPreview("page.HTML", binary = false, truncated = false))
        assertFalse(supportsRenderedPreview("data.json", binary = false, truncated = true))
        assertFalse(supportsRenderedPreview("README.md", binary = true, truncated = false))
        assertFalse(supportsRenderedPreview("Main.kt", binary = false, truncated = false))
    }

    @Test
    fun `split preview resize follows drag and preserves usable panes`() {
        assertEquals(0.6f, resizedSplitFraction(current = 0.5f, dragAmountPx = 100f, widthPx = 1_000))
        assertEquals(0.25f, resizedSplitFraction(current = 0.5f, dragAmountPx = -800f, widthPx = 1_000))
        assertEquals(0.75f, resizedSplitFraction(current = 0.5f, dragAmountPx = 800f, widthPx = 1_000))
        assertEquals(0.5f, resizedSplitFraction(current = 0.5f, dragAmountPx = 100f, widthPx = 0))
    }

    @Test
    fun `code intelligence navigation clamps LSP lines to source bounds`() {
        assertNull(normalizedNavigationIndex(null, 10))
        assertNull(normalizedNavigationIndex(0, 0))
        assertEquals(0, normalizedNavigationIndex(-3, 10))
        assertEquals(4, normalizedNavigationIndex(4, 10))
        assertEquals(9, normalizedNavigationIndex(42, 10))
    }

    @Test
    fun `source folding hides inclusive LSP ranges and keeps the opening line`() {
        val ranges = normalizedFoldingRanges(
            ranges = listOf(
                SourceFoldingRange(startLine = 1, endLine = 4, kind = "region"),
                SourceFoldingRange(startLine = 1, endLine = 3),
                SourceFoldingRange(startLine = 8, endLine = 20),
            ),
            lineCount = 10,
        )

        assertEquals(
            listOf(
                SourceFoldingRange(startLine = 1, endLine = 4, kind = "region"),
                SourceFoldingRange(startLine = 8, endLine = 9),
            ),
            ranges,
        )
        assertEquals(
            listOf(
                VisibleSourceLine(0),
                VisibleSourceLine(1, hiddenLineCount = 3),
                VisibleSourceLine(5),
                VisibleSourceLine(6),
                VisibleSourceLine(7),
                VisibleSourceLine(8),
                VisibleSourceLine(9),
            ),
            visibleSourceLines(
                lineCount = 10,
                foldingByStart = ranges.associateBy(SourceFoldingRange::startLine),
                collapsedStarts = setOf(1),
            ),
        )
    }

    @Test
    fun `kotlin comment marker inside a string is ignored`() {
        assertNull(findLineCommentStart("val color = \"#31c7ff\"", "kotlin"))
        assertNull(findLineCommentStart("val endpoint = \"https://example.com\"", "kotlin"))
    }

    @Test
    fun `kotlin line comment starts outside quoted content`() {
        val line = "val endpoint = \"https://example.com\" // production"

        assertEquals(line.indexOf("// production"), findLineCommentStart(line, "kotlin"))
    }

    @Test
    fun `python hash comment starts after quoted hashes`() {
        val line = "tag = '#release' # publish marker"

        assertEquals(line.indexOf("# publish marker"), findLineCommentStart(line, "python"))
    }

    @Test
    fun `markdown headings and json values are not comments`() {
        assertNull(findLineCommentStart("# Repository Guidelines", "markdown"))
        assertNull(findLineCommentStart("{\"url\": \"https://example.com\"}", "json"))
    }

    @Test
    fun `escaped quotes do not terminate strings early`() {
        val line = "val message = \"quoted \\\"// text\\\"\" // actual"

        assertEquals(line.indexOf("// actual"), findLineCommentStart(line, "kotlin"))
    }

    @Test
    fun `HTML preview renders readable text without active content`() {
        val rendered = htmlPreviewText(
            "<style>body { display:none }</style><h1>Title</h1><p>Hello &amp; welcome<br>Next</p><script>alert(1)</script>",
        )

        assertEquals("Title\nHello & welcome\nNext", rendered)
    }

    @Test
    fun `HTML preview blocks active content and produces structured blocks`() {
        val content =
            """
                <html><body onclick="run()"><h1>Title</h1><img src="https://example.com/a.png">
                <p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul>
                <script>alert(1)</script><iframe src="file:///etc/passwd"></iframe></body></html>
            """.trimIndent()
        val sanitized = sanitizeHtmlPreviewContent(content)
        val blocks = parseHtmlPreviewBlocks(content)

        assertFalse(sanitized.contains("onclick", ignoreCase = true))
        assertFalse(sanitized.contains("<script", ignoreCase = true))
        assertFalse(sanitized.contains("<iframe", ignoreCase = true))
        assertFalse(sanitized.contains("src=", ignoreCase = true))
        assertEquals(
            listOf(
                HtmlPreviewBlock(HtmlBlockKind.HEADING_1, "Title"),
                HtmlPreviewBlock(HtmlBlockKind.PARAGRAPH, "Hello world"),
                HtmlPreviewBlock(HtmlBlockKind.LIST_ITEM, "One"),
                HtmlPreviewBlock(HtmlBlockKind.LIST_ITEM, "Two"),
            ),
            blocks,
        )
    }

    @Test
    fun `json preview flattens deeply nested documents without recursive overflow`() {
        var document: JsonElement = JsonPrimitive("leaf")
        repeat(10_000) { level ->
            document = JsonObject(linkedMapOf("level-$level" to document))
        }

        val rows = flattenJson(document)

        assertEquals(10_001, rows.size)
        assertEquals(0, rows.first().depth)
        assertEquals(10_000, rows.last().depth)
        assertEquals("\"leaf\"", rows.last().value)
    }

    @Test
    fun `json preview preserves order and reports its node budget`() {
        val document = kotlinx.serialization.json.JsonArray(
            List(5) { index -> JsonPrimitive(index) },
        )

        val rows = flattenJson(document, maxRows = 3)

        assertEquals(listOf("$", "[0]", "[1]", "预览已截断"), rows.map(JsonRow::key))
        assertEquals(JsonKind.TRUNCATED, rows.last().kind)
        assertEquals("仅显示前 3 个节点", rows.last().value)
    }

    @Test
    fun `json preview does not report truncation at the exact node budget`() {
        val document = kotlinx.serialization.json.JsonArray(
            List(2) { index -> JsonPrimitive(index) },
        )

        val rows = flattenJson(document, maxRows = 3)

        assertEquals(listOf("$", "[0]", "[1]"), rows.map(JsonRow::key))
        assertFalse(rows.any { it.kind == JsonKind.TRUNCATED })
    }

    @Test
    fun `json preview reports invalid input without throwing`() {
        val rows = parseJsonRows("{invalid")

        assertEquals(1, rows.size)
        assertEquals(JsonKind.ERROR, rows.single().kind)
        assertEquals("解析失败", rows.single().key)
    }

    @Test
    fun `json preview caps visual indentation for deeply nested values`() {
        assertEquals(0, jsonIndentDp(-5))
        assertEquals(54, jsonIndentDp(3))
        assertEquals(576, jsonIndentDp(10_000))
    }

    @Test
    fun `semantic highlighting overrides lexical style for declared functions`() {
        val highlighted = highlightSourceLine(
            line = "fun build() = Unit",
            languageId = "kotlin",
            semantic = listOf(
                SemanticHighlight(
                    line = 0,
                    startCharacter = 4,
                    length = 5,
                    tokenType = "function",
                    modifiers = setOf("declaration"),
                ),
            ),
        )

        val functionStyle = highlighted.spanStyles.last { it.start == 4 && it.end == 9 }.item
        assertEquals(AgentGemini, functionStyle.color)
    }
}
