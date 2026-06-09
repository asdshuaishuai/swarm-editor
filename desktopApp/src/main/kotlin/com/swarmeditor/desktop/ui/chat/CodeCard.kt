package com.swarmeditor.desktop.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

data class DiffLine(val type: DiffLineType, val lineNum: Int, val content: String)

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
                word in KOTLIN_KEYWORDS -> withStyle(SpanStyle(color = Pr)) { append(word) }
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
    val shape = RoundedCornerShape(10.dp)
    val lineNumWidth = card.diffLines.maxOfOrNull { it.lineNum.toString().length } ?: 1

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Bg3)
            .border(1.dp, Bd, shape)
    ) {
        // File header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("📄", fontSize = 12.sp)
            Spacer(Modifier.width(6.dp))
            // Extension badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(Ac.copy(alpha = 0.12f))
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            ) {
                Text(
                    card.extension.uppercase(),
                    color = Ac,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = MonoFont
                )
            }
            Spacer(Modifier.width(6.dp))
            Text(card.filename, color = Tx, fontSize = 12.sp, fontFamily = MonoFont)
            Spacer(Modifier.weight(1f))
            // Diff stats
            if (card.additions > 0) {
                Text("+${card.additions}", color = Gn, fontSize = 10.sp, fontFamily = MonoFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            if (card.deletions > 0) {
                Text("-${card.deletions}", color = Rd, fontSize = 10.sp, fontFamily = MonoFont, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(4.dp))
            }
            // Copy button
            Text("📋", fontSize = 11.sp, modifier = Modifier.clickable { /* copy to clipboard */ })
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
                    DiffLineType.DEL -> Rd.copy(alpha = 0.7f)
                    else -> Tx
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bgColor)
                        .padding(horizontal = 12.dp, vertical = 1.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Line number (right-aligned)
                    Text(
                        text = line.lineNum.toString().padStart(lineNumWidth),
                        color = Tx3,
                        fontSize = 10.sp,
                        fontFamily = MonoFont
                    )
                    Spacer(Modifier.width(12.dp))
                    // Content with syntax highlighting
                    val content = when (line.type) {
                        DiffLineType.ADD -> "+${line.content}"
                        DiffLineType.DEL -> "-${line.content}"
                        DiffLineType.CONTEXT -> line.content
                    }
                    Text(
                        text = highlightSyntax(content),
                        color = textColor,
                        fontSize = 11.sp,
                        fontFamily = MonoFont,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))
    }
}
