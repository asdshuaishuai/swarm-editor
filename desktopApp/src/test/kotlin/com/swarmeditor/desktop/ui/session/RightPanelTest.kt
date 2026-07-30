package com.swarmeditor.desktop.ui.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RightPanelTest {
    @Test
    fun `tab badge labels remain compact without changing tab width`() {
        assertNull(compactTabBadgeLabel(0))
        assertEquals("1", compactTabBadgeLabel(1))
        assertEquals("12", compactTabBadgeLabel(12))
        assertEquals("99+", compactTabBadgeLabel(100))
    }

    @Test
    fun `activity feed follows only while anchored at the top`() {
        assertTrue(isActivityFeedAtStart(firstVisibleItemIndex = 0, firstVisibleItemScrollOffset = 0))
        assertTrue(isActivityFeedAtStart(firstVisibleItemIndex = 0, firstVisibleItemScrollOffset = 8))
        assertFalse(isActivityFeedAtStart(firstVisibleItemIndex = 0, firstVisibleItemScrollOffset = 9))
        assertFalse(isActivityFeedAtStart(firstVisibleItemIndex = 1, firstVisibleItemScrollOffset = 0))
    }
}
