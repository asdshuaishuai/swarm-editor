package com.swarmeditor.desktop.ui.plugins

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PluginDetailLayoutTest {
    @Test
    fun `narrow plugin detail stacks side information below content`() {
        val layout = pluginDetailLayout(720)

        assertTrue(layout.stacked)
        assertEquals(16, layout.horizontalPadding)
        assertEquals(12, layout.gap)
    }

    @Test
    fun `wide plugin detail preserves dedicated side panel`() {
        val layout = pluginDetailLayout(960)

        assertFalse(layout.stacked)
        assertEquals(280, layout.sidePanelWidth)
        assertEquals(24, layout.horizontalPadding)
    }
}
