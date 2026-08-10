package com.swarmeditor.desktop.theme

import androidx.compose.ui.graphics.Color
import java.util.prefs.Preferences

enum class AppThemeMode(val id: String, val label: String, val description: String) {
    FUSION("fusion", "Swarm IntelliJ", "基于 IntelliJ New UI 的紧凑桌面设计语言"),
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
    bg0 = Color(0xFF1E1F22), bg1 = Color(0xFF24262B), bg2 = Color(0xFF2B2D30), bg3 = Color(0xFF393B40),
    line = Color(0xFF34363A), line2 = Color(0xFF4E5157), tx = Color(0xFFDFE1E5), tx2 = Color(0xFFB4B8BF),
    tx3 = Color(0xFF8B8F96), ac = Color(0xFF3F5B85), ac2 = Color(0xFF4E466F), acLight = Color(0xFF7894C6),
    onAccent = Color(0xFFFFFFFF), scrim = Color(0xFF121316),
    controlBlue = Color(0xFF3F5B85), controlPurple = Color(0xFF4E466F), controlGreen = Color(0xFF46664F),
    controlOrange = Color(0xFF654B32), controlRed = Color(0xFF70494F),
    agentClaude = Color(0xFF59486E), agentQwen = Color(0xFF475F75), agentGemini = Color(0xFF46664F),
    agentKimi = Color(0xFF715B38), agentOpenCode = Color(0xFF70494F), ok = Color(0xFF46664F),
    okLight = Color(0xFF79A584), warn = Color(0xFF715B38), warnLight = Color(0xFFD3A957),
    err = Color(0xFF70494F), errLight = Color(0xFFD9828D),
)
