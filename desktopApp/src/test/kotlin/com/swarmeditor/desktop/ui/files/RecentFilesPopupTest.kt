package com.swarmeditor.desktop.ui.files

import kotlin.test.Test
import kotlin.test.assertEquals

class RecentFilesPopupTest {
    @Test
    fun `recent file search preserves MRU order and matches paths`() {
        val files = listOf("README.md", "backend/src/Main.kt", "desktopApp/src/Main.kt", "README.md")

        assertEquals(listOf("README.md", "backend/src/Main.kt", "desktopApp/src/Main.kt"), filteredRecentFiles(files, ""))
        assertEquals(listOf("backend/src/Main.kt"), filteredRecentFiles(files, "backend"))
        assertEquals(listOf("backend/src/Main.kt", "desktopApp/src/Main.kt"), filteredRecentFiles(files, "main.kt"))
    }

    @Test
    fun `recent file keyboard navigation wraps in both directions`() {
        assertEquals(1, movedRecentFileIndex(current = 0, offset = 1, size = 3))
        assertEquals(0, movedRecentFileIndex(current = 2, offset = 1, size = 3))
        assertEquals(2, movedRecentFileIndex(current = 0, offset = -1, size = 3))
        assertEquals(0, movedRecentFileIndex(current = 0, offset = -1, size = 0))
    }

    @Test
    fun `recent files shortcut follows desktop platform conventions`() {
        assertEquals("⌘E", recentFilesShortcutLabel("Mac OS X"))
        assertEquals("Ctrl+E", recentFilesShortcutLabel("Linux"))
        assertEquals("Ctrl+E", recentFilesShortcutLabel("Windows 11"))
    }
}
