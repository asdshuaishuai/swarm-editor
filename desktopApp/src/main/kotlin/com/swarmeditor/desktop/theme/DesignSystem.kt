package com.swarmeditor.desktop.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Swarm Editor Design System — 统一设计 token（对齐 JetBrains IDE 开发标准）
 *
 * 所有组件应优先引用这些 token，而非 ad-hoc 硬编码值。
 * 类似 CSS 的 class system——可复用、一致、可维护。
 */

// ═══════════════════════════════════════════════════════════════
// Spacing — 4dp 间距栅格（JetBrains 标准）
// ═══════════════════════════════════════════════════════════════
object Spacing {
    val xs = 4.dp    // 紧凑间距（icon-text、chip 内部）
    val sm = 8.dp    // 标准间距（元素间）
    val md = 12.dp   // 中等间距（卡片内 padding）
    val lg = 16.dp   // 大间距（区域 padding）
    val xl = 24.dp   // 区域间距（view padding）
    val xxl = 32.dp  // 最大间距（composer wrap）
    val panel = 18.dp
    val section = 20.dp
    val tileGap = 10.dp
}

// ═══════════════════════════════════════════════════════════════
// Shapes — 圆角阶梯（Hybrid：整体上调一档，更柔；6/8/12/16/20dp）
// ═══════════════════════════════════════════════════════════════
object AppShapes {
    val xs get() = RoundedCornerShape(R6)
    val sm get() = RoundedCornerShape(10.dp)
    val md get() = RoundedCornerShape(14.dp)
    val lg get() = RoundedCornerShape(18.dp)
    val pill get() = RoundedCornerShape(999.dp)
    val xl = RoundedCornerShape(22.dp)
}

object TileMetrics {
    val compactHeight = 36.dp
    val standardHeight = 72.dp
    val featureHeight = 98.dp
    val iconSize = 30.dp
    val contentPadding = 12.dp
}

// ═══════════════════════════════════════════════════════════════
// Typography — 字号阶梯（10/11/12/13/14sp，JetBrains IDE 标准）
// ═══════════════════════════════════════════════════════════════
object AppType {
    val micro = TextStyle(
        fontFamily = SansFont,
        fontSize = 10.sp,
        lineHeight = 13.sp,
        fontWeight = FontWeight.SemiBold,
    )
    val caption = TextStyle(
        fontFamily = SansFont,
        fontSize = 11.sp,
        lineHeight = 15.sp,
        fontWeight = FontWeight.Normal,
    )
    val bodySm = TextStyle(
        fontFamily = SansFont,
        fontSize = 12.sp,
        lineHeight = 17.sp,
        fontWeight = FontWeight.Normal,
    )
    val body = TextStyle(
        fontFamily = SansFont,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        fontWeight = FontWeight.Normal,
    )
    val bodyMd = TextStyle(
        fontFamily = SansFont,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Normal,
    )
    val title = TextStyle(
        fontFamily = SansFont,
        fontSize = 15.sp,
        lineHeight = 21.sp,
        fontWeight = FontWeight.SemiBold,
    )
    val headline = TextStyle(
        fontFamily = SansFont,
        fontSize = 18.sp,
        lineHeight = 25.sp,
        fontWeight = FontWeight.Bold,
    )
    val display = TextStyle(
        fontFamily = SansFont,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
    )
}

// ═══════════════════════════════════════════════════════════════
// Elevation — 阴影层次（营造深度感）
// ═══════════════════════════════════════════════════════════════
object Elevation {
    val none = 0.dp   // 平面（背景元素）
    val low = 4.dp
    val medium = 8.dp
    val high = 12.dp
    val modal = 20.dp
}

// ═══════════════════════════════════════════════════════════════
// CSS-like Modifier extensions — 可复用样式（类似 CSS class）
// ═══════════════════════════════════════════════════════════════

/** 卡片表面：Fusion/Win11 使用色阶和边框，只有 Clay 使用实体投影。 */
fun Modifier.surfaceCard(
    bg: Color = Bg2,
    border: Color = Line,
    elevation: androidx.compose.ui.unit.Dp = Elevation.low,
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.md
): Modifier = this
    .clip(shape)
    .background(bg)
    .border(1.dp, border, shape)

/** 输入框表面（bg + border，无 shadow） */
fun Modifier.surfaceInput(
    bg: Color = Bg2.copy(alpha = 0.6f),
    border: Color = Line,
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.md
): Modifier = this
    .clip(shape)
    .background(bg)
    .border(1.dp, border, shape)

/** hover 高亮表面（半透明 accent bg + border） */
fun Modifier.surfaceHover(
    active: Boolean,
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.md
): Modifier = this
    .clip(shape)
    .background(if (active) Ac.withAlpha(0.12f) else Color.Transparent)
    .border(
        1.dp,
        if (active) Ac.withAlpha(0.2f) else Color.Transparent,
        shape
    )

/** 强调色按钮：避免桌面端 hover 阴影重建导致闪烁。 */
fun Modifier.accentButton(
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.sm
): Modifier = this
    .clip(shape)
    .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Ac, Ac2)))
