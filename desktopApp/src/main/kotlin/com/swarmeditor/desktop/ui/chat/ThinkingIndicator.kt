package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

/**
 * 三个依次闪烁的点（对齐核心稿 .thinking <i>×3，blink 动画）。
 * 纯内联，无容器底色；可选 text 显示在点之后。
 */
@Composable
fun ThinkingIndicator(
    text: String = "",
    modifier: Modifier = Modifier
) {
    val pulse = rememberInfiniteTransition(label = "thinkingPulse")
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        repeat(3) { index ->
            val start = index * 140
            val opacity by pulse.animateFloat(
                initialValue = 0.28f,
                targetValue = 0.28f,
                animationSpec = infiniteRepeatable(
                    animation = keyframes {
                        durationMillis = 1800
                        0.28f at start using Motion.appleEaseOut
                        1f at start + 280 using Motion.appleEaseOut
                        0.28f at start + 620
                        0.28f at 1800
                    },
                    repeatMode = RepeatMode.Restart,
                ),
                label = "thinkingDot$index",
            )
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .graphicsLayer { alpha = opacity }
                    .clip(CircleShape)
                    .background(Ac)
            )
            if (index < 2) Spacer(Modifier.width(3.dp))
        }
        if (text.isNotEmpty()) {
            Spacer(Modifier.width(8.dp))
            Text(text, color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
        }
    }
}
