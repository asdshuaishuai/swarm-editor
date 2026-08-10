package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.lsp.SourceFoldingRange
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

internal data class MarkdownDocumentStructure(
    val symbols: List<SourceSymbol> = emptyList(),
    val foldingRanges: List<SourceFoldingRange> = emptyList(),
)

private data class MarkdownHeading(
    val name: String,
    val level: Int,
    val line: Int,
)

internal fun markdownDocumentStructure(path: String, content: String): MarkdownDocumentStructure {
    if (path.substringAfterLast('.', "").lowercase() !in setOf("md", "markdown") || content.isBlank()) {
        return MarkdownDocumentStructure()
    }

    val tree = MarkdownParser(CommonMarkFlavourDescriptor()).buildMarkdownTreeFromString(content)
    val headings = buildList {
        tree.visitDepthFirst { node ->
            val level = markdownHeadingLevels[node.type] ?: return@visitDepthFirst
            val rawHeading = content.substring(node.startOffset, node.endOffset)
            val name = headingText(rawHeading, node.type == MarkdownElementTypes.SETEXT_1 || node.type == MarkdownElementTypes.SETEXT_2)
            if (name.isNotBlank()) {
                add(MarkdownHeading(name, level, content.countNewlinesBefore(node.startOffset)))
            }
        }
    }
    val hierarchy = mutableListOf<MarkdownHeading>()
    val symbols = headings.map { heading ->
        while (hierarchy.lastOrNull()?.level?.let { it >= heading.level } == true) hierarchy.removeLast()
        SourceSymbol(
            name = heading.name,
            kind = "Heading ${heading.level}",
            containerName = hierarchy.lastOrNull()?.name,
            line = heading.line,
        ).also { hierarchy += heading }
    }
    val lastLine = content.lines().lastIndex
    val foldingRanges = headings.mapIndexedNotNull { index, heading ->
        val nextBoundary = headings.drop(index + 1).firstOrNull { it.level <= heading.level }?.line ?: (lastLine + 1)
        val endLine = (nextBoundary - 1).coerceAtMost(lastLine)
        SourceFoldingRange(heading.line, endLine, kind = "region").takeIf { endLine > heading.line }
    }
    return MarkdownDocumentStructure(symbols, foldingRanges)
}

internal fun markdownOutlineSymbols(path: String, content: String): List<SourceSymbol> =
    markdownDocumentStructure(path, content).symbols

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
