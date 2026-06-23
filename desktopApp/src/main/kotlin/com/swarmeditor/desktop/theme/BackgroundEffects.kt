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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun BackgroundEffects(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "ambient")
    val driftX by transition.animateFloat(
        initialValue = 0.12f, targetValue = 0.18f,
        animationSpec = infiniteRepeatable(tween(30000, easing = LinearEasing), RepeatMode.Reverse),
        label = "driftX"
    )
    val driftY by transition.animateFloat(
        initialValue = 0.08f, targetValue = 0.14f,
        animationSpec = infiniteRepeatable(tween(25000, easing = LinearEasing), RepeatMode.Reverse),
        label = "driftY"
    )
    val glowAlpha by transition.animateFloat(
        initialValue = 0.14f, targetValue = 0.20f,
        animationSpec = infiniteRepeatable(tween(20000, easing = LinearEasing), RepeatMode.Reverse),
        label = "glowAlpha"
    )

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Purple glow (top-left, breathing drift)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF7c3aed).copy(alpha = glowAlpha), Color.Transparent),
                    center = Offset(size.width * driftX, size.height * driftY),
                    radius = size.width * 0.45f
                ),
                radius = size.width * 0.45f,
                center = Offset(size.width * driftX, size.height * driftY)
            )
            // Blue glow (bottom-right, static)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF60a5fa).copy(alpha = 0.10f), Color.Transparent),
                    center = Offset(size.width * 0.85f, size.height * 0.90f),
                    radius = size.width * 0.35f
                ),
                radius = size.width * 0.35f,
                center = Offset(size.width * 0.85f, size.height * 0.90f)
            )
            // Grid lines with radial fade
            val gridSize = 42f
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            val maxRadius = kotlin.math.max(size.width, size.height) * 0.7f
            var x = 0f
            while (x < size.width) {
                val dist = kotlin.math.abs(x - centerX)
                val op = if (dist > maxRadius) 0f else 0.025f * (1f - dist / maxRadius)
                if (op > 0.001f) drawLine(Color.White.copy(alpha = op), Offset(x, 0f), Offset(x, size.height), 1f)
                x += gridSize
            }
            var y = 0f
            while (y < size.height) {
                val dist = kotlin.math.abs(y - centerY)
                val op = if (dist > maxRadius) 0f else 0.025f * (1f - dist / maxRadius)
                if (op > 0.001f) drawLine(Color.White.copy(alpha = op), Offset(0f, y), Offset(size.width, y), 1f)
                y += gridSize
            }
        }
    }
}
