package com.swarmeditor.desktop.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.platform.Font
import androidx.compose.ui.unit.dp

// Radii
val R4 = 4.dp
val R6 = 6.dp
val R7 = 7.dp
val R8 = 8.dp
val R9 = 9.dp
val R10 = 10.dp
val R11 = 11.dp
val R12 = 12.dp
val R14 = 14.dp
val R16 = 16.dp

// Fonts — Inter 为主（设计稿本意 / SF Pro 合法替身），CJK 由系统回退
// 从 JVM 资源取 Inter.ttf 到临时文件，用 platform.Font + FontVariation 取变体字重（非 @Composable）
private val interFile: java.io.File by lazy {
    val tmp = java.io.File.createTempFile("inter-", ".ttf").apply { deleteOnExit() }
    val cl = Thread.currentThread().contextClassLoader ?: ClassLoader.getSystemClassLoader()
    cl.getResourceAsStream("fonts/Inter.ttf")!!.use { input ->
        tmp.outputStream().use { output -> input.copyTo(output) }
    }
    tmp
}

@OptIn(ExperimentalTextApi::class)
val InterFontFamily: FontFamily = FontFamily(
    Font(interFile, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(interFile, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(interFile, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(interFile, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)
val SansFont = InterFontFamily
val MonoFont = FontFamily.Default   // 系统等宽（CJK 回退；后续可换 JetBrains Mono）
val CodeFont = FontFamily.Monospace // 代码块专用

// Material3 ColorScheme override
val GeekColorScheme = darkColorScheme(
    primary = Ac,
    onPrimary = Bg0,
    primaryContainer = Ac.withAlpha(0.12f),
    onPrimaryContainer = AcLight,
    secondary = AgentQwen,
    onSecondary = Bg0,
    secondaryContainer = AgentQwen.withAlpha(0.12f),
    onSecondaryContainer = Color(0xFF93c5fd),
    tertiary = AgentGemini,
    onTertiary = Bg0,
    tertiaryContainer = AgentGemini.withAlpha(0.12f),
    onTertiaryContainer = Color(0xFF6ee7b7),
    error = Err,
    onError = Bg0,
    errorContainer = Err.withAlpha(0.12f),
    onErrorContainer = ErrLight,
    background = Bg0,
    onBackground = Tx,
    surface = Bg2,
    onSurface = Tx,
    surfaceVariant = Bg3,
    onSurfaceVariant = Tx2,
    outline = Line,
    outlineVariant = Line2,
)
