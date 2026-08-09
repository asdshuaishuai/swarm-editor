package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.HorizontalScrollbar
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.m3.Markdown
import com.swarmeditor.backend.lsp.SemanticHighlight
import com.swarmeditor.backend.lsp.SourceFoldingRange
import com.swarmeditor.backend.lsp.SourceLocation
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.StringReader
import javax.swing.text.MutableAttributeSet
import javax.swing.text.html.HTML
import javax.swing.text.html.HTMLEditorKit
import javax.swing.text.html.parser.ParserDelegator

internal enum class FileRenderMode { SOURCE, PREVIEW }

internal fun initialFileRenderMode(preference: String?): FileRenderMode =
    if (preference.equals("preview", ignoreCase = true)) FileRenderMode.PREVIEW else FileRenderMode.SOURCE

internal data class SourceNavigationTarget(
    val line: Int,
    val requestId: Long,
)

@Composable
internal fun FileContentRenderer(
    preview: ProjectViewModel.FilePreviewState,
    navigationTarget: SourceNavigationTarget? = null,
    onInspectPosition: (Int, Int) -> Unit = { _, _ -> },
    onOpenDefinition: (SourceLocation) -> Unit = {},
    onDismissPositionInsight: () -> Unit = {},
    onDraftChange: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val extension = preview.path.orEmpty().substringAfterLast('.', "").lowercase()
    val supportsPreview = supportsRenderedPreview(preview.path, preview.binary, preview.truncated)
    var mode by remember(preview.path) {
        mutableStateOf(initialFileRenderMode(System.getProperty("swarm.fileRenderMode")))
    }
    val effectiveMode = if (supportsPreview) mode else FileRenderMode.SOURCE

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
            Spacer(Modifier.weight(1f))
            val status = when {
                preview.error != null -> preview.error
                else -> null
            }
            if (!status.isNullOrBlank()) {
                Text(status, color = if (preview.error != null) ErrLight else Tx3, fontSize = 10.sp, maxLines = 1)
            }
        }
        Box(Modifier.fillMaxSize().background(Bg0)) {
            when {
                preview.draftContent != null -> SourceEditorPane(preview.draftContent, onDraftChange)
                effectiveMode == FileRenderMode.SOURCE -> SourceCodePane(
                    preview,
                    navigationTarget,
                    onInspectPosition,
                    onOpenDefinition,
                    onDismissPositionInsight,
                )
                extension in setOf("md", "markdown") -> MarkdownPreview(preview.content)
                extension in setOf("html", "htm") -> HtmlPreview(preview.content)
                extension == "json" -> JsonPreview(preview.content)
                else -> SourceCodePane(
                    preview,
                    navigationTarget,
                    onInspectPosition,
                    onOpenDefinition,
                    onDismissPositionInsight,
                )
            }
        }
    }
}

@Composable
private fun SourceEditorPane(content: String, onContentChange: (String) -> Unit) {
    val verticalState = rememberScrollState()
    val horizontalState = rememberScrollState()
    Box(Modifier.fillMaxSize()) {
        BasicTextField(
            value = content,
            onValueChange = onContentChange,
            textStyle = androidx.compose.ui.text.TextStyle(
                color = Tx2,
                fontSize = 12.sp,
                fontFamily = CodeFont,
                lineHeight = 19.sp,
            ),
            modifier = Modifier
                .fillMaxSize()
                .padding(end = 10.dp, bottom = 10.dp)
                .verticalScroll(verticalState)
                .horizontalScroll(horizontalState),
        )
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

internal fun supportsRenderedPreview(path: String?, binary: Boolean, truncated: Boolean): Boolean {
    if (binary || truncated) return false
    return path.orEmpty().substringAfterLast('.', "").lowercase() in RENDERED_PREVIEW_EXTENSIONS
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
private fun SourceCodePane(
    preview: ProjectViewModel.FilePreviewState,
    navigationTarget: SourceNavigationTarget?,
    onInspectPosition: (Int, Int) -> Unit,
    onOpenDefinition: (SourceLocation) -> Unit,
    onDismissPositionInsight: () -> Unit,
) {
    val lines = remember(preview.content) { preview.content.lines() }
    val semanticByLine = remember(preview.semanticHighlights) { preview.semanticHighlights.groupBy(SemanticHighlight::line) }
    val foldingByStart = remember(preview.foldingRanges, lines.size) {
        normalizedFoldingRanges(preview.foldingRanges, lines.size).associateBy(SourceFoldingRange::startLine)
    }
    var collapsedStarts by remember(preview.path, preview.content) { mutableStateOf(emptySet<Int>()) }
    val visibleLines = remember(lines.size, foldingByStart, collapsedStarts) {
        visibleSourceLines(lines.size, foldingByStart, collapsedStarts)
    }
    val horizontalState = rememberScrollState()
    val verticalState = rememberLazyListState()
    LaunchedEffect(navigationTarget?.requestId, lines.size, foldingByStart) {
        val targetLine = normalizedNavigationIndex(navigationTarget?.line, lines.size) ?: return@LaunchedEffect
        val expanded = collapsedStarts.filterNotTo(mutableSetOf()) { startLine ->
            val range = foldingByStart[startLine]
            range != null && targetLine in (range.startLine + 1)..range.endLine
        }
        if (expanded != collapsedStarts) collapsedStarts = expanded
        val targetIndex = visibleSourceLines(lines.size, foldingByStart, expanded)
            .indexOfFirst { visible -> visible.lineIndex == targetLine }
        if (targetIndex >= 0) verticalState.scrollToItem(targetIndex)
    }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(end = 10.dp, bottom = 10.dp)
                .horizontalScroll(horizontalState),
            state = verticalState,
        ) {
            items(visibleLines, key = VisibleSourceLine::lineIndex) { visibleLine ->
                val index = visibleLine.lineIndex
                val line = lines[index]
                val semantic = semanticByLine[index].orEmpty()
                val foldingRange = foldingByStart[index]
                val collapsed = index in collapsedStarts
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            when {
                                index == normalizedNavigationIndex(navigationTarget?.line, lines.size) -> Ac.copy(alpha = 0.12f)
                                index % 2 == 0 -> Color.Transparent
                                else -> Bg1.copy(alpha = 0.24f)
                            },
                        )
                        .padding(vertical = 1.dp),
                ) {
                    Row(
                        modifier = Modifier.width(58.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = when {
                                foldingRange == null -> " "
                                collapsed -> "▸"
                                else -> "▾"
                            },
                            color = if (foldingRange == null) Color.Transparent else Tx2,
                            fontSize = 10.sp,
                            modifier = Modifier
                                .width(16.dp)
                                .then(
                                    if (foldingRange == null) Modifier else Modifier.clickable {
                                        collapsedStarts = if (collapsed) {
                                            collapsedStarts - index
                                        } else {
                                            collapsedStarts + index
                                        }
                                    },
                                ),
                        )
                        Text(
                            text = (index + 1).toString(),
                            color = Tx3,
                            fontSize = 10.sp,
                            fontFamily = CodeFont,
                            modifier = Modifier.width(42.dp).padding(end = 10.dp),
                        )
                    }
                    HighlightedSourceLine(line, preview.languageId, semantic) { character ->
                        onInspectPosition(index, character)
                    }
                    if (collapsed && visibleLine.hiddenLineCount > 0) {
                        Text(
                            text = "  ⋯ ${visibleLine.hiddenLineCount} 行",
                            color = AcLight,
                            fontSize = 10.sp,
                            fontFamily = CodeFont,
                        )
                    }
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
        if (preview.isInspectingPosition) {
            Text(
                "JetBrains 代码洞察分析中…",
                color = Tx2,
                fontSize = 10.sp,
                modifier = Modifier.align(Alignment.BottomStart).padding(10.dp).surfaceInput().padding(8.dp),
            )
        }
        preview.positionInsight?.let { insight ->
            if (!insight.hover.isNullOrBlank() || insight.definitions.isNotEmpty()) {
                Column(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(0.72f)
                        .clip(RoundedCornerShape(R8))
                        .background(Bg1)
                        .border(1.dp, Line2, RoundedCornerShape(R8))
                        .padding(12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("JetBrains 代码洞察", color = AcLight, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        Text("关闭", color = Tx3, fontSize = 10.sp, modifier = Modifier.clickable(onClick = onDismissPositionInsight))
                    }
                    insight.hover?.takeIf(String::isNotBlank)?.let { hover ->
                        Spacer(Modifier.height(8.dp))
                        Markdown(content = hover, modifier = Modifier.fillMaxWidth())
                    }
                    insight.definitions.take(4).forEach { location ->
                        Spacer(Modifier.height(7.dp))
                        Text(
                            "跳转定义 · ${location.uri.substringAfterLast('/')} : ${location.line + 1}",
                            color = AcLight,
                            fontSize = 10.sp,
                            modifier = Modifier.clickable { onOpenDefinition(location) },
                        )
                    }
                }
            }
        }
    }
}

internal data class VisibleSourceLine(
    val lineIndex: Int,
    val hiddenLineCount: Int = 0,
)

internal fun normalizedFoldingRanges(
    ranges: List<SourceFoldingRange>,
    lineCount: Int,
): List<SourceFoldingRange> = ranges
    .asSequence()
    .map { range ->
        range.copy(
            startLine = range.startLine.coerceIn(0, (lineCount - 1).coerceAtLeast(0)),
            endLine = range.endLine.coerceIn(0, (lineCount - 1).coerceAtLeast(0)),
        )
    }
    .filter { range -> lineCount > 0 && range.endLine > range.startLine }
    .groupBy(SourceFoldingRange::startLine)
    .values
    .map { sameStart -> sameStart.maxBy(SourceFoldingRange::endLine) }
    .sortedBy(SourceFoldingRange::startLine)
    .toList()

internal fun visibleSourceLines(
    lineCount: Int,
    foldingByStart: Map<Int, SourceFoldingRange>,
    collapsedStarts: Set<Int>,
): List<VisibleSourceLine> = buildList {
    var lineIndex = 0
    while (lineIndex < lineCount) {
        val range = foldingByStart[lineIndex]
        val collapsed = lineIndex in collapsedStarts && range != null
        val hiddenLineCount = if (collapsed) checkNotNull(range).endLine - range.startLine else 0
        add(
            VisibleSourceLine(
                lineIndex = lineIndex,
                hiddenLineCount = hiddenLineCount,
            ),
        )
        lineIndex = if (collapsed) checkNotNull(range).endLine + 1 else lineIndex + 1
    }
}

internal fun normalizedNavigationIndex(line: Int?, lineCount: Int): Int? {
    if (line == null || lineCount <= 0) return null
    return line.coerceIn(0, lineCount - 1)
}

@Composable
private fun HighlightedSourceLine(
    line: String,
    languageId: String,
    semantic: List<SemanticHighlight>,
    onPositionClick: (Int) -> Unit,
) {
    val highlighted = remember(line, languageId, semantic) {
        highlightSourceLine(line, languageId, semantic)
    }
    var layoutResult by remember(line) { mutableStateOf<TextLayoutResult?>(null) }
    Text(
        text = highlighted,
        color = Tx2,
        fontSize = 12.sp,
        fontFamily = CodeFont,
        lineHeight = 19.sp,
        softWrap = false,
        onTextLayout = { layoutResult = it },
        modifier = Modifier
            .padding(end = 24.dp)
            .pointerInput(line) {
                detectTapGestures { position ->
                    val character = layoutResult?.getOffsetForPosition(position) ?: 0
                    onPositionClick(character.coerceIn(0, line.length))
                }
            },
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
    val blocks = remember(content) { parseHtmlPreviewBlocks(content) }
    val listState = rememberLazyListState()
    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(end = 10.dp),
            state = listState,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(22.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            items(blocks) { block -> HtmlPreviewBlockView(block) }
        }
        VerticalScrollbar(
            adapter = rememberScrollbarAdapter(listState),
            modifier = Modifier.align(Alignment.CenterEnd).padding(vertical = 4.dp),
        )
    }
}

@Composable
private fun HtmlPreviewBlockView(block: HtmlPreviewBlock) {
    when (block.kind) {
        HtmlBlockKind.HEADING_1,
        HtmlBlockKind.HEADING_2,
        HtmlBlockKind.HEADING_3,
        HtmlBlockKind.HEADING_4,
        HtmlBlockKind.HEADING_5,
        HtmlBlockKind.HEADING_6,
        -> Text(
            text = block.text,
            color = Tx,
            fontSize = when (block.kind) {
                HtmlBlockKind.HEADING_1 -> 30.sp
                HtmlBlockKind.HEADING_2 -> 24.sp
                HtmlBlockKind.HEADING_3 -> 20.sp
                HtmlBlockKind.HEADING_4 -> 17.sp
                HtmlBlockKind.HEADING_5 -> 15.sp
                else -> 14.sp
            },
            lineHeight = 1.2.em,
            fontWeight = FontWeight.SemiBold,
        )

        HtmlBlockKind.LIST_ITEM -> Row(
            modifier = Modifier.padding(start = (block.depth.coerceAtMost(6) * 14).dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text("•", color = AcLight, fontSize = 13.sp)
            Spacer(Modifier.width(8.dp))
            Text(block.text, color = Tx2, fontSize = 13.sp, lineHeight = 20.sp)
        }

        HtmlBlockKind.CODE -> Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(R6)).background(Bg1).border(1.dp, Line2, RoundedCornerShape(R6))
                .padding(12.dp),
        ) {
            Text(block.text, color = Tx2, fontSize = 12.sp, lineHeight = 18.sp, fontFamily = CodeFont)
        }

        HtmlBlockKind.QUOTE -> Row {
            Box(Modifier.width(3.dp).height(22.dp).background(Ac.copy(alpha = 0.65f)))
            Spacer(Modifier.width(10.dp))
            Text(block.text, color = Tx3, fontSize = 13.sp, lineHeight = 20.sp, fontStyle = FontStyle.Italic)
        }

        HtmlBlockKind.PARAGRAPH -> Text(block.text, color = Tx2, fontSize = 13.sp, lineHeight = 21.sp)
    }
}

internal enum class HtmlBlockKind {
    HEADING_1,
    HEADING_2,
    HEADING_3,
    HEADING_4,
    HEADING_5,
    HEADING_6,
    PARAGRAPH,
    LIST_ITEM,
    CODE,
    QUOTE,
}

internal data class HtmlPreviewBlock(
    val kind: HtmlBlockKind,
    val text: String,
    val depth: Int = 0,
)

internal fun parseHtmlPreviewBlocks(content: String): List<HtmlPreviewBlock> {
    val collector = HtmlPreviewCollector()
    ParserDelegator().parse(StringReader(sanitizeHtmlPreviewContent(content)), collector, true)
    return collector.finish().ifEmpty {
        htmlPreviewText(content).takeIf(String::isNotBlank)?.let { text ->
            listOf(HtmlPreviewBlock(HtmlBlockKind.PARAGRAPH, text))
        }.orEmpty()
    }
}

internal fun sanitizeHtmlPreviewContent(content: String): String = content
        .replace(Regex("(?is)<(script|style|iframe|object|embed)\\b[^>]*>.*?</\\1\\s*>"), "")
        .replace(Regex("(?is)<(?:link|base|meta)\\b[^>]*?/?>"), "")
        .replace(Regex("(?is)\\s+on[a-z]+\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)"), "")
        .replace(Regex("(?is)\\s+(?:src|srcset|background)\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)"), "")

private class HtmlPreviewCollector : HTMLEditorKit.ParserCallback() {
    private val blocks = mutableListOf<HtmlPreviewBlock>()
    private val text = StringBuilder()
    private var activeKind: HtmlBlockKind? = null
    private var activeTag: HTML.Tag? = null
    private var activeDepth = 0
    private var listDepth = 0

    override fun handleStartTag(tag: HTML.Tag, attributes: MutableAttributeSet, position: Int) {
        when (tag) {
            HTML.Tag.UL, HTML.Tag.OL -> listDepth++
            HTML.Tag.H1 -> begin(HtmlBlockKind.HEADING_1, tag)
            HTML.Tag.H2 -> begin(HtmlBlockKind.HEADING_2, tag)
            HTML.Tag.H3 -> begin(HtmlBlockKind.HEADING_3, tag)
            HTML.Tag.H4 -> begin(HtmlBlockKind.HEADING_4, tag)
            HTML.Tag.H5 -> begin(HtmlBlockKind.HEADING_5, tag)
            HTML.Tag.H6 -> begin(HtmlBlockKind.HEADING_6, tag)
            HTML.Tag.LI -> begin(HtmlBlockKind.LIST_ITEM, tag, listDepth.coerceAtLeast(1) - 1)
            HTML.Tag.P -> if (activeKind == null) begin(HtmlBlockKind.PARAGRAPH, tag)
            HTML.Tag.PRE -> begin(HtmlBlockKind.CODE, tag)
            HTML.Tag.BLOCKQUOTE -> begin(HtmlBlockKind.QUOTE, tag)
        }
    }

    override fun handleEndTag(tag: HTML.Tag, position: Int) {
        if (tag == activeTag) commitBlock()
        if (tag == HTML.Tag.UL || tag == HTML.Tag.OL) listDepth = (listDepth - 1).coerceAtLeast(0)
    }

    override fun handleSimpleTag(tag: HTML.Tag, attributes: MutableAttributeSet, position: Int) {
        if (tag == HTML.Tag.BR && text.isNotEmpty()) text.append('\n')
    }

    override fun handleText(data: CharArray, position: Int) {
        if (activeKind == null) begin(HtmlBlockKind.PARAGRAPH, HTML.Tag.P)
        text.append(data)
    }

    fun finish(): List<HtmlPreviewBlock> {
        commitBlock()
        return blocks
    }

    private fun begin(kind: HtmlBlockKind, tag: HTML.Tag, depth: Int = 0) {
        commitBlock()
        activeKind = kind
        activeTag = tag
        activeDepth = depth
    }

    private fun commitBlock() {
        val kind = activeKind ?: return
        val value = if (kind == HtmlBlockKind.CODE) {
            text.toString().trim('\n', '\r')
        } else {
            text.toString().trim().replace(Regex("[\\t\\r\\n ]+"), " ")
        }
        if (value.isNotBlank()) blocks += HtmlPreviewBlock(kind, value, activeDepth)
        text.clear()
        activeKind = null
        activeTag = null
        activeDepth = 0
    }
}

internal fun htmlPreviewText(content: String): String = content
    .replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), "")
    .replace(Regex("(?i)<br\\s*/?>"), "\n")
    .replace(Regex("(?i)</(p|div|section|article|header|footer|h[1-6]|li|tr)>"), "\n")
    .replace(Regex("(?s)<[^>]+>"), "")
    .replace("&nbsp;", " ")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&amp;", "&")
    .replace("&quot;", "\"")
    .lines()
    .map(String::trimEnd)
    .joinToString("\n")
    .replace(Regex("\n{3,}"), "\n\n")
    .trim()

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
