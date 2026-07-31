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
        private const val RightPanelBreakpoint = 1280
        private const val WideBreakpoint = 1440
        private const val CompactSidebarWidth = 240
        private const val DualSidebarWidth = 248
        private const val WideSidebarWidth = 264
        private const val MediumRightPanelWidth = 296
        private const val RightPanelWidth = 336

        fun forWidth(width: Int): ShellLayout = when {
            width < CompactBreakpoint -> ShellLayout(false, false, 0, 0)
            width < RightPanelBreakpoint -> ShellLayout(true, false, CompactSidebarWidth, 0)
            width < WideBreakpoint -> ShellLayout(true, true, DualSidebarWidth, MediumRightPanelWidth)
            else -> ShellLayout(true, true, WideSidebarWidth, RightPanelWidth)
        }
    }
}
