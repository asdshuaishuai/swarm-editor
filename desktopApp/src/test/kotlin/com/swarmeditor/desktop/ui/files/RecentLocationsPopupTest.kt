package com.swarmeditor.desktop.ui.files

import com.swarmeditor.desktop.viewmodel.EditorLocation
import com.swarmeditor.desktop.viewmodel.RecentEditorLocation
import kotlin.test.Test
import kotlin.test.assertEquals

class RecentLocationsPopupTest {
    @Test
    fun `recent locations search matches paths and snippets`() {
        val locations = listOf(
            RecentEditorLocation(EditorLocation("src/Main.kt", 4), "fun main()"),
            RecentEditorLocation(EditorLocation("docs/Guide.md"), "Installation guide"),
        )

        assertEquals(listOf("src/Main.kt"), filteredRecentLocations(locations, "main").map { it.location.path })
        assertEquals(listOf("docs/Guide.md"), filteredRecentLocations(locations, "installation").map { it.location.path })
        assertEquals("⌘⇧E", recentLocationsShortcutLabel("Mac OS X"))
        assertEquals("Ctrl+Shift+E", recentLocationsShortcutLabel("Linux"))
    }
}
