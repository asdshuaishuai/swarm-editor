package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ThinkingIndicator(
    text: String = "正在审查",
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(RR))
            .background(Glass2)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(3) { index ->
            val opacity = remember { Animatable(0.3f) }
            LaunchedEffect(Unit) {
                launch {
                    delay(index * 200L)
                    while (true) {
                        opacity.animateTo(1.0f, animationSpec = tween(durationMillis = 600))
                        opacity.animateTo(0.3f, animationSpec = tween(durationMillis = 600))
                    }
                }
            }
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .clip(CircleShape)
                    .background(Ac.copy(alpha = opacity.value))
            )
            if (index < 2) Spacer(Modifier.width(4.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(text, color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
    }
}
