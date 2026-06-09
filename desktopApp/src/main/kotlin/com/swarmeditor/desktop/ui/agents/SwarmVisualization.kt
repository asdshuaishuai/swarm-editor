package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

/**
 * Canvas-based swarm visualization.
 *
 * Center node: rotating conic-gradient ring (12s period) + "S" hub label.
 * Satellite nodes: circles positioned around center, each with agent color + letter + glow shadow.
 * Dashed lines connect center to each satellite.
 * Online nodes are fully opaque; offline/not-installed nodes are dimmed (alpha 0.3f).
 * Tap on a satellite node triggers [onNodeClick].
 */
@Composable
fun SwarmVisualization(
    agents: List<AgentDto>,
    onNodeClick: (AgentDto) -> Unit,
    modifier: Modifier = Modifier
) {
    var rotationAngle by remember { mutableFloatStateOf(0f) }

    // Animate rotation at ~30fps, 360° over 12s = 1° per 33.3ms
    LaunchedEffect(Unit) {
        while (true) {
            delay(33)
            rotationAngle = (rotationAngle + 1f) % 360f
        }
    }

    val textMeasurer = rememberTextMeasurer()

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(agents) {
                detectTapGestures { offset ->
                    // Hit-test: check if tap landed on a satellite node
                    val canvasW = size.width
                    val canvasH = size.height
                    val cx = canvasW / 2f
                    val cy = canvasH / 2f
                    val orbitRadius = minOf(cx, cy) * 0.6f
                    val nodeRadius = 22f

                    agents.forEachIndexed { i, _ ->
                        val angle = (i * 360f / maxOf(agents.size, 1)) - 90f
                        val rad = Math.toRadians(angle.toDouble())
                        val nx = cx + orbitRadius * cos(rad).toFloat()
                        val ny = cy + orbitRadius * sin(rad).toFloat()
                        val dx = offset.x - nx
                        val dy = offset.y - ny
                        if (dx * dx + dy * dy <= (nodeRadius + 8f) * (nodeRadius + 8f)) {
                            onNodeClick(agents[i])
                            return@detectTapGestures
                        }
                    }
                }
            }
    ) {
        val canvasW = size.width
        val canvasH = size.height
        val cx = canvasW / 2f
        val cy = canvasH / 2f
        val orbitRadius = minOf(cx, cy) * 0.6f
        val centerRadius = minOf(cx, cy) * 0.18f
        val nodeRadius = 22f

        val conicColors = listOf(
            Color(0xFFaa66ff), // purple
            Color(0xFF0088ff), // blue
            Color(0xFF00ff88), // green
            Color(0xFFffcc00), // gold
            Color(0xFFff8800), // orange
            Color(0xFFaa66ff)  // back to purple
        )
        val sweepAngle = 360f / (conicColors.size - 1)

        // Draw dashed lines from center to each satellite
        agents.forEachIndexed { i, agent ->
            val angle = (i * 360f / maxOf(agents.size, 1)) - 90f
            val rad = Math.toRadians(angle.toDouble())
            val nx = cx + orbitRadius * cos(rad).toFloat()
            val ny = cy + orbitRadius * sin(rad).toFloat()

            val isConnected = agent.status == "connected"
            val lineAlpha = if (isConnected) 0.4f else 0.15f

            drawLine(
                color = agentColor(i).copy(alpha = lineAlpha),
                start = Offset(cx, cy),
                end = Offset(nx, ny),
                strokeWidth = 1.5f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 5f), 0f),
                cap = StrokeCap.Round
            )
        }

        // Draw rotating center node — conic gradient ring
        rotate(rotationAngle) {
            for (i in 0 until conicColors.size - 1) {
                val startAngle = i * sweepAngle - 90f
                drawArc(
                    color = conicColors[i],
                    startAngle = startAngle,
                    sweepAngle = sweepAngle + 2f,
                    useCenter = false,
                    topLeft = Offset(cx - centerRadius, cy - centerRadius),
                    size = Size(centerRadius * 2, centerRadius * 2),
                    style = Stroke(width = 4f, cap = StrokeCap.Round)
                )
            }
        }

        // Center "S" letter
        val centerTextResult = textMeasurer.measure(
            "S",
            style = TextStyle(
                color = Tx,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        )
        drawText(
            textLayoutResult = centerTextResult,
            topLeft = Offset(
                cx - centerTextResult.size.width / 2f,
                cy - centerTextResult.size.height / 2f
            )
        )

        // Draw satellite nodes
        agents.forEachIndexed { i, agent ->
            val angle = (i * 360f / maxOf(agents.size, 1)) - 90f
            val rad = Math.toRadians(angle.toDouble())
            val nx = cx + orbitRadius * cos(rad).toFloat()
            val ny = cy + orbitRadius * sin(rad).toFloat()

            val isConnected = agent.status == "connected"
            val isInstalled = agent.status != "not_installed"
            val alpha = when {
                isConnected -> 1f
                isInstalled -> 0.6f
                else -> 0.3f
            }

            val color = agentColor(i)

            // Glow shadow
            if (isConnected) {
                drawCircle(
                    color = color.copy(alpha = 0.2f),
                    radius = nodeRadius + 10f,
                    center = Offset(nx, ny)
                )
            }

            // Node circle background
            drawCircle(
                color = Surface2.copy(alpha = alpha),
                radius = nodeRadius,
                center = Offset(nx, ny)
            )

            // Node border ring
            drawCircle(
                color = color.copy(alpha = alpha),
                radius = nodeRadius,
                center = Offset(nx, ny),
                style = Stroke(width = 2f)
            )

            // Agent letter
            val letter = agentLetter(i)
            val letterResult = textMeasurer.measure(
                letter,
                style = TextStyle(
                    color = color.copy(alpha = alpha),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            )
            drawText(
                textLayoutResult = letterResult,
                topLeft = Offset(
                    nx - letterResult.size.width / 2f,
                    ny - letterResult.size.height / 2f
                )
            )
        }
    }
}
