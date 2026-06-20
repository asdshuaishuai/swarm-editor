package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * 设计稿 mvp-design-mockup.html 的 5 个 swarm-node 位置（以画布宽/高比例为坐标）：
 * C 左上、Q 左下、G 右上、K 右下、O 底部居中。
 */
private val NODE_POSITIONS = listOf(
    Offset(0.22f, 0.18f),  // C  Claude
    Offset(0.16f, 0.66f),  // Q  Qwen
    Offset(0.78f, 0.24f),  // G  Gemini
    Offset(0.82f, 0.68f),  // K  Kimi
    Offset(0.50f, 0.88f),  // O  OpenCode
)

private fun nodeCenter(index: Int, canvasW: Float, canvasH: Float, count: Int): Offset {
    // 与设计稿一致的前 5 个固定位置；超出则退化为均布圆轨道
    if (index < NODE_POSITIONS.size && count <= NODE_POSITIONS.size) {
        val p = NODE_POSITIONS[index]
        return Offset(canvasW * p.x, canvasH * p.y)
    }
    val cx = canvasW / 2f
    val cy = canvasH / 2f
    val r = min(cx, cy) * 0.6f
    val angle = (index * 360f / maxOf(count, 1)) - 90f
    val rad = Math.toRadians(angle.toDouble())
    return Offset(cx + r * cos(rad).toFloat(), cy + r * sin(rad).toFloat())
}

/**
 * Canvas swarm 可视化：中心旋转 conic 环 + 六边形 hub；卫星节点按设计稿坐标排布，
 * 虚线放射连接；在线节点不透明、离线/未安装节点变暗；点击卫星触发 [onNodeClick]。
 */
@Composable
fun SwarmVisualization(
    agents: List<AgentDto>,
    onNodeClick: (AgentDto) -> Unit,
    modifier: Modifier = Modifier
) {
    var rotationAngle by remember { mutableFloatStateOf(0f) }
    var hoveredIndex by remember { mutableStateOf(-1) }
    var hoveredPos by remember { mutableStateOf<Offset?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(33)
            rotationAngle = (rotationAngle + 1f) % 360f
        }
    }

    val textMeasurer = rememberTextMeasurer()
    val nodeRadius = 15f  // ~30px 卫星节点

    Box(modifier) {
        Canvas(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(agents) {
                detectTapGestures(
                    onTap = { offset ->
                        val canvasW = size.width.toFloat()
                        val canvasH = size.height.toFloat()
                        agents.forEachIndexed { i, _ ->
                            val c = nodeCenter(i, canvasW, canvasH, agents.size)
                            val dx = offset.x - c.x
                            val dy = offset.y - c.y
                            if (dx * dx + dy * dy <= (nodeRadius + 8f) * (nodeRadius + 8f)) {
                                onNodeClick(agents[i])
                                return@detectTapGestures
                            }
                        }
                    }
                )
            }
            .pointerInput(agents) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        if (event.type == PointerEventType.Move || event.type == PointerEventType.Exit) {
                            val pos = event.changes.firstOrNull()?.position
                            if (pos == null) { hoveredIndex = -1; hoveredPos = null; continue }
                            val canvasW = size.width.toFloat()
                            val canvasH = size.height.toFloat()
                            var newHovered = -1
                            var newPos: Offset? = null
                            agents.forEachIndexed { i, _ ->
                                val c = nodeCenter(i, canvasW, canvasH, agents.size)
                                val dx = pos.x - c.x
                                val dy = pos.y - c.y
                                if (dx * dx + dy * dy <= (nodeRadius + 8f) * (nodeRadius + 8f)) { newHovered = i; newPos = c }
                            }
                            hoveredIndex = newHovered
                            hoveredPos = newPos
                        }
                    }
                }
            }
    ) {
        val canvasW = size.width
        val canvasH = size.height
        val cx = canvasW / 2f
        val cy = canvasH / 2f
        val centerRadius = min(cx, cy) * 0.22f

        val conicColors = listOf(
            Color(0xFFa78bfa), Color(0xFF60a5fa), Color(0xFF34d399),
            Color(0xFFfbbf24), Color(0xFFfb923c), Color(0xFFa78bfa)
        )
        val sweepAngle = 360f / (conicColors.size - 1)

        // 中心 → 各卫星的虚线
        agents.forEachIndexed { i, agent ->
            val c = nodeCenter(i, canvasW, canvasH, agents.size)
            val isConnected = agent.status == "connected"
            val lineAlpha = if (isConnected) 0.5f else 0.2f
            val lineWidth = if (i == hoveredIndex) 1.5f else 1f
            drawLine(
                color = agentColor(i).copy(alpha = lineAlpha),
                start = Offset(cx, cy),
                end = c,
                strokeWidth = lineWidth,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 3f), 0f),
                cap = StrokeCap.Round
            )
        }

        // 中心旋转 conic 环
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
        // 中心实心填充 + 光晕
        drawCircle(color = Ac.copy(alpha = 0.15f), radius = centerRadius + 10f, center = Offset(cx, cy))
        drawCircle(color = Bg1, radius = centerRadius - 4f, center = Offset(cx, cy))

        // 中心六边形标识
        val centerText = textMeasurer.measure(
            "⬢",
            style = TextStyle(color = Tx, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
        )
        drawText(
            textLayoutResult = centerText,
            topLeft = Offset(cx - centerText.size.width / 2f, cy - centerText.size.height / 2f)
        )

        // 卫星节点
        agents.forEachIndexed { i, agent ->
            val c = nodeCenter(i, canvasW, canvasH, agents.size)
            val isConnected = agent.status == "connected"
            val isInstalled = agent.status != "not_installed"
            val alpha = when {
                isConnected -> 1f
                isInstalled -> 0.5f
                else -> 0.35f
            }
            val color = agentColor(i)
            val scale = if (i == hoveredIndex) 1.15f else 1f
            val r = nodeRadius * scale

            // 在线节点外发光
            if (isConnected) {
                drawCircle(
                    color = color.copy(alpha = if (i == hoveredIndex) 0.25f else 0.15f),
                    radius = if (i == hoveredIndex) r + 14f else r + 10f,
                    center = c
                )
            }
            // 节点圆
            drawCircle(color = color.copy(alpha = alpha), radius = r, center = c)
            // 字母
            val letter = agentLetter(i)
            val letterResult = textMeasurer.measure(
                letter,
                style = TextStyle(
                    color = Color.White.copy(alpha = alpha),
                    fontSize = if (i == hoveredIndex) 13.sp else 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont
                )
            )
            drawText(
                textLayoutResult = letterResult,
                topLeft = Offset(c.x - letterResult.size.width / 2f, c.y - letterResult.size.height / 2f)
            )
        }
    }
        // 节点 hover tooltip（对齐核心稿 .swarm-node[data-tip]）
        val hp = hoveredPos
        if (hp != null && hoveredIndex >= 0) {
            agents.getOrNull(hoveredIndex)?.let { agent ->
                Popup(alignment = Alignment.TopStart, offset = IntOffset(hp.x.toInt(), (hp.y + 18).toInt())) {
                    Text(
                        text = "${agent.config.name} · " + when (agent.status) { "connected" -> "在线"; "disconnected" -> "离线"; else -> "未安装" },
                        color = Tx, fontSize = 11.sp, fontFamily = SansFont,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF0a0c14))
                            .border(1.dp, Line2, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}
