package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.HorizontalScrollbar
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.SwingPanel
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.m3.Markdown
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AcLight
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AgentKimi
import com.swarmeditor.desktop.theme.AgentQwen
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.R6
import com.swarmeditor.desktop.theme.R8
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.WarnLight
import com.swarmeditor.desktop.theme.surfaceInput
import com.swarmeditor.desktop.viewmodel.ProjectViewModel
import java.awt.Color as AwtColor
import java.awt.Font
import java.awt.Insets
import java.awt.Toolkit
import java.awt.event.ActionEvent
import java.net.URL
import javax.swing.AbstractAction
import javax.swing.BorderFactory
import javax.swing.JEditorPane
import javax.swing.KeyStroke
import javax.swing.JScrollPane
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.text.Element
import javax.swing.text.StyleConstants
import javax.swing.text.ViewFactory
import javax.swing.text.html.HTML
import javax.swing.text.html.HTMLEditorKit
import javax.swing.text.html.ImageView
import javax.swing.text.html.StyleSheet
import org.fife.ui.rsyntaxtextarea.RSyntaxTextArea
import org.fife.ui.rsyntaxtextarea.SyntaxConstants
import org.fife.ui.rsyntaxtextarea.Theme
import org.fife.ui.rtextarea.RTextScrollPane
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class FileRenderMode { SOURCE, PREVIEW }

@Composable
internal fun FileContentRenderer(
    preview: ProjectViewModel.FilePreviewState,
    onSave: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val extension = preview.path.orEmpty().substringAfterLast('.', "").lowercase()
    val supportsPreview = supportsRenderedPreview(preview.path, preview.binary, preview.truncated)
    var mode by remember(preview.path) { mutableStateOf(FileRenderMode.SOURCE) }
    val effectiveMode = if (supportsPreview) mode else FileRenderMode.SOURCE
    var editing by remember(preview.path) { mutableStateOf(false) }
    var draft by remember(preview.path) { mutableStateOf(preview.content) }
    val canEdit = !preview.binary && !preview.truncated
    val saveDraft = {
        if (!preview.isSaving && draft != preview.content) onSave(draft)
    }

    Column(modifier) {
        Row(
            modifier = Modifier.fillMaxWidth().height(38.dp).background(Bg1).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RenderModeTab("源码", effectiveMode == FileRenderMode.SOURCE) { mode = FileRenderMode.SOURCE }
            if (supportsPreview) {
                Spacer(Modifier.width(6.dp))
                RenderModeTab("预览", mode == FileRenderMode.PREVIEW) { mode = FileRenderMode.PREVIEW }
            }
            if (effectiveMode == FileRenderMode.SOURCE && canEdit) {
                Spacer(Modifier.width(6.dp))
                RenderModeTab(if (editing) "取消" else "编辑", editing) {
                    editing = !editing
                    if (!editing) draft = preview.content
                }
                if (editing) {
                    Spacer(Modifier.width(6.dp))
                    RenderModeTab(if (preview.isSaving) "保存中…" else "保存", false) {
                        saveDraft()
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            val status = when {
                preview.isSaving -> "正在原子保存…"
                preview.error != null -> preview.error
                else -> null
            }
            if (!status.isNullOrBlank()) {
                Text(status, color = if (preview.error != null) ErrLight else Tx3, fontSize = 10.sp, maxLines = 1)
            }
        }
        Box(Modifier.fillMaxSize().background(Bg0)) {
            when {
                effectiveMode == FileRenderMode.SOURCE && editing -> SourceEditorPane(
                    value = draft,
                    languageId = preview.languageId,
                    onValueChange = { draft = it },
                    onSave = saveDraft,
                    canSave = !preview.isSaving && draft != preview.content,
                )
                effectiveMode == FileRenderMode.SOURCE -> SourceCodePane(preview)
                extension in setOf("md", "markdown") -> MarkdownPreview(preview.content)
                extension in setOf("html", "htm") -> HtmlPreview(preview.content)
                extension == "json" -> JsonPreview(preview.content)
                else -> SourceCodePane(preview)
            }
        }
    }
}

internal fun supportsRenderedPreview(path: String?, binary: Boolean, truncated: Boolean): Boolean {
    if (binary || truncated) return false
    return path.orEmpty().substringAfterLast('.', "").lowercase() in RENDERED_PREVIEW_EXTENSIONS
}

@Composable
private fun SourceEditorPane(
    value: String,
    languageId: String,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    canSave: Boolean,
    modifier: Modifier = Modifier,
) {
    val latestOnValueChange by rememberUpdatedState(onValueChange)
    val latestOnSave by rememberUpdatedState(onSave)
    val latestCanSave by rememberUpdatedState(canSave)
    SwingPanel(
        modifier = modifier.fillMaxSize().padding(10.dp),
        background = Bg1,
        factory = {
            createSourceEditorPane(
                value = value,
                languageId = languageId,
                onValueChange = { latestOnValueChange(it) },
                onSave = { if (latestCanSave) latestOnSave() },
            )
        },
        update = { scroll ->
            val editor = scroll.viewport.view as? RSyntaxTextArea ?: return@SwingPanel
            val style = sourceSyntaxStyle(languageId)
            if (editor.syntaxEditingStyle != style) editor.syntaxEditingStyle = style
            if (editor.text != value) {
                val caret = editor.caretPosition.coerceAtMost(value.length)
                editor.putClientProperty(SOURCE_EDITOR_UPDATING_PROPERTY, true)
                editor.text = value
                editor.caretPosition = caret
                editor.putClientProperty(SOURCE_EDITOR_UPDATING_PROPERTY, false)
            }
        },
    )
}

private const val SOURCE_EDITOR_UPDATING_PROPERTY = "swarm.sourceEditorUpdating"

internal fun sourceSyntaxStyle(languageId: String): String = when (languageId.lowercase()) {
    "kotlin", "kt", "kts" -> SyntaxConstants.SYNTAX_STYLE_KOTLIN
    "java" -> SyntaxConstants.SYNTAX_STYLE_JAVA
    "typescript", "ts", "tsx" -> SyntaxConstants.SYNTAX_STYLE_TYPESCRIPT
    "javascript", "js", "jsx" -> SyntaxConstants.SYNTAX_STYLE_JAVASCRIPT
    "python", "py" -> SyntaxConstants.SYNTAX_STYLE_PYTHON
    "rust", "rs" -> SyntaxConstants.SYNTAX_STYLE_RUST
    "go" -> SyntaxConstants.SYNTAX_STYLE_GO
    "c", "h" -> SyntaxConstants.SYNTAX_STYLE_C
    "cpp", "cc", "cxx", "hpp" -> SyntaxConstants.SYNTAX_STYLE_CPLUSPLUS
    "csharp", "cs" -> SyntaxConstants.SYNTAX_STYLE_CSHARP
    "dart" -> SyntaxConstants.SYNTAX_STYLE_DART
    "php", "phtml" -> SyntaxConstants.SYNTAX_STYLE_PHP
    "ruby", "rb" -> SyntaxConstants.SYNTAX_STYLE_RUBY
    "json", "jsonl" -> SyntaxConstants.SYNTAX_STYLE_JSON
    "html", "htm" -> SyntaxConstants.SYNTAX_STYLE_HTML
    "xml" -> SyntaxConstants.SYNTAX_STYLE_XML
    "css", "scss" -> SyntaxConstants.SYNTAX_STYLE_CSS
    "less" -> SyntaxConstants.SYNTAX_STYLE_LESS
    "sql" -> SyntaxConstants.SYNTAX_STYLE_SQL
    "sh", "bash", "zsh", "fish" -> SyntaxConstants.SYNTAX_STYLE_UNIX_SHELL
    "yaml", "yml" -> SyntaxConstants.SYNTAX_STYLE_YAML
    "markdown", "md", "mdx" -> SyntaxConstants.SYNTAX_STYLE_MARKDOWN
    else -> SyntaxConstants.SYNTAX_STYLE_NONE
}

internal fun createSourceEditorPane(
    value: String,
    languageId: String,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    editable: Boolean = true,
): RTextScrollPane {
    val editor = RSyntaxTextArea(30, 100).apply {
        RSyntaxTextArea::class.java.getResourceAsStream("/org/fife/ui/rsyntaxtextarea/themes/dark.xml")
            ?.use { Theme.load(it).apply(this) }
        syntaxEditingStyle = sourceSyntaxStyle(languageId)
        text = value
        isEditable = editable
        isCodeFoldingEnabled = true
        antiAliasingEnabled = true
        tabsEmulated = true
        tabSize = 4
        font = Font(Font.MONOSPACED, Font.PLAIN, 13)
        background = AwtColor(14, 20, 30)
        foreground = AwtColor(222, 229, 238)
        caretColor = AwtColor(111, 168, 255)
        selectionColor = AwtColor(66, 105, 160)
        selectedTextColor = AwtColor(245, 248, 252)
        currentLineHighlightColor = AwtColor(20, 29, 42)
        matchedBracketBGColor = AwtColor(50, 68, 96)
        matchedBracketBorderColor = AwtColor(111, 168, 255)
        margin = Insets(10, 12, 10, 12)
        border = BorderFactory.createEmptyBorder()
        if (editable) {
            document.addDocumentListener(object : DocumentListener {
                override fun insertUpdate(event: DocumentEvent) = publish()
                override fun removeUpdate(event: DocumentEvent) = publish()
                override fun changedUpdate(event: DocumentEvent) = publish()

                private fun publish() {
                    if (getClientProperty(SOURCE_EDITOR_UPDATING_PROPERTY) != true) onValueChange(text)
                }
            })
            val shortcutMask = Toolkit.getDefaultToolkit().menuShortcutKeyMaskEx
            inputMap.put(KeyStroke.getKeyStroke('S'.code, shortcutMask), "swarm-save")
            actionMap.put("swarm-save", object : AbstractAction() {
                override fun actionPerformed(event: ActionEvent?) = onSave()
            })
        }
    }
    return RTextScrollPane(editor).apply {
        lineNumbersEnabled = true
        viewport.background = editor.background
        border = BorderFactory.createLineBorder(AwtColor(43, 55, 72))
        gutter.apply {
            background = AwtColor(12, 17, 26)
            lineNumberColor = AwtColor(102, 116, 136)
            currentLineNumberColor = AwtColor(173, 190, 214)
            borderColor = AwtColor(43, 55, 72)
            foldIndicatorForeground = AwtColor(102, 116, 136)
            foldIndicatorArmedForeground = AwtColor(111, 168, 255)
        }
    }
}

@Composable
private fun RenderModeTab(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(R6))
            .background(if (active) Ac.copy(alpha = 0.14f) else Color.Transparent)
            .border(1.dp, if (active) Ac.copy(alpha = 0.35f) else Color.Transparent, RoundedCornerShape(R6))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (active) AcLight else Tx3, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SourceCodePane(preview: ProjectViewModel.FilePreviewState) {
    if (preview.semanticHighlights.isEmpty()) {
        LocalSyntaxSourcePane(
            content = preview.content,
            languageId = preview.languageId,
            truncated = preview.truncated,
        )
        return
    }
    val lines = remember(preview.content) { preview.content.lines() }
    val semanticByLine = remember(preview.semanticHighlights) { preview.semanticHighlights.groupBy(SemanticHighlight::line) }
    val horizontalState = rememberScrollState()
    val verticalState = rememberLazyListState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(end = 10.dp, bottom = 10.dp)
                .horizontalScroll(horizontalState),
            state = verticalState,
        ) {
            itemsIndexed(lines, key = { index, _ -> index }) { index, line ->
                val semantic = semanticByLine[index].orEmpty()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (index % 2 == 0) Color.Transparent else Bg1.copy(alpha = 0.24f))
                        .padding(vertical = 1.dp),
                ) {
                    Text(
                        text = (index + 1).toString(),
                        color = Tx3,
                        fontSize = 10.sp,
                        fontFamily = CodeFont,
                        modifier = Modifier.width(50.dp).padding(end = 12.dp),
                    )
                    HighlightedSourceLine(line, preview.languageId, semantic)
                }
            }
            if (preview.truncated) {
                item(key = "truncated") {
                    Text("预览已截断至 256 KiB", color = WarnLight, fontSize = 10.sp, modifier = Modifier.padding(12.dp))
                }
            }
        }
        VerticalScrollbar(
            adapter = rememberScrollbarAdapter(verticalState),
            modifier = Modifier.align(Alignment.CenterEnd).padding(vertical = 4.dp),
        )
        HorizontalScrollbar(
            adapter = rememberScrollbarAdapter(horizontalState),
            modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(end = 10.dp),
        )
    }
}

@Composable
private fun LocalSyntaxSourcePane(
    content: String,
    languageId: String,
    truncated: Boolean,
) {
    Column(Modifier.fillMaxSize()) {
        SwingPanel(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            background = Bg0,
            factory = {
                createSourceEditorPane(
                    value = content,
                    languageId = languageId,
                    onValueChange = {},
                    onSave = {},
                    editable = false,
                )
            },
            update = { scroll ->
                val editor = scroll.viewport.view as? RSyntaxTextArea ?: return@SwingPanel
                val style = sourceSyntaxStyle(languageId)
                if (editor.syntaxEditingStyle != style) editor.syntaxEditingStyle = style
                if (editor.text != content) editor.text = content
            },
        )
        if (truncated) {
            Text(
                "预览已截断至 256 KiB",
                color = WarnLight,
                fontSize = 10.sp,
                modifier = Modifier.fillMaxWidth().background(Bg1).padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun HighlightedSourceLine(
    line: String,
    languageId: String,
    semantic: List<SemanticHighlight>,
) {
    val highlighted = remember(line, languageId, semantic) {
        highlightSourceLine(line, languageId, semantic)
    }
    Text(
        text = highlighted,
        color = Tx2,
        fontSize = 12.sp,
        fontFamily = CodeFont,
        lineHeight = 19.sp,
        softWrap = false,
        modifier = Modifier.padding(end = 24.dp),
    )
}

internal fun highlightSourceLine(
    line: String,
    languageId: String,
    semantic: List<SemanticHighlight>,
): AnnotatedString = buildAnnotatedString {
    append(line.ifEmpty { " " })
    val keywords = KEYWORDS[languageId] ?: COMMON_KEYWORDS
    KEYWORD_REGEX.findAll(line).forEach { match ->
        if (match.value in keywords) addStyle(SpanStyle(color = AcLight, fontWeight = FontWeight.SemiBold), match.range.first, match.range.last + 1)
    }
    NUMBER_REGEX.findAll(line).forEach { addStyle(SpanStyle(color = AgentKimi), it.range.first, it.range.last + 1) }
    STRING_REGEX.findAll(line).forEach { addStyle(SpanStyle(color = AgentGemini), it.range.first, it.range.last + 1) }
    findLineCommentStart(line, languageId)?.let { start ->
        addStyle(SpanStyle(color = Tx3, fontStyle = FontStyle.Italic), start, line.length)
    }
    semantic.forEach { token ->
        val start = token.startCharacter.coerceIn(0, line.length)
        val end = (start + token.length).coerceIn(start, line.length)
        if (start < end) addStyle(semanticStyle(token.tokenType, token.modifiers), start, end)
    }
}

private fun semanticStyle(type: String, modifiers: Set<String>): SpanStyle {
    val color = when (type) {
        "namespace", "module", "package" -> AgentQwen
        "class", "interface", "struct", "enum", "type", "typeParameter" -> AcLight
        "function", "method", "macro" -> AgentGemini
        "property", "variable", "parameter", "enumMember" -> Tx
        "keyword", "modifier" -> Ac
        "string" -> AgentGemini
        "number" -> AgentKimi
        "comment" -> Tx3
        else -> Tx2
    }
    return SpanStyle(
        color = color,
        fontWeight = if ("declaration" in modifiers || type in setOf("class", "function", "method")) FontWeight.SemiBold else FontWeight.Normal,
        fontStyle = if (type == "comment") FontStyle.Italic else FontStyle.Normal,
    )
}

@Composable
private fun MarkdownPreview(
    content: String,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()
    Box(modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .padding(end = 10.dp)
                .verticalScroll(scrollState)
                .padding(22.dp),
        ) {
            Markdown(content = content, modifier = Modifier.fillMaxWidth())
        }
        VerticalScrollbar(
            adapter = rememberScrollbarAdapter(scrollState),
            modifier = Modifier.align(Alignment.CenterEnd).padding(vertical = 4.dp),
        )
    }
}

@Composable
private fun HtmlPreview(
    content: String,
    modifier: Modifier = Modifier,
) {
    SwingPanel(
        modifier = modifier.fillMaxSize(),
        factory = { JScrollPane(createHtmlPreviewPane(content)) },
        update = { scroll ->
            val editor = scroll.viewport.view as? JEditorPane
            if (editor != null) updateHtmlPreviewContent(editor, content)
        },
    )
}

internal fun createHtmlPreviewPane(content: String): JEditorPane = JEditorPane().apply {
    editorKit = SafeHtmlEditorKit()
    isEditable = false
    background = AwtColor(8, 12, 20)
    foreground = AwtColor(235, 241, 248)
    updateHtmlPreviewContent(this, content)
}

internal class SafeHtmlEditorKit : HTMLEditorKit() {
    private val delegateViewFactory = super.getViewFactory()
    private val safeViewFactory = ViewFactory { element ->
        if (element.attributes.getAttribute(StyleConstants.NameAttribute) == HTML.Tag.IMG) {
            BlockedHtmlImageView(element)
        } else {
            delegateViewFactory.create(element)
        }
    }

    init {
        val safeStyleSheet = ExternalResourceBlockingStyleSheet()
        safeStyleSheet.addStyleSheet(super.getStyleSheet())
        setStyleSheet(safeStyleSheet)
        setAutoFormSubmission(false)
    }

    override fun getViewFactory(): ViewFactory = safeViewFactory
}

internal class BlockedHtmlImageView(element: Element) : ImageView(element) {
    override fun getImageURL(): URL? = null
    override fun getImage(): java.awt.Image? = null
}

internal class ExternalResourceBlockingStyleSheet : StyleSheet() {
    override fun importStyleSheet(url: URL?) = Unit
}

internal fun updateHtmlPreviewContent(editor: JEditorPane, content: String): Boolean {
    if (editor.getClientProperty(HTML_SOURCE_PROPERTY) == content) return false
    editor.text = content
    editor.caretPosition = 0
    editor.putClientProperty(HTML_SOURCE_PROPERTY, content)
    return true
}

@Composable
private fun JsonPreview(
    content: String,
    modifier: Modifier = Modifier,
) {
    val rows by produceState(
        initialValue = listOf(JsonRow(0, "", "正在解析 JSON…", JsonKind.LOADING)),
        key1 = content,
    ) {
        value = withContext(Dispatchers.Default) { parseJsonRows(content) }
    }
    val listState = rememberLazyListState()
    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(start = 18.dp, top = 12.dp, end = 28.dp, bottom = 12.dp),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            itemsIndexed(rows, key = { index, row -> "$index:${row.key}" }) { _, row ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(5.dp)).background(Bg1.copy(alpha = 0.36f)).padding(vertical = 5.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Spacer(Modifier.width(jsonIndentDp(row.depth).dp))
                    Text(row.key, color = AcLight, fontSize = 12.sp, fontFamily = CodeFont, modifier = Modifier.width(220.dp))
                    Text(row.value, color = jsonValueColor(row.kind), fontSize = 12.sp, fontFamily = CodeFont)
                }
            }
        }
        VerticalScrollbar(
            adapter = rememberScrollbarAdapter(listState),
            modifier = Modifier.align(Alignment.CenterEnd).padding(vertical = 4.dp),
        )
    }
}

internal enum class JsonKind { OBJECT, ARRAY, STRING, NUMBER, BOOLEAN, NULL, LOADING, TRUNCATED, ERROR }
internal data class JsonRow(val depth: Int, val key: String, val value: String, val kind: JsonKind)

internal fun parseJsonRows(content: String): List<JsonRow> = runCatching {
    flattenJson(Json.parseToJsonElement(content), MAX_JSON_PREVIEW_ROWS)
}.getOrElse {
    listOf(JsonRow(0, "解析失败", it.message ?: "无效 JSON", JsonKind.ERROR))
}

internal fun jsonIndentDp(depth: Int): Int =
    depth.coerceIn(0, MAX_JSON_VISUAL_DEPTH) * JSON_INDENT_DP

internal fun flattenJson(root: JsonElement, maxRows: Int = Int.MAX_VALUE): List<JsonRow> = buildList {
    require(maxRows > 0) { "maxRows must be positive" }
    val pending = ArrayDeque<JsonTraversalEntry>().apply { addLast(JsonNode(root, "$", 0)) }
    while (pending.isNotEmpty() && size < maxRows) {
        when (val entry = pending.removeLast()) {
            is JsonNode -> {
                val (element, key, depth) = entry
                when (element) {
                    is JsonObject -> {
                        add(JsonRow(depth, key, "{ ${element.size} fields }", JsonKind.OBJECT))
                        if (element.isNotEmpty()) {
                            pending.addLast(JsonObjectChildren(element.entries.iterator(), depth + 1))
                        }
                    }
                    is JsonArray -> {
                        add(JsonRow(depth, key, "[ ${element.size} items ]", JsonKind.ARRAY))
                        if (element.isNotEmpty()) {
                            pending.addLast(JsonArrayChildren(element, index = 0, depth = depth + 1))
                        }
                    }
                    JsonNull -> add(JsonRow(depth, key, "null", JsonKind.NULL))
                    is JsonPrimitive -> {
                        val kind = when {
                            element.isString -> JsonKind.STRING
                            element.booleanOrNull != null -> JsonKind.BOOLEAN
                            else -> JsonKind.NUMBER
                        }
                        add(JsonRow(depth, key, element.toString(), kind))
                    }
                }
            }
            is JsonObjectChildren -> if (entry.children.hasNext()) {
                val (key, child) = entry.children.next()
                if (entry.children.hasNext()) pending.addLast(entry)
                pending.addLast(JsonNode(child, key, entry.depth))
            }
            is JsonArrayChildren -> if (entry.index < entry.array.size) {
                val nextIndex = entry.index + 1
                if (nextIndex < entry.array.size) pending.addLast(entry.copy(index = nextIndex))
                pending.addLast(JsonNode(entry.array[entry.index], "[${entry.index}]", entry.depth))
            }
        }
    }
    if (pending.isNotEmpty()) {
        add(JsonRow(0, "预览已截断", "仅显示前 $maxRows 个节点", JsonKind.TRUNCATED))
    }
}

private sealed interface JsonTraversalEntry
private data class JsonNode(val element: JsonElement, val key: String, val depth: Int) : JsonTraversalEntry
private data class JsonObjectChildren(
    val children: Iterator<Map.Entry<String, JsonElement>>,
    val depth: Int,
) : JsonTraversalEntry
private data class JsonArrayChildren(
    val array: JsonArray,
    val index: Int,
    val depth: Int,
) : JsonTraversalEntry

private fun jsonValueColor(kind: JsonKind): Color = when (kind) {
    JsonKind.OBJECT, JsonKind.ARRAY -> Tx3
    JsonKind.LOADING -> Tx3
    JsonKind.STRING -> AgentGemini
    JsonKind.NUMBER -> AgentKimi
    JsonKind.BOOLEAN -> AgentQwen
    JsonKind.NULL -> Tx3
    JsonKind.TRUNCATED -> WarnLight
    JsonKind.ERROR -> ErrLight
}

private val KEYWORD_REGEX = Regex("\\b[A-Za-z_][A-Za-z0-9_]*\\b")
private val NUMBER_REGEX = Regex("\\b(?:0x[0-9A-Fa-f]+|\\d+(?:\\.\\d+)?)\\b")
private val STRING_REGEX = Regex("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'")
private const val HTML_SOURCE_PROPERTY = "swarm-editor.html-source"
private const val MAX_JSON_VISUAL_DEPTH = 32
private const val JSON_INDENT_DP = 18
private const val MAX_JSON_PREVIEW_ROWS = 10_000
private val RENDERED_PREVIEW_EXTENSIONS = setOf("md", "markdown", "html", "htm", "json")

internal fun findLineCommentStart(line: String, languageId: String): Int? {
    val markers = when (languageId.lowercase()) {
        "python", "py", "ruby", "rb", "shell", "sh", "bash", "zsh", "fish",
        "yaml", "yml", "toml", "r", "perl", "pl", "properties" -> listOf("#")
        "sql", "lua" -> listOf("--")
        "html", "htm", "xml", "svg" -> listOf("<!--")
        "json", "markdown", "md" -> emptyList()
        else -> listOf("//")
    }
    if (markers.isEmpty()) return null

    var quote: Char? = null
    var escaped = false
    var index = 0
    while (index < line.length) {
        val character = line[index]
        if (escaped) {
            escaped = false
            index++
            continue
        }
        if (quote != null && character == '\\') {
            escaped = true
            index++
            continue
        }
        if (character == '\'' || character == '"') {
            quote = if (quote == character) null else quote ?: character
            index++
            continue
        }
        if (quote == null) {
            markers.firstOrNull { marker -> line.startsWith(marker, index) }?.let { return index }
        }
        index++
    }
    return null
}

private val COMMON_KEYWORDS = setOf("if", "else", "for", "while", "return", "class", "interface", "fun", "function", "const", "val", "var", "let", "import", "package", "new", "try", "catch", "finally", "throw", "async", "await", "true", "false", "null")
private val KEYWORDS = mapOf(
    "kotlin" to COMMON_KEYWORDS + setOf("object", "data", "sealed", "suspend", "when", "is", "in", "as", "override", "private", "internal", "public", "protected", "companion", "inline"),
    "typescript" to COMMON_KEYWORDS + setOf("type", "namespace", "export", "extends", "implements", "readonly", "unknown", "undefined", "yield"),
    "python" to COMMON_KEYWORDS + setOf("def", "from", "lambda", "with", "yield", "None", "True", "False", "elif", "pass", "raise"),
    "rust" to COMMON_KEYWORDS + setOf("fn", "struct", "enum", "impl", "trait", "match", "mut", "pub", "crate", "use", "where", "move", "ref", "dyn"),
    "go" to COMMON_KEYWORDS + setOf("func", "struct", "interface", "defer", "go", "chan", "select", "range", "map"),
    "cpp" to COMMON_KEYWORDS + setOf("namespace", "template", "typename", "constexpr", "auto", "virtual", "static", "using", "include"),
)
