package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color
import java.util.prefs.Preferences

enum class AppThemeMode(val id: String, val label: String, val description: String) {
    FUSION("fusion", "Swarm Fusion", "Glass、Clay、Hybrid 与动态磁贴融合的统一设计语言"),
    ;

    companion object {
        fun fromId(id: String?): AppThemeMode = when (id) {
            FUSION.id -> FUSION
            else -> FUSION
        }
    }
}

data class SwarmPalette(
    val bg0: Color,
    val bg1: Color,
    val bg2: Color,
    val bg3: Color,
    val line: Color,
    val line2: Color,
    val tx: Color,
    val tx2: Color,
    val tx3: Color,
    val ac: Color,
    val ac2: Color,
    val acLight: Color,
    val onAccent: Color,
    val scrim: Color,
    val controlBlue: Color,
    val controlPurple: Color,
    val controlGreen: Color,
    val controlOrange: Color,
    val controlRed: Color,
    val agentClaude: Color,
    val agentQwen: Color,
    val agentGemini: Color,
    val agentKimi: Color,
    val agentOpenCode: Color,
    val ok: Color,
    val okLight: Color,
    val warn: Color,
    val warnLight: Color,
    val err: Color,
    val errLight: Color,
)

object ThemeRuntime {
    var palette: SwarmPalette = fusionPalette
        private set

    fun use(theme: AppThemeMode) {
        palette = fusionPalette
    }
}

object ThemePreferences {
    private const val KEY_THEME = "theme"
    private val preferences by lazy { Preferences.userNodeForPackage(ThemePreferences::class.java) }

    fun load(): AppThemeMode = runCatching {
        AppThemeMode.fromId(
            System.getProperty("swarm.theme") ?: preferences.get(KEY_THEME, AppThemeMode.FUSION.id)
        )
    }.getOrDefault(AppThemeMode.FUSION)

    fun save(theme: AppThemeMode) {
        runCatching { preferences.put(KEY_THEME, theme.id) }
    }
}

private val fusionPalette = SwarmPalette(
    bg0 = Color(0xFF11151C), bg1 = Color(0xE6171C25), bg2 = Color(0xF21D2430), bg3 = Color(0xFF27303D),
    line = Color(0xFF303A49), line2 = Color(0xFF435064), tx = Color(0xFFE8EDF5), tx2 = Color(0xFFB4BECD),
    tx3 = Color(0xFF7F8A9B), ac = Color(0xFF8FAFD1), ac2 = Color(0xFFA89BCB), acLight = Color(0xFFC7D8EA),
    onAccent = Color(0xFF11151C), scrim = Color(0xFF090C11),
    controlBlue = Color(0xFF70A9EB), controlPurple = Color(0xFFAA92E3), controlGreen = Color(0xFF70BE91),
    controlOrange = Color(0xFFDDA15E), controlRed = Color(0xFFE07D89),
    agentClaude = Color(0xFFAB9DC8), agentQwen = Color(0xFF88A9C8), agentGemini = Color(0xFF82B5A3),
    agentKimi = Color(0xFFC8AD7F), agentOpenCode = Color(0xFFC79A88), ok = Color(0xFF79AD91),
    okLight = Color(0xFFA7CFB5), warn = Color(0xFFC3A16F), warnLight = Color(0xFFDCC39C),
    err = Color(0xFFC7838D), errLight = Color(0xFFE0AAB2),
)
