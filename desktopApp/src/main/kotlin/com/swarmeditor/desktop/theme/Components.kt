package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import kotlinx.coroutines.delay

// ── Hover tooltip（对齐核心稿 [data-tip]，300ms 防抖避免闪烁）──
@Composable
fun HoverTipBox(
    tip: String,
    modifier: Modifier = Modifier,
    below: Boolean = true,
    content: @Composable () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    var showTip by remember { mutableStateOf(false) }
    // 防抖：hover 持续 300ms 才显示；离开立即隐藏。避免 Popup 弹出后鼠标循环触发的闪烁。
    LaunchedEffect(hovered) {
        if (hovered) { delay(300); showTip = true } else { showTip = false }
    }
    Box(modifier.hoverable(interaction)) {
        content()
        if (showTip && tip.isNotEmpty()) {
            Popup(
                alignment = if (below) Alignment.BottomCenter else Alignment.TopCenter,
                offset = IntOffset(0, if (below) 8 else -8)
            ) {
                Text(
                    tip, color = Tx, fontSize = 11.sp, fontFamily = SansFont,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF0a0c14))
                        .border(1.dp, Line2, RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}

// ── 模态打开入场动画（淡入 + 轻微放大，对齐核心稿 @keyframes modalIn）──
@Composable
fun Modifier.modalEnter(): Modifier {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val alpha by animateFloatAsState(if (shown) 1f else 0f, Motion.floatSnappy, label = "modalAlpha")
    val scale by animateFloatAsState(if (shown) 1f else 0.96f, Motion.floatDefault, label = "modalScale")
    return this.graphicsLayer { this.alpha = alpha; scaleX = scale; scaleY = scale }
}

// ── Card style ───────────────────────────────────────────────
fun Modifier.cardBg(): Modifier = this
    .clip(RoundedCornerShape(R8))
    .background(Bg2)
    .border(1.dp, Line, RoundedCornerShape(R8))

fun Modifier.glassBg(): Modifier = this.background(Bg2)

// ── Section label ────────────────────────────────────────────
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        color = Tx3,
        letterSpacing = 0.6.sp,
        modifier = modifier
    )
}


// ── Pulse dot (扩散环动画，对齐核心稿 .pulse) ────────────────
@Composable
fun PulseDot(
    color: Color = Ok,
    modifier: Modifier = Modifier,
    dotSize: androidx.compose.ui.unit.Dp = 6.dp
) {
    val t = rememberInfiniteTransition(label = "pulse")
    val scale by t.animateFloat(1f, 2.4f, infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart), label = "scale")
    val alpha by t.animateFloat(0.6f, 0f, infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart), label = "alpha")
    Box(modifier.size(dotSize + 8.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.matchParentSize().graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = alpha }.clip(CircleShape).background(color))
        Box(Modifier.size(dotSize).clip(CircleShape).background(color))
    }
}

// ── 卡片悬停上浮 + 阴影 + scale（Mac 式微交互）──
@Composable
fun Modifier.hoverLift(shape: Shape = RoundedCornerShape(12.dp)): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val elev by animateDpAsState(if (hovered) 8.dp else 2.dp, Motion.dpDefault, label = "hoverLift")
    val scale by animateFloatAsState(
        when { pressed -> 0.97f; hovered -> 1.02f; else -> 1f },
        Motion.floatDefault, label = "hoverScale"
    )
    return this
        .hoverable(interaction)
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .offset(y = if (hovered) (-1).dp else 0.dp)
        .shadow(elev, shape, clip = false)
}


// ── Session card (sidebar) ──────────────────────────────────
@Composable
fun SessionCard(
    title: String,
    agentLetter: String,
    agentBackground: Color,
    agentName: String,
    timeAgo: String,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = if (isActive) Bg3 else Color.Transparent
    Column(
        modifier = modifier
            .fillMaxWidth()
            .hoverLift(RoundedCornerShape(R8))
            .clip(RoundedCornerShape(R8))
            .background(bg)
            .then(
                if (isActive) Modifier.border(1.dp, Ac.withAlpha(0.2f), RoundedCornerShape(R8))
                else Modifier
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Text(
            text = title,
            color = Tx,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1
        )
        Spacer(Modifier.height(3.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(agentBackground),
                contentAlignment = Alignment.Center
            ) {
                Text(agentLetter, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(6.dp))
            Text(agentName, color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
            Text(" · ", color = Tx3.withAlpha(0.5f), fontSize = 11.sp)
            Text(timeAgo, color = Tx3, fontSize = 11.sp)
        }
    }
}


// ── Filter chip ─────────────────────────────────────────────
@Composable
fun FilterChip(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(R7))
            .background(if (active) Ac.withAlpha(0.12f) else Bg2)
            .border(1.dp, if (active) Ac else Line, RoundedCornerShape(R7))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (active) AcLight else Tx3,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = SansFont
        )
    }
}

// ── Ac.withAlpha(0.3f) button (gradient primary) ──────────────────────────
@Composable
fun GlowButton(
    text: String,
    active: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = if (active) {
        Modifier.background(
            Brush.linearGradient(listOf(Ac, Ac2)),
            RoundedCornerShape(R8)
        )
    } else {
        Modifier.background(Bg2, RoundedCornerShape(R8))
    }
    val textColor = if (active) Color.White else Tx2
    Box(
        modifier = modifier
            .then(bg)
            .border(1.dp, if (active) Ac else Line, RoundedCornerShape(R8))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = textColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont
        )
    }
}

// ── Ghost button ────────────────────────────────────────────
@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false
) {
    val textColor = if (danger) ErrLight else Tx2
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = textColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont
        )
    }
}



// ── FormField (labeled input row) ──────────────────────────
@Composable
fun FormField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false
) {
    Column(modifier = modifier) {
        Text(
            label,
            color = Tx3,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(R8))
                .background(Bg3)
                .border(1.dp, Line, RoundedCornerShape(R8))
                .padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
            Text(
                if (isPassword) "•".repeat(value.length.coerceIn(6, 16)) else value,
                color = if (value.isEmpty()) Tx3 else Tx,
                fontSize = 13.sp,
                fontFamily = SansFont
            )
        }
    }
}
