package com.swarmeditor.desktop.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
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

// Fonts — use system default fonts for full CJK support
val SansFont = FontFamily.Default
val MonoFont = FontFamily.Default  // System font (has CJK fallback on Linux)
val CodeFont = FontFamily.Monospace  // Monospace for code blocks only

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
