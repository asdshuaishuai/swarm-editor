package com.swarmeditor.desktop.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val Bg = Color(0xFF0a0a0f)
val Bg2 = Color(0xFF111118)
val Bg3 = Color(0xFF1a1a24)
val Bg4 = Color(0xFF242430)
val Surface = Color(0xDD111118)
val Surface2 = Color(0xB31a1a24)
val Glass = Color(0xCC0a0a0f)
val Glass2 = Color(0x99111118)
val Tx = Color(0xFFe8e8f0)
val Tx2 = Color(0xFF8888a0)
val Tx3 = Color(0xFF505068)
val Tx4 = Color(0xFF38384a)
val Ac = Color(0xFF00d4ff)
val Ac2 = Color(0xFF40e0ff)
val AcD = Color(0x1400d4ff)
val Gn = Color(0xFF00ff88)
val GnD = Color(0x1400ff88)
val Rd = Color(0xFFff3366)
val RdD = Color(0x14ff3366)
val RdD2 = Color(0x14ff3366)
val Gd = Color(0xFFffcc00)
val GdD = Color(0x14ffcc00)
val Or = Color(0xFFff8800)
val Pr = Color(0xFFaa66ff)
val PrD = Color(0x14aa66ff)
val Bd = Color(0x0FFFFFFF)
val Bd2 = Color(0x19FFFFFF)

val Glow = Color(0x4D00d4ff)
val GlowGn = Color(0x4D00ff88)

val RR: Dp = 8.dp
val RR2: Dp = 12.dp
val RR3: Dp = 16.dp

fun Modifier.Shadow(): Modifier = this.shadow(
    elevation = 30.dp,
    shape = RoundedCornerShape(RR)
)

val GeekColorScheme = darkColorScheme(
    primary = Ac,
    onPrimary = Bg,
    primaryContainer = AcD,
    onPrimaryContainer = Ac,
    secondary = Pr,
    onSecondary = Bg,
    secondaryContainer = PrD,
    onSecondaryContainer = Pr,
    tertiary = Gn,
    onTertiary = Bg,
    tertiaryContainer = GnD,
    onTertiaryContainer = Gn,
    error = Rd,
    onError = Bg,
    errorContainer = RdD,
    onErrorContainer = Rd,
    background = Bg,
    onBackground = Tx,
    surface = Bg2,
    onSurface = Tx,
    surfaceVariant = Bg3,
    onSurfaceVariant = Tx2,
    outline = Bd,
    outlineVariant = Bd2,
)
