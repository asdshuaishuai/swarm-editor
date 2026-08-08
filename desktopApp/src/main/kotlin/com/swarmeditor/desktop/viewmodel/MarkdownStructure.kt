package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.lsp.SourceSymbol
import org.intellij.markdown.MarkdownElementTypes
import org.intellij.markdown.ast.ASTNode
import org.intellij.markdown.flavours.commonmark.CommonMarkFlavourDescriptor
import org.intellij.markdown.parser.MarkdownParser

private val markdownHeadingLevels = mapOf(
    MarkdownElementTypes.ATX_1 to 1,
    MarkdownElementTypes.ATX_2 to 2,
    MarkdownElementTypes.ATX_3 to 3,
    MarkdownElementTypes.ATX_4 to 4,
    MarkdownElementTypes.ATX_5 to 5,
    MarkdownElementTypes.ATX_6 to 6,
    MarkdownElementTypes.SETEXT_1 to 1,
    MarkdownElementTypes.SETEXT_2 to 2,
)

internal fun markdownOutlineSymbols(path: String, content: String): List<SourceSymbol> {
    if (path.substringAfterLast('.', "").lowercase() !in setOf("md", "markdown") || content.isBlank()) {
        return emptyList()
    }

    val tree = MarkdownParser(CommonMarkFlavourDescriptor()).buildMarkdownTreeFromString(content)
    return buildList {
        tree.visitDepthFirst { node ->
            val level = markdownHeadingLevels[node.type] ?: return@visitDepthFirst
            val rawHeading = content.substring(node.startOffset, node.endOffset)
            val name = headingText(rawHeading, node.type == MarkdownElementTypes.SETEXT_1 || node.type == MarkdownElementTypes.SETEXT_2)
            if (name.isNotBlank()) {
                add(
                    SourceSymbol(
                        name = name,
                        kind = "Heading $level",
                        line = content.countNewlinesBefore(node.startOffset),
                    ),
                )
            }
        }
    }
}

private fun ASTNode.visitDepthFirst(visitor: (ASTNode) -> Unit) {
    visitor(this)
    children.forEach { child -> child.visitDepthFirst(visitor) }
}

private fun headingText(rawHeading: String, isSetext: Boolean): String = if (isSetext) {
    rawHeading.lineSequence().firstOrNull().orEmpty().trim()
} else {
    rawHeading.trim().trimStart('#').trim().trimEnd('#').trim()
}

private fun String.countNewlinesBefore(offset: Int): Int {
    var count = 0
    for (index in 0 until offset.coerceIn(0, length)) {
        if (this[index] == '\n') count++
    }
    return count
}
