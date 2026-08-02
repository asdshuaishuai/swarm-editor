package com.swarmeditor.desktop.ui.plugins

internal data class PluginDetailLayout(
    val stacked: Boolean,
    val horizontalPadding: Int,
    val verticalPadding: Int,
    val gap: Int,
    val sidePanelWidth: Int,
)

internal fun pluginDetailLayout(widthDp: Int): PluginDetailLayout = when {
    widthDp < 900 -> PluginDetailLayout(
        stacked = true,
        horizontalPadding = 16,
        verticalPadding = 12,
        gap = 12,
        sidePanelWidth = 280,
    )
    else -> PluginDetailLayout(
        stacked = false,
        horizontalPadding = 24,
        verticalPadding = 18,
        gap = 18,
        sidePanelWidth = 280,
    )
}
