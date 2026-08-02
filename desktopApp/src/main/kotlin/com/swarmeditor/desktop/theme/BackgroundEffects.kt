package com.swarmeditor.desktop.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun BackgroundEffects(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawRect(
                brush = Brush.linearGradient(
                    colors = listOf(Bg0, Bg1.copy(alpha = 1f), Bg2.copy(alpha = 1f)),
                    start = Offset.Zero,
                    end = Offset(size.width, size.height),
                ),
            )
            val gridSize = 42f
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            val maximumRadius = kotlin.math.max(size.width, size.height) * 0.7f
            var x = 0f
            while (x < size.width) {
                val distance = kotlin.math.abs(x - centerX)
                val opacity = if (distance > maximumRadius) 0f else 0.045f * (1f - distance / maximumRadius)
                if (opacity > 0.001f) {
                    drawLine(Tx.copy(alpha = opacity), Offset(x, 0f), Offset(x, size.height), 1f)
                }
                x += gridSize
            }
            var y = 0f
            while (y < size.height) {
                val distance = kotlin.math.abs(y - centerY)
                val opacity = if (distance > maximumRadius) 0f else 0.045f * (1f - distance / maximumRadius)
                if (opacity > 0.001f) {
                    drawLine(Tx.copy(alpha = opacity), Offset(0f, y), Offset(size.width, y), 1f)
                }
                y += gridSize
            }
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Ac.copy(alpha = 0.14f), Color.Transparent),
                    center = Offset(size.width * 0.85f, size.height * 0.90f),
                    radius = size.width * 0.35f,
                ),
                radius = size.width * 0.35f,
                center = Offset(size.width * 0.85f, size.height * 0.90f),
            )
        }
        Canvas(modifier = Modifier.fillMaxSize()) {
            val purpleCenter = Offset(size.width * 0.15f, size.height * 0.12f)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Ac2.copy(alpha = 0.12f), Color.Transparent),
                    center = purpleCenter,
                    radius = size.width * 0.45f,
                ),
                radius = size.width * 0.45f,
                center = purpleCenter,
            )
            val cyanCenter = Offset(size.width * 0.72f, size.height * 0.22f)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(AgentGemini.copy(alpha = 0.07f), Color.Transparent),
                    center = cyanCenter,
                    radius = size.width * 0.30f,
                ),
                radius = size.width * 0.30f,
                center = cyanCenter,
            )
        }
    }
}
