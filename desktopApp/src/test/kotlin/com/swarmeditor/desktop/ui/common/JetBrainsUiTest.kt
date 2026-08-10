package com.swarmeditor.desktop.ui.common

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class JetBrainsUiTest {
    @Test
    fun `tool window badges stay compact`() {
        assertNull(compactBadgeLabel(0))
        assertEquals("7", compactBadgeLabel(7))
        assertEquals("99+", compactBadgeLabel(100))
    }

    @Test
    fun `desktop controls use compact IntelliJ metrics`() {
        assertEquals(28f, IdeUiMetrics.rowHeight.value)
        assertEquals(26f, IdeUiMetrics.iconButtonSize.value)
        assertEquals(34f, IdeUiMetrics.toolWindowHeaderHeight.value)
    }
}
