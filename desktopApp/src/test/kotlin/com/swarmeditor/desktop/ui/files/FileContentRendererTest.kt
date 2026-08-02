package com.swarmeditor.desktop.ui.files

import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.desktop.theme.AgentGemini
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue
import javax.swing.SwingUtilities
import javax.swing.text.Element
import javax.swing.text.StyleConstants
import javax.swing.text.html.HTML
import javax.swing.text.html.HTMLDocument
import org.fife.ui.rsyntaxtextarea.RSyntaxTextArea
import java.net.URI
import java.net.URL
import java.net.URLConnection
import java.net.URLStreamHandler
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class FileContentRendererTest {
    @Test
    fun `JVM editor maps Kotlin and Java to dedicated syntax modes`() {
        assertEquals("text/kotlin", sourceSyntaxStyle("kotlin"))
        assertEquals("text/java", sourceSyntaxStyle("java"))
        assertEquals("text/typescript", sourceSyntaxStyle("tsx"))
        assertEquals("text/plain", sourceSyntaxStyle("swift"))
    }

    @Test
    fun `local source viewer is read only and keeps line numbers`() = onSwingThread {
        val scroll = createSourceEditorPane(
            value = "fun main() = Unit",
            languageId = "kotlin",
            onValueChange = {},
            onSave = {},
            editable = false,
        )
        val editor = scroll.viewport.view as RSyntaxTextArea

        assertFalse(editor.isEditable)
        assertEquals("text/kotlin", editor.syntaxEditingStyle)
        assertTrue(scroll.lineNumbersEnabled)
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
    fun `code intelligence navigation clamps LSP lines to source bounds`() {
        assertNull(normalizedNavigationIndex(null, 10))
        assertNull(normalizedNavigationIndex(0, 0))
        assertEquals(0, normalizedNavigationIndex(-3, 10))
        assertEquals(4, normalizedNavigationIndex(4, 10))
        assertEquals(9, normalizedNavigationIndex(42, 10))
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
    fun `unchanged HTML preview keeps its Swing document and caret`() = onSwingThread {
        val content = "<html><body><p>Hello</p><p>World</p></body></html>"
        val editor = createHtmlPreviewPane(content)
        val originalDocument = editor.document
        editor.caretPosition = editor.document.length.coerceAtMost(4)
        val originalCaret = editor.caretPosition

        val changed = updateHtmlPreviewContent(editor, content)

        assertFalse(changed)
        assertSame(originalDocument, editor.document)
        assertEquals(originalCaret, editor.caretPosition)
    }

    @Test
    fun `changed HTML preview replaces content and resets caret`() = onSwingThread {
        val editor = createHtmlPreviewPane("<p>Old</p>")
        editor.caretPosition = editor.document.length

        val changed = updateHtmlPreviewContent(editor, "<p>New</p>")

        assertTrue(changed)
        assertContains(editor.text, "New")
        assertEquals(0, editor.caretPosition)
    }

    @Test
    fun `HTML preview blocks image resource loading`() = onSwingThread {
        val editor = createHtmlPreviewPane("<html><body><img src='https://example.com/tracker.png'></body></html>")
        val document = editor.document as HTMLDocument
        val imageElement = findHtmlElement(document.defaultRootElement, HTML.Tag.IMG)
        val view = (editor.editorKit as SafeHtmlEditorKit).viewFactory.create(imageElement)

        assertTrue(view is BlockedHtmlImageView)
        assertNull(view.imageURL)
        assertNull(view.image)
    }

    @Test
    fun `HTML preview ignores external stylesheet imports`() = onSwingThread {
        var connectionOpened = false
        val url = URL.of(URI.create("blocked://stylesheet"), object : URLStreamHandler() {
            override fun openConnection(url: URL): URLConnection {
                connectionOpened = true
                error("external stylesheet connection must not open")
            }
        })
        val editor = createHtmlPreviewPane("<p>Safe</p>")
        val styleSheet = (editor.editorKit as SafeHtmlEditorKit).styleSheet

        styleSheet.importStyleSheet(url)

        assertFalse(connectionOpened)
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

    private fun onSwingThread(block: () -> Unit) {
        if (SwingUtilities.isEventDispatchThread()) {
            block()
        } else {
            SwingUtilities.invokeAndWait(block)
        }
    }

    private fun findHtmlElement(root: Element, tag: HTML.Tag): Element {
        if (root.attributes.getAttribute(StyleConstants.NameAttribute) == tag) return root
        for (index in 0 until root.elementCount) {
            runCatching { findHtmlElement(root.getElement(index), tag) }.getOrNull()?.let { return it }
        }
        error("HTML element not found: $tag")
    }
}
