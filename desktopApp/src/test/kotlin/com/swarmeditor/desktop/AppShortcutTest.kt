package com.swarmeditor.desktop

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppShortcutTest {
    @Test
    fun `double shift accepts deliberate taps and rejects repeats`() {
        val first = 1_000_000_000L

        assertTrue(isDoubleShiftTap(first, first + 180_000_000L))
        assertFalse(isDoubleShiftTap(first, first + 20_000_000L))
        assertFalse(isDoubleShiftTap(first, first + 500_000_000L))
        assertFalse(isDoubleShiftTap(0L, first))
    }
}
