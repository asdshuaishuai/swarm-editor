package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun BackgroundEffects(modifier: Modifier = Modifier) {
    // 单一动画值驱动 glow（减少 state 数量从 3→1）
    val transition = rememberInfiniteTransition(label = "ambient")
    val phase by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(25000, easing = LinearEasing), RepeatMode.Reverse),
        label = "phase"
    )

    Box(modifier = modifier.fillMaxSize()) {
        // 静态层：grid + blue glow（不参与动画，只画一次）
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Grid lines with radial fade
            val gridSize = 42f
            val cx = size.width / 2f
            val cy = size.height / 2f
            val maxR = kotlin.math.max(size.width, size.height) * 0.7f
            var x = 0f
            while (x < size.width) {
                val d = kotlin.math.abs(x - cx)
                val op = if (d > maxR) 0f else 0.025f * (1f - d / maxR)
                if (op > 0.001f) drawLine(Color.White.copy(alpha = op), Offset(x, 0f), Offset(x, size.height), 1f)
                x += gridSize
            }
            var y = 0f
            while (y < size.height) {
                val d = kotlin.math.abs(y - cy)
                val op = if (d > maxR) 0f else 0.025f * (1f - d / maxR)
                if (op > 0.001f) drawLine(Color.White.copy(alpha = op), Offset(0f, y), Offset(size.width, y), 1f)
                y += gridSize
            }
            // Static blue glow (bottom-right)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF60a5fa).copy(alpha = 0.08f), Color.Transparent),
                    center = Offset(size.width * 0.85f, size.height * 0.90f),
                    radius = size.width * 0.35f
                ),
                radius = size.width * 0.35f,
                center = Offset(size.width * 0.85f, size.height * 0.90f)
            )
        }
        // 动态层：紫色 glow 呼吸（单独 Canvas，只重绘这一层）
        Canvas(modifier = Modifier.fillMaxSize()) {
            val driftX = 0.12f + 0.06f * phase
            val driftY = 0.08f + 0.06f * phase
            val glowA = 0.14f + 0.06f * phase
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF7c3aed).copy(alpha = glowA), Color.Transparent),
                    center = Offset(size.width * driftX, size.height * driftY),
                    radius = size.width * 0.45f
                ),
                radius = size.width * 0.45f,
                center = Offset(size.width * driftX, size.height * driftY)
            )
        }
    }
}
