package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

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

    // Chevr rotation animation with spring
    val rotationAngle by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (expanded.value) 90f else 0f,
        animationSpec = Motion.floatDefault,
        label = "chevronRotation"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(Bg3.copy(alpha = 0.7f), Bg2.copy(alpha = 0.5f))
                )
            )
            .border(1.dp, Line, shape)
    ) {
        // Header — clickable to toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded.value = !expanded.value }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Tool icon
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Ac.withAlpha(0.15f)),
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
                    contentDescription = "Tool",
                    tint = Ac,
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
            Icon(
                imageVector = Feather.ChevronRight,
                contentDescription = "Toggle",
                tint = Tx3,
                modifier = Modifier
                    .size(16.dp)
                    .rotate(rotationAngle)
            )
        }

        // Expanded body — command output
        AnimatedVisibility(
            visible = expanded.value,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            if (card.output.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Bg2)
                        .border(1.dp, Line)
                        .padding(10.dp, 12.dp)
                ) {
                    Text(
                        toolOutputAnnotated(card.output),
                        fontSize = 12.sp,
                        fontFamily = CodeFont,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        // Result line (only when the tool produced a status result)
        if (card.showResult) Row(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Line)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // OK pill
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (card.resultOk) Ok.withAlpha(0.12f) else Err.withAlpha(0.12f))
                    .padding(horizontal = 7.dp, vertical = 2.dp)
            ) {
                Text(
                    if (card.resultOk) "OK" else "FAIL",
                    color = if (card.resultOk) OkLight else ErrLight,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont
                )
            }
            if (card.resultDuration.isNotEmpty()) {
                Spacer(Modifier.width(8.dp))
                Text(card.resultDuration, color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
            }
        }
    }
}

/** 工具输出按行着色：→ 结果行蓝(#93c5fd)，$ 命令行灰，其余默认。对齐核心稿 .tool-body */
private fun toolOutputAnnotated(output: String): AnnotatedString = buildAnnotatedString {
    output.split('\n').forEachIndexed { i, line ->
        if (i > 0) append('\n')
        when {
            line.startsWith("→") -> withStyle(SpanStyle(color = Color(0xFF93c5fd))) { append(line) }
            line.startsWith("$") -> withStyle(SpanStyle(color = Tx3)) { append(line) }
            else -> append(line)
        }
    }
}
