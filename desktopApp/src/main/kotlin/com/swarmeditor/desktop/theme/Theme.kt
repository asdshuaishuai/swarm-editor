package com.swarmeditor.desktop.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.platform.Font
import androidx.compose.ui.unit.dp

// Radii
val R4 get() = themedRadius(4)
val R6 get() = themedRadius(6)
val R7 get() = themedRadius(7)
val R8 get() = themedRadius(8)
val R9 get() = themedRadius(9)
val R10 get() = themedRadius(10)
val R11 get() = themedRadius(11)
val R12 get() = themedRadius(12)
val R14 get() = themedRadius(14)
val R16 get() = themedRadius(16)

private fun themedRadius(base: Int) = base.dp

// Fonts — Inter 为主（设计稿本意 / SF Pro 合法替身），CJK 由系统回退
// 从 JVM 资源取 Inter.ttf 到临时文件，用 platform.Font + FontVariation 取变体字重（非 @Composable）
private fun bundledFontFile(resourcePath: String, prefix: String): java.io.File {
    val tmp = java.io.File.createTempFile(prefix, ".ttf").apply { deleteOnExit() }
    val cl = Thread.currentThread().contextClassLoader ?: ClassLoader.getSystemClassLoader()
    checkNotNull(cl.getResourceAsStream(resourcePath)) { "Missing bundled font resource: $resourcePath" }.use { input ->
        tmp.outputStream().use { output -> input.copyTo(output) }
    }
    return tmp
}

private val interFile: java.io.File by lazy { bundledFontFile("fonts/Inter.ttf", "inter-") }
private val jetBrainsMonoFile: java.io.File by lazy {
    bundledFontFile("fonts/JetBrainsMono.ttf", "jetbrains-mono-")
}
private val jetBrainsMonoItalicFile: java.io.File by lazy {
    bundledFontFile("fonts/JetBrainsMono-Italic.ttf", "jetbrains-mono-italic-")
}

@OptIn(ExperimentalTextApi::class)
val InterFontFamily: FontFamily = FontFamily(
    Font(interFile, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(interFile, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(interFile, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(interFile, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)
val SansFont = InterFontFamily
@OptIn(ExperimentalTextApi::class)
val MonoFont = FontFamily(
    Font(jetBrainsMonoFile, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(jetBrainsMonoFile, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(jetBrainsMonoFile, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(jetBrainsMonoFile, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(
        jetBrainsMonoItalicFile,
        FontWeight.Normal,
        FontStyle.Italic,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
)
val CodeFont = MonoFont

// Material3 ColorScheme override
val GeekColorScheme get() = darkColorScheme(
    primary = Ac,
    onPrimary = Bg0,
    primaryContainer = Ac.withAlpha(0.12f),
    onPrimaryContainer = AcLight,
    secondary = AgentQwen,
    onSecondary = Bg0,
    secondaryContainer = AgentQwen.withAlpha(0.12f),
    onSecondaryContainer = AcLight,
    tertiary = AgentGemini,
    onTertiary = Bg0,
    tertiaryContainer = AgentGemini.withAlpha(0.12f),
    onTertiaryContainer = OkLight,
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
