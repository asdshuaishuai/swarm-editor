package com.swarmeditor.desktop.ui.layout

internal data class ShellLayout(
    val showLeftSidebar: Boolean,
    val showRightPanel: Boolean,
    val leftSidebarWidth: Int,
    val rightPanelWidth: Int
) {
    fun shouldMountRightPanel(requested: Boolean, workspaceSupportsPanel: Boolean): Boolean {
        return requested && showRightPanel && workspaceSupportsPanel
    }

    companion object {
        private const val CompactBreakpoint = 920
        private const val RightPanelBreakpoint = 1200
        private const val WideBreakpoint = 1440
        private const val SidebarWidth = 264
        private const val MediumRightPanelWidth = 312
        private const val RightPanelWidth = 336

        fun forWidth(width: Int): ShellLayout = when {
            width < CompactBreakpoint -> ShellLayout(false, false, 0, 0)
            width < RightPanelBreakpoint -> ShellLayout(true, false, SidebarWidth, 0)
            width < WideBreakpoint -> ShellLayout(true, true, SidebarWidth, MediumRightPanelWidth)
            else -> ShellLayout(true, true, SidebarWidth, RightPanelWidth)
        }
    }
}
