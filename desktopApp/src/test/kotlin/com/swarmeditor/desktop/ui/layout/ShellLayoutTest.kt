package com.swarmeditor.desktop.ui.layout

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShellLayoutTest {
    @Test
    fun `keeps a compact right panel at common desktop widths`() {
        val layout = ShellLayout.forWidth(1280)

        assertTrue(layout.showLeftSidebar)
        assertTrue(layout.showRightPanel)
        assertEquals(248, layout.leftSidebarWidth)
        assertEquals(296, layout.rightPanelWidth)
    }

    @Test
    fun `hides the right panel before the main content becomes cramped`() {
        val layout = ShellLayout.forWidth(1279)

        assertTrue(layout.showLeftSidebar)
        assertFalse(layout.showRightPanel)
        assertEquals(240, layout.leftSidebarWidth)
    }

    @Test
    fun `restores the full right panel width on wide windows`() {
        val layout = ShellLayout.forWidth(1440)

        assertTrue(layout.showRightPanel)
        assertEquals(264, layout.leftSidebarWidth)
        assertEquals(336, layout.rightPanelWidth)
    }

    @Test
    fun `mounts the right panel only for supported workspaces`() {
        val layout = ShellLayout.forWidth(1280)

        assertTrue(layout.shouldMountRightPanel(requested = true, workspaceSupportsPanel = true))
        assertFalse(layout.shouldMountRightPanel(requested = true, workspaceSupportsPanel = false))
        assertFalse(layout.shouldMountRightPanel(requested = false, workspaceSupportsPanel = true))
    }

    @Test
    fun `hides both sidebars at compact desktop widths`() {
        val layout = ShellLayout.forWidth(760)

        assertFalse(layout.showLeftSidebar)
        assertFalse(layout.showRightPanel)
        assertEquals(0, layout.leftSidebarWidth)
        assertEquals(0, layout.rightPanelWidth)
    }
}
