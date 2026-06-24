package com.swarmeditor.desktop.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Copy
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

enum class DiffLineType { ADD, DEL, CONTEXT }

data class DiffLine(val type: DiffLineType, val oldLineNum: Int?, val newLineNum: Int?, val content: String)

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
    "enum", "companion", "suspend", "inline", "const", "lateinit", "typeof", "typeof",
    "in", "is", "as", "by", "init", "constructor", "operator", "infix", "tailrec",
    "annotation", "crossinline", "noinline", "reified", "out", "typealias"
)

/** Simple regex-based syntax highlighting for diff content lines. */
private fun highlightSyntax(text: String): AnnotatedString {
    val prefix = if (text.startsWith("+") || text.startsWith("-")) text.substring(0, 1) else ""
    val content = if (prefix.isNotEmpty()) text.substring(1) else text

    return buildAnnotatedString {
        // Tokenize by splitting on word boundaries and string literals
        val pattern = """(\"[^\"]*\"|\'[^\']*\'|\w+)""".toRegex()
        var lastIndex = 0
        for (match in pattern.findAll(content)) {
            // Append text before this match
            if (match.range.first > lastIndex) {
                append(content.substring(lastIndex, match.range.first))
            }
            val word = match.value
            when {
                word in KOTLIN_KEYWORDS -> withStyle(SpanStyle(color = AgentClaude)) { append(word) }
                word.startsWith("\"") -> withStyle(SpanStyle(color = Gn)) { append(word) }
                word.startsWith("'") -> withStyle(SpanStyle(color = Gn)) { append(word) }
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

@Composable
fun CodeCard(
    card: CodeCardData,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(R8)
    val oldLineNumWidth = card.diffLines.maxOfOrNull { it.oldLineNum?.toString()?.length ?: 1 } ?: 1
    val newLineNumWidth = card.diffLines.maxOfOrNull { it.newLineNum?.toString()?.length ?: 1 } ?: 1

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
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        if (isChipHovered) Ac.withAlpha(0.1f) else Ac.withAlpha(0.12f)
                    )
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
                Text("+${card.additions}", color = Gn, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            if (card.deletions > 0) {
                Text("-${card.deletions}", color = Rd, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            // Copy button
            Icon(
                imageVector = Feather.Copy,
                contentDescription = "Copy",
                tint = Tx3,
                modifier = Modifier.size(14.dp).clickable { /* copy to clipboard */ }
            )
        }

        // Diff lines
        Column(modifier = Modifier.fillMaxWidth()) {
            card.diffLines.forEach { line ->
                val bgColor = when (line.type) {
                    DiffLineType.ADD -> GnD
                    DiffLineType.DEL -> RdD
                    DiffLineType.CONTEXT -> androidx.compose.ui.graphics.Color.Transparent
                }
                val textColor = when (line.type) {
                    DiffLineType.DEL -> Rd.withAlpha(0.7f)
                    else -> Tx
                }
                val lineNumColor = when (line.type) {
                    DiffLineType.ADD -> OkLight
                    DiffLineType.DEL -> ErrLight
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
                        text = highlightSyntax(line.content),
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
