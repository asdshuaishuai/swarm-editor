package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
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
                        .background(Bg2)
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
    val alpha by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = Motion.alphaEnter,
        label = "modalAlpha",
    )
    val scale by animateFloatAsState(
        targetValue = if (shown) 1f else 0.985f,
        animationSpec = Motion.floatRelease,
        label = "modalScale",
    )
    return this.graphicsLayer { this.alpha = alpha; scaleX = scale; scaleY = scale }
}

@Composable
fun Modifier.modalSurfaceMotion(visible: Boolean): Modifier {
    var mounted by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { mounted = true }
    val scale by animateFloatAsState(
        targetValue = if (mounted && visible) 1f else 0.985f,
        animationSpec = if (visible) Motion.floatRelease else Motion.floatState,
        label = "modalSurfaceScale",
    )
    return this.graphicsLayer { scaleX = scale; scaleY = scale }
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
    val scale by t.animateFloat(
        initialValue = 1f,
        targetValue = 1.42f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 2600
                1f at 0
                1.42f at 900 using Motion.appleEaseOut
                1.42f at 2600
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "scale",
    )
    val alpha by t.animateFloat(
        initialValue = 0.24f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 2600
                0.24f at 0
                0f at 900 using Motion.appleEaseOut
                0f at 2600
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "alpha",
    )
    Box(modifier.size(dotSize + 8.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.matchParentSize().graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = alpha }.clip(CircleShape).background(color))
        Box(Modifier.size(dotSize).clip(CircleShape).background(color))
    }
}

// ── 直接操控：hover 轻呼吸，pointer-down 立即压入，释放后弹性归位 ──
@Composable
fun Modifier.fluidClickable(
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource? = null,
    pressScale: Float = 0.985f,
    onClick: () -> Unit,
): Modifier {
    val interaction = interactionSource ?: remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressScale else 1f,
        animationSpec = if (pressed) Motion.floatPress else Motion.floatRelease,
        label = "fluidClickScale",
    )
    return this
        .hoverable(interaction, enabled = enabled)
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            onClick = onClick,
        )
}

@Composable
fun MicroPill(
    label: String,
    color: Color = Ac,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(AppShapes.pill)
            .background(color.withAlpha(0.10f))
            .border(1.dp, color.withAlpha(0.22f), AppShapes.pill)
            .padding(horizontal = 7.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = color, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, fontFamily = CodeFont)
    }
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
            .fluidClickable(onClick = onClick)
            .clip(RoundedCornerShape(R8))
            .background(bg)
            .then(
                if (isActive) Modifier.border(1.dp, Ac.withAlpha(0.2f), RoundedCornerShape(R8))
                else Modifier
            )
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
                Text(agentLetter, color = OnAccent, fontSize = 9.sp, fontWeight = FontWeight.Bold)
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
            .fluidClickable(onClick = onClick)
            .clip(RoundedCornerShape(R7))
            .background(if (active) Ac.withAlpha(0.12f) else Bg2)
            .border(1.dp, if (active) Ac else Line, RoundedCornerShape(R7))
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

enum class ActionTone {
    PRIMARY,
    SECONDARY,
    POSITIVE,
    WARNING,
    DESTRUCTIVE,
    NEUTRAL,
}

private fun actionToneColor(tone: ActionTone): Color = when (tone) {
    ActionTone.PRIMARY -> ThemeRuntime.palette.controlBlue
    ActionTone.SECONDARY -> ThemeRuntime.palette.controlPurple
    ActionTone.POSITIVE -> ThemeRuntime.palette.controlGreen
    ActionTone.WARNING -> ThemeRuntime.palette.controlOrange
    ActionTone.DESTRUCTIVE -> ThemeRuntime.palette.controlRed
    ActionTone.NEUTRAL -> Bg3
}

@Composable
fun ActionButton(
    text: String,
    tone: ActionTone = ActionTone.PRIMARY,
    prominent: Boolean = true,
    enabled: Boolean = true,
    compact: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val toneColor = actionToneColor(tone)
    val targetBackground = when {
        !enabled -> Bg2
        tone == ActionTone.NEUTRAL -> if (hovered) lerp(Bg3, Tx3, 0.08f) else Bg3
        prominent && pressed -> lerp(toneColor, Bg0, 0.12f)
        prominent && hovered -> lerp(toneColor, Tx, 0.08f)
        prominent -> toneColor
        hovered -> toneColor.withAlpha(0.2f)
        else -> toneColor.withAlpha(0.12f)
    }
    val background by animateColorAsState(targetBackground, Motion.colorDefault, label = "actionButtonBackground")
    val foreground = when {
        !enabled -> Tx3
        prominent && tone != ActionTone.NEUTRAL -> OnAccent
        tone == ActionTone.NEUTRAL -> Tx2
        else -> toneColor
    }
    val border = when {
        !enabled -> Line
        tone == ActionTone.NEUTRAL -> if (hovered) Line2 else Line
        prominent -> lerp(toneColor, OnAccent, 0.16f)
        else -> toneColor.withAlpha(if (hovered) 0.48f else 0.32f)
    }
    Box(
        modifier = modifier
            .fluidClickable(
                enabled = enabled,
                interactionSource = interaction,
                pressScale = if (prominent) 0.975f else 0.985f,
                onClick = onClick,
            )
            .clip(AppShapes.sm)
            .background(background)
            .border(1.dp, border, AppShapes.sm)
            .padding(horizontal = if (compact) 10.dp else 14.dp, vertical = if (compact) 5.dp else 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = foreground, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun GlowButton(
    text: String,
    active: Boolean = true,
    tone: ActionTone = ActionTone.PRIMARY,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ActionButton(text, tone, prominent = true, enabled = active, onClick = onClick, modifier = modifier)
}

// ── Ghost button ────────────────────────────────────────────
@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false
) {
    ActionButton(
        text = text,
        tone = if (danger) ActionTone.DESTRUCTIVE else ActionTone.NEUTRAL,
        prominent = false,
        onClick = onClick,
        modifier = modifier,
    )
}

@Composable
fun CompactTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val borderColor by animateColorAsState(
        targetValue = if (focused) Ac.withAlpha(0.72f) else Line,
        animationSpec = Motion.colorDefault,
        label = "compactFieldBorder",
    )
    val backgroundColor by animateColorAsState(
        targetValue = if (focused) Bg3 else Bg2.withAlpha(0.76f),
        animationSpec = Motion.colorDefault,
        label = "compactFieldBackground",
    )
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        interactionSource = interaction,
        cursorBrush = SolidColor(Ac),
        textStyle = AppType.bodySm.copy(color = if (enabled) Tx else Tx3),
        modifier = modifier
            .height(40.dp)
            .clip(AppShapes.sm)
            .background(backgroundColor)
            .border(1.dp, borderColor, AppShapes.sm)
            .padding(horizontal = 11.dp),
        decorationBox = { innerField ->
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) {
                    Text(placeholder, color = Tx3, style = AppType.bodySm, maxLines = 1)
                }
                innerField()
            }
        },
    )
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
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(
                color = if (value.isEmpty()) Tx3 else Tx,
                fontSize = 13.sp,
                fontFamily = SansFont
            ),
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(R8))
                .background(Bg3)
                .border(1.dp, Line, RoundedCornerShape(R8))
                .padding(horizontal = 10.dp, vertical = 8.dp)
        )
    }
}
