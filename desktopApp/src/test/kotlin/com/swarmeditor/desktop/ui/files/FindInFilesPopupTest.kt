package com.swarmeditor.desktop.ui.files

import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.desktop.viewmodel.ProjectSearchUiState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FindInFilesPopupTest {
    @Test
    fun `search summary reports bounded matches and scanned files`() {
        val match = ProjectService.SearchMatch("src/Main.kt", 3, 4, 9, "    swarm()")
        val state = ProjectSearchUiState(
            query = "swarm",
            matches = listOf(match, match.copy(startCharacter = 6, endCharacter = 11)),
            filesSearched = 14,
            truncated = true,
        )

        assertEquals("2+ 个匹配 · 1 个文件 · 已扫描 14 个文本文件", searchResultSummary(state))
        assertEquals("⌘⇧F", findInFilesShortcutLabel("Mac OS X"))
        assertEquals("Ctrl+Shift+F", findInFilesShortcutLabel("Linux"))
    }

    @Test
    fun `search line highlights the exact source range`() {
        val line = highlightedSearchLine(
            ProjectService.SearchMatch("src/Main.kt", 0, 4, 9, "run swarm now"),
        )

        assertEquals("run swarm now", line.text)
        assertTrue(line.spanStyles.any { it.start == 4 && it.end == 9 })
    }
}
