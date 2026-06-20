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
}

// ═══════════════════════════════════════════════════════════════
// Shapes — 圆角阶梯（4/6/8/12dp，JetBrains 标准）
// ═══════════════════════════════════════════════════════════════
object AppShapes {
    val xs = RoundedCornerShape(4.dp)   // badge/tag/ext
    val sm = RoundedCornerShape(6.dp)   // chip/button
    val md = RoundedCornerShape(8.dp)   // card/input
    val lg = RoundedCornerShape(12.dp)  // large card/modal
    val xl = RoundedCornerShape(16.dp)  // modal/hero
}

// ═══════════════════════════════════════════════════════════════
// Typography — 字号阶梯（10/11/12/13/14sp，JetBrains IDE 标准）
// ═══════════════════════════════════════════════════════════════
object AppType {
    val micro = TextStyle(fontSize = 9.sp, fontWeight = FontWeight.SemiBold)   // badge
    val caption = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Normal)  // 时间戳/标签
    val bodySm = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Normal)  // 元信息
    val body = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal)    // 正文
    val bodyMd = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Normal)  // 大正文
    val title = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold) // 标题
    val headline = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Bold)  // 大标题
    val display = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold)   // hero 标题
}

// ═══════════════════════════════════════════════════════════════
// Elevation — 阴影层次（营造深度感）
// ═══════════════════════════════════════════════════════════════
object Elevation {
    val none = 0.dp   // 平面（背景元素）
    val low = 2.dp    // 卡片基础（微妙浮起）
    val medium = 4.dp // 弹出元素（tooltip/dropdown）
    val high = 8.dp   // hover/active 卡片
    val modal = 16.dp // 模态框
}

// ═══════════════════════════════════════════════════════════════
// CSS-like Modifier extensions — 可复用样式（类似 CSS class）
// ═══════════════════════════════════════════════════════════════

/** 卡片表面（bg + border + shadow + radius） */
fun Modifier.surfaceCard(
    bg: Color = Bg2,
    border: Color = Line,
    elevation: androidx.compose.ui.unit.Dp = Elevation.low,
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.md
): Modifier = this
    .shadow(elevation, shape, clip = false)
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

/** 强调色按钮（渐变 bg + shadow） */
fun Modifier.accentButton(
    shape: androidx.compose.foundation.shape.RoundedCornerShape = AppShapes.sm
): Modifier = this
    .shadow(Elevation.low, shape)
    .clip(shape)
    .background(
        androidx.compose.ui.graphics.Brush.linearGradient(listOf(Ac, Ac2))
    )
