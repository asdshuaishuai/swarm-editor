package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AppThemeModeTest {
    @AfterTest
    fun resetTheme() {
        ThemeRuntime.use(AppThemeMode.FUSION)
    }

    @Test
    fun `runtime always applies the unified fusion palette`() {
        val initialBackground = Bg0
        ThemeRuntime.use(AppThemeMode.FUSION)

        assertEquals(initialBackground, Bg0)
    }

    @Test
    fun `legacy and unknown persisted theme ids migrate to fusion`() {
        listOf(null, "unknown", "hybrid", "flat", "clay", "glass", "frutiger", "win11").forEach { id ->
            assertEquals(AppThemeMode.FUSION, AppThemeMode.fromId(id))
        }
    }

    @Test
    fun `default palette keeps text readable and accent colors muted`() {
        ThemeRuntime.use(AppThemeMode.FUSION)
        val palette = ThemeRuntime.palette

        assertTrue(contrastRatio(palette.tx, palette.bg0) >= 12.0)
        assertTrue(contrastRatio(palette.tx2, palette.bg0) >= 8.0)
        assertTrue(contrastRatio(palette.tx3, palette.bg0) >= 4.5)
        assertTrue(
            listOf(
                palette.ac,
                palette.ac2,
                palette.agentClaude,
                palette.agentQwen,
                palette.agentGemini,
                palette.agentKimi,
                palette.agentOpenCode,
                palette.ok,
                palette.warn,
                palette.err,
            ).all { background -> contrastRatio(palette.onAccent, background) >= 4.5 }
        )
        assertTrue(contrastRatio(palette.scrim, palette.tx) >= 12.0)
        assertTrue(
            listOf(palette.ac, palette.ac2).all { background ->
                contrastRatio(composite(palette.onAccent.copy(alpha = 0.8f), background), background) >= 4.5
            }
        )
        assertTrue(
            listOf(
                palette.ac,
                palette.ac2,
                palette.agentClaude,
                palette.agentQwen,
                palette.agentGemini,
                palette.agentKimi,
                palette.agentOpenCode,
                palette.ok,
                palette.warn,
                palette.err,
            ).all { color -> colorChroma(color) <= 0.35f }
        )
        val controlColors = listOf(
            palette.controlBlue,
            palette.controlPurple,
            palette.controlGreen,
            palette.controlOrange,
            palette.controlRed,
        )
        assertTrue(controlColors.all { background -> contrastRatio(palette.onAccent, background) >= 4.5 })
        assertTrue(controlColors.all { color -> colorChroma(color) <= 0.5f })
    }

    private fun contrastRatio(first: Color, second: Color): Double {
        val lighter = maxOf(relativeLuminance(first), relativeLuminance(second))
        val darker = minOf(relativeLuminance(first), relativeLuminance(second))
        return (lighter + 0.05) / (darker + 0.05)
    }

    private fun relativeLuminance(color: Color): Double =
        0.2126 * linearChannel(color.red) +
            0.7152 * linearChannel(color.green) +
            0.0722 * linearChannel(color.blue)

    private fun linearChannel(channel: Float): Double {
        val value = channel.toDouble()
        return if (value <= 0.04045) value / 12.92 else Math.pow((value + 0.055) / 1.055, 2.4)
    }

    private fun colorChroma(color: Color): Float =
        maxOf(color.red, color.green, color.blue) - minOf(color.red, color.green, color.blue)

    private fun composite(foreground: Color, background: Color): Color = Color(
        red = foreground.red * foreground.alpha + background.red * (1f - foreground.alpha),
        green = foreground.green * foreground.alpha + background.green * (1f - foreground.alpha),
        blue = foreground.blue * foreground.alpha + background.blue * (1f - foreground.alpha),
        alpha = 1f,
    )
}
