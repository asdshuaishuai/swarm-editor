package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.Terminal
import com.woowla.compose.icon.collections.feather.feather.Settings
import com.woowla.compose.icon.collections.feather.feather.Code
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

@androidx.compose.runtime.Immutable
data class ToolCardData(
    val title: String,
    val iconType: String = "search",
    val duration: String = "",
    val command: String = "",
    val output: String = "",
    val resultOk: Boolean = true,
    val resultDuration: String = "",
    val showResult: Boolean = true
)

@Composable
fun ToolCard(
    card: ToolCardData,
    defaultExpanded: Boolean = false,
    modifier: Modifier = Modifier
) {
    val expanded = remember { mutableStateOf(defaultExpanded) }
    val shape = RoundedCornerShape(10.dp)
    val targetStatusColor = when {
        !card.showResult -> Ac
        card.resultOk -> Ok
        else -> Err
    }
    val statusColor by androidx.compose.animation.animateColorAsState(
        targetStatusColor,
        Motion.colorDefault,
        label = "toolStatusColor",
    )
    val hasDetails = card.command.isNotEmpty() || card.output.isNotEmpty()
    val headerInteraction = remember { MutableInteractionSource() }
    val headerHovered by headerInteraction.collectIsHoveredAsState()
    val surfaceColor by androidx.compose.animation.animateColorAsState(
        if (headerHovered || expanded.value) statusColor.withAlpha(0.08f) else Bg3.copy(alpha = 0.66f),
        Motion.colorDefault,
        label = "toolSurfaceColor",
    )
    val borderColor by androidx.compose.animation.animateColorAsState(
        if (expanded.value) statusColor.withAlpha(0.3f) else Line,
        Motion.colorDefault,
        label = "toolBorderColor",
    )

    // Chevr rotation animation with spring
    val rotationAngle by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (expanded.value) 90f else 0f,
        animationSpec = Motion.floatState,
        label = "chevronRotation"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(surfaceColor)
            .border(1.dp, borderColor, shape)
    ) {
        // Header — clickable to toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .fluidClickable(
                    enabled = hasDetails,
                    interactionSource = headerInteraction,
                    onClick = { expanded.value = !expanded.value },
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Tool icon
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(statusColor.withAlpha(0.15f)),
                contentAlignment = Alignment.Center
            ) {
                val iconVector = when (card.iconType) {
                    "terminal" -> Feather.Terminal
                    "settings" -> Feather.Settings
                    "code" -> Feather.Code
                    "file" -> Feather.File
                    else -> Feather.Search
                }
                Icon(
                    imageVector = iconVector,
                    contentDescription = card.title,
                    tint = statusColor,
                    modifier = Modifier.size(14.dp)
                )
            }
            Spacer(Modifier.width(10.dp))
            Text(
                card.title,
                color = Tx,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont
            )
            if (card.duration.isNotEmpty()) {
                Spacer(Modifier.width(8.dp))
                Text(
                    "· ${card.duration}",
                    color = Tx3,
                    fontSize = 12.sp,
                    fontFamily = SansFont
                )
            }
            Spacer(Modifier.weight(1f))
            if (hasDetails) {
                Icon(
                    imageVector = Feather.ChevronRight,
                    contentDescription = "Toggle",
                    tint = if (expanded.value) statusColor else Tx2,
                    modifier = Modifier
                        .size(18.dp)
                        .rotate(rotationAngle)
                )
            }
        }

        AnimatedVisibility(
            visible = expanded.value && hasDetails,
            enter = expandVertically(animationSpec = Motion.intSizeExpand) + fadeIn(Motion.alphaEnter),
            exit = shrinkVertically(animationSpec = Motion.intSizeCollapse) + fadeOut(Motion.alphaExit),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Bg2)
                    .border(1.dp, Line)
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                if (card.command.isNotEmpty()) {
                    Text("参数", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        card.command,
                        color = Tx2,
                        fontSize = 12.sp,
                        fontFamily = CodeFont,
                        lineHeight = 18.sp
                    )
                }
                if (card.command.isNotEmpty() && card.output.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
                    Spacer(Modifier.height(10.dp))
                }
                AnimatedVisibility(
                    visible = card.output.isNotEmpty(),
                    enter = fadeIn(Motion.alphaEnter),
                    exit = fadeOut(Motion.alphaExit),
                ) {
                    Column {
                        Text("输出", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                        Spacer(Modifier.height(6.dp))
                        val outputAnnotated = remember(card.output) { toolOutputAnnotated(card.output) }
                        Text(
                            outputAnnotated,
                            color = Tx2,
                            fontSize = 12.sp,
                            fontFamily = CodeFont,
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }

        // Result line (only when the tool produced a status result)
        AnimatedVisibility(
            visible = card.showResult,
            enter = expandVertically(animationSpec = Motion.intSizeExpand) + fadeIn(Motion.alphaEnter),
            exit = shrinkVertically(animationSpec = Motion.intSizeCollapse) + fadeOut(Motion.alphaExit),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Line)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(statusColor.withAlpha(0.12f))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    AnimatedContent(
                        targetState = card.resultOk,
                        transitionSpec = { fadeIn(Motion.alphaEnter) togetherWith fadeOut(Motion.alphaExit) },
                        label = "toolResultState",
                    ) { resultOk ->
                        Text(
                            if (resultOk) "✓ 成功" else "× 失败",
                            color = if (resultOk) OkLight else ErrLight,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = SansFont
                        )
                    }
                }
                if (card.resultDuration.isNotEmpty()) {
                    Spacer(Modifier.width(8.dp))
                    Text(card.resultDuration, color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
                }
            }
        }
    }
}

/** 工具输出按行着色：→ 结果行使用柔和强调色，$ 命令行灰，其余默认。 */
private fun toolOutputAnnotated(output: String): AnnotatedString = buildAnnotatedString {
    output.split('\n').forEachIndexed { i, line ->
        if (i > 0) append('\n')
        when {
            line.startsWith("→") -> withStyle(SpanStyle(color = AcLight)) { append(line) }
            line.startsWith("$") -> withStyle(SpanStyle(color = Tx3)) { append(line) }
            else -> append(line)
        }
    }
}
