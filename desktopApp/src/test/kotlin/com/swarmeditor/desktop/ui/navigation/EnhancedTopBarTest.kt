package com.swarmeditor.desktop.ui.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EnhancedTopBarTest {
    @Test
    fun `compact top bar removes redundant brand and shortcut`() {
        val presentation = topBarPresentation(800)

        assertFalse(presentation.showBrand)
        assertFalse(presentation.showShortcut)
        assertEquals("搜索", presentation.searchLabel)
    }

    @Test
    fun `wide top bar exposes full search affordance`() {
        val presentation = topBarPresentation(1280)

        assertTrue(presentation.showBrand)
        assertTrue(presentation.showShortcut)
        assertEquals("搜索命令、文件与能力…", presentation.searchLabel)
    }
}
