package com.swarmeditor.desktop.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope

/* ═══════════════════════════════════════════════════════════════
   Ambient glow + grid background effects (from MVP mockup)
   ═══════════════════════════════════════════════════════════════ */

@Composable
fun AmbientBackground(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize()) {
        // Ambient radial glows
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Top-left purple glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF7c3aed).copy(alpha = 0.18f), Color.Transparent),
                    center = Offset(size.width * 0.15f, size.height * 0.10f),
                    radius = size.width * 0.45f
                ),
                radius = size.width * 0.45f,
                center = Offset(size.width * 0.15f, size.height * 0.10f)
            )
            // Bottom-right blue glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF60a5fa).copy(alpha = 0.12f), Color.Transparent),
                    center = Offset(size.width * 0.85f, size.height * 0.90f),
                    radius = size.width * 0.35f
                ),
                radius = size.width * 0.35f,
                center = Offset(size.width * 0.85f, size.height * 0.90f)
            )
            // Center subtle green glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF34d399).copy(alpha = 0.05f), Color.Transparent),
                    center = Offset(size.width * 0.5f, size.height * 0.5f),
                    radius = size.width * 0.25f
                ),
                radius = size.width * 0.25f,
                center = Offset(size.width * 0.5f, size.height * 0.5f)
            )
        }
    }
}

@Composable
fun GridBackground(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val gridSize = 42f
        val centerX = size.width / 2f
        val centerY = size.height / 2f
        val maxRadius = kotlin.math.max(size.width, size.height) * 0.7f

        // Draw vertical grid lines with radial fade
        var x = 0f
        while (x < size.width) {
            val distFromCenter = kotlin.math.abs(x - centerX)
            val opacity = if (distFromCenter > maxRadius) 0f
                else 0.025f * (1f - distFromCenter / maxRadius)
            if (opacity > 0.001f) {
                drawLine(
                    color = Color.White.copy(alpha = opacity),
                    start = Offset(x, 0f),
                    end = Offset(x, size.height),
                    strokeWidth = 1f
                )
            }
            x += gridSize
        }

        // Draw horizontal grid lines with radial fade
        var y = 0f
        while (y < size.height) {
            val distFromCenter = kotlin.math.abs(y - centerY)
            val opacity = if (distFromCenter > maxRadius) 0f
                else 0.025f * (1f - distFromCenter / maxRadius)
            if (opacity > 0.001f) {
                drawLine(
                    color = Color.White.copy(alpha = opacity),
                    start = Offset(0f, y),
                    end = Offset(size.width, y),
                    strokeWidth = 1f
                )
            }
            y += gridSize
        }
    }
}

@Composable
fun BackgroundEffects(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize()) {
        AmbientBackground()
        GridBackground()
    }
}
