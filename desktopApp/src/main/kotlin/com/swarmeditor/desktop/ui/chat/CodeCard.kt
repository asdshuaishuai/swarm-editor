package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Copy
import com.woowla.compose.icon.collections.feather.feather.Check
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import java.awt.datatransfer.StringSelection
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class DiffLineType { ADD, DEL, CONTEXT }

@androidx.compose.runtime.Immutable
data class DiffLine(val type: DiffLineType, val oldLineNum: Int?, val newLineNum: Int?, val content: String)

@androidx.compose.runtime.Immutable
data class CodeCardData(
    val filename: String,
    val extension: String,
    val diffLines: List<DiffLine>,
    val additions: Int = 0,
    val deletions: Int = 0
)

private val KOTLIN_KEYWORDS = setOf(
    "fun", "val", "var", "class", "import", "if", "else", "for", "while", "return",
    "when", "object", "interface", "package", "try", "catch", "throw", "override",
    "private", "public", "internal", "protected", "abstract", "open", "data", "sealed",
    "enum", "companion", "suspend", "inline", "const", "lateinit", "typeof",
    "in", "is", "as", "by", "init", "constructor", "operator", "infix", "tailrec",
    "annotation", "crossinline", "noinline", "reified", "out", "typealias"
)

private val CODE_TOKEN_PATTERN = Regex("""(\"[^\"]*\"|\'[^\']*\'|\w+)""")

/** Simple regex-based syntax highlighting for diff content lines. */
internal fun highlightSyntax(text: String): AnnotatedString {
    val prefix = if (text.startsWith("+") || text.startsWith("-")) text.substring(0, 1) else ""
    val content = if (prefix.isNotEmpty()) text.substring(1) else text

    return buildAnnotatedString {
        // Tokenize by splitting on word boundaries and string literals
        var lastIndex = 0
        for (match in CODE_TOKEN_PATTERN.findAll(content)) {
            // Append text before this match
            if (match.range.first > lastIndex) {
                append(content.substring(lastIndex, match.range.first))
            }
            val word = match.value
            when {
                word in KOTLIN_KEYWORDS -> withStyle(SpanStyle(color = AgentClaude)) { append(word) }
                word.startsWith("\"") -> withStyle(SpanStyle(color = AgentGemini)) { append(word) }
                word.startsWith("'") -> withStyle(SpanStyle(color = AgentGemini)) { append(word) }
                else -> {
                    // Check if followed by '(' — function name
                    val afterIndex = match.range.last + 1
                    if (afterIndex < content.length && content[afterIndex] == '(') {
                        withStyle(SpanStyle(color = Ac)) { append(word) }
                    } else {
                        append(word)
                    }
                }
            }
            lastIndex = match.range.last + 1
        }
        if (lastIndex < content.length) {
            append(content.substring(lastIndex))
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun CodeCard(
    card: CodeCardData,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(R8)
    val oldLineNumWidth = remember(card.diffLines) {
        card.diffLines.maxOfOrNull { it.oldLineNum?.toString()?.length ?: 1 } ?: 1
    }
    val newLineNumWidth = remember(card.diffLines) {
        card.diffLines.maxOfOrNull { it.newLineNum?.toString()?.length ?: 1 } ?: 1
    }
    val highlightedLines = remember(card.diffLines, Ac, AgentClaude, AgentGemini) {
        card.diffLines.map { line -> highlightSyntax(line.content) }
    }
    val horizontalScrollState = rememberScrollState()
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember(card.filename, card.diffLines) { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(1200)
            copied = false
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Bg2)
            .border(1.dp, Line, shape)
    ) {
        // File header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Bg2)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(imageVector = Feather.File, contentDescription = "File", modifier = Modifier.size(14.dp), tint = Tx2)
            Spacer(Modifier.width(6.dp))
            // Extension badge with hover effect
            val chipInteractionSource = remember { MutableInteractionSource() }
            val isChipHovered by chipInteractionSource.collectIsHoveredAsState()
            val extensionBackground by animateColorAsState(
                Ac.withAlpha(if (isChipHovered) 0.18f else 0.11f),
                Motion.colorDefault,
                label = "codeExtensionBackground",
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(extensionBackground)
                    .hoverable(chipInteractionSource)
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            ) {
                Text(
                    card.extension.uppercase(),
                    color = Ac,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont
                )
            }
            Spacer(Modifier.width(6.dp))
            Text(card.filename, color = Tx, fontSize = 12.sp, fontFamily = SansFont)
            Spacer(Modifier.weight(1f))
            // Diff stats
            if (card.additions > 0) {
                Text("+${card.additions}", color = AgentGemini, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            if (card.deletions > 0) {
                Text("-${card.deletions}", color = Err, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            val copyInteraction = remember { MutableInteractionSource() }
            val copyHovered by copyInteraction.collectIsHoveredAsState()
            val copyBackground by animateColorAsState(
                when {
                    copied -> ControlGreen.withAlpha(0.16f)
                    copyHovered -> ControlBlue.withAlpha(0.12f)
                    else -> Color.Transparent
                },
                Motion.colorDefault,
                label = "codeCopyBackground",
            )
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(AppShapes.xs)
                    .background(copyBackground)
                    .fluidClickable(interactionSource = copyInteraction) {
                        scope.launch {
                            clipboard.setClipEntry(
                                ClipEntry(StringSelection(card.diffLines.joinToString("\n") { it.content }))
                            )
                            copied = true
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                AnimatedContent(
                    targetState = copied,
                    transitionSpec = {
                        (fadeIn(Motion.alphaEnter) + scaleIn(initialScale = 0.9f, animationSpec = Motion.floatState)) togetherWith
                            (fadeOut(Motion.alphaExit) + scaleOut(targetScale = 0.9f, animationSpec = Motion.floatState))
                    },
                    label = "codeCopyFeedback",
                ) { isCopied ->
                    Icon(
                        imageVector = if (isCopied) Feather.Check else Feather.Copy,
                        contentDescription = if (isCopied) "已复制" else "复制代码",
                        tint = if (isCopied) ControlGreen else if (copyHovered) ControlBlue else Tx3,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }

        // Diff lines
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(horizontalScrollState),
        ) {
            card.diffLines.forEachIndexed { index, line ->
                val bgColor = when (line.type) {
                    DiffLineType.ADD -> ControlGreen.withAlpha(0.12f)
                    DiffLineType.DEL -> ControlRed.withAlpha(0.12f)
                    DiffLineType.CONTEXT -> androidx.compose.ui.graphics.Color.Transparent
                }
                val textColor = when (line.type) {
                    DiffLineType.DEL -> ControlRed.withAlpha(0.76f)
                    else -> Tx
                }
                val lineNumColor = when (line.type) {
                    DiffLineType.ADD -> ControlGreen
                    DiffLineType.DEL -> ControlRed
                    DiffLineType.CONTEXT -> Tx3
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bgColor)
                        .padding(horizontal = 12.dp, vertical = 1.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Old line number (left)
                    Text(
                        text = line.oldLineNum?.toString()?.padStart(oldLineNumWidth) ?: "",
                        color = lineNumColor,
                        fontSize = 10.sp,
                        fontFamily = CodeFont
                    )
                    Spacer(Modifier.width(8.dp))
                    // New line number (right)
                    Text(
                        text = line.newLineNum?.toString()?.padStart(newLineNumWidth) ?: "",
                        color = lineNumColor,
                        fontSize = 10.sp,
                        fontFamily = CodeFont
                    )
                    Spacer(Modifier.width(10.dp))
                    // Diff marker
                    val marker = when (line.type) {
                        DiffLineType.ADD -> "+"
                        DiffLineType.DEL -> "-"
                        DiffLineType.CONTEXT -> " "
                    }
                    Text(marker, color = lineNumColor, fontSize = 10.sp, fontFamily = CodeFont)
                    Spacer(Modifier.width(6.dp))
                    // Content with syntax highlighting
                    Text(
                        text = highlightedLines[index],
                        color = textColor,
                        fontSize = 11.sp,
                        fontFamily = CodeFont,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))
    }
}
