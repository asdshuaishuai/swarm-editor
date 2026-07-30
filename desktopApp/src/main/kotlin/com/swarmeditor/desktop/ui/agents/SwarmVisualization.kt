package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.*
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * 前 5 个 Profile 使用固定节点位置，更多 Profile 自动均布到圆形轨道。
 */
private val NODE_POSITIONS = listOf(
    Offset(0.22f, 0.18f),
    Offset(0.16f, 0.66f),
    Offset(0.78f, 0.24f),
    Offset(0.82f, 0.68f),
    Offset(0.50f, 0.88f),
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

internal enum class SwarmVisualNodeKind { PROFILE, TASK }

internal data class SwarmVisualNode(
    val id: String,
    val label: String,
    val detail: String,
    val status: String,
    val kind: SwarmVisualNodeKind,
    val agent: AgentDto? = null,
)

internal fun buildSwarmVisualNodes(
    agents: List<AgentDto>,
    tasks: List<SwarmTask>,
): List<SwarmVisualNode> {
    val profiles = agents.drop(1).map { agent ->
        SwarmVisualNode(
            id = "profile:${agent.config.id}",
            label = agent.config.name,
            detail = when (agent.status) {
                "connected" -> "Pi Profile · 就绪"
                "disconnected" -> "Pi Profile · 离线"
                else -> "Pi Profile · 执行环境异常"
            },
            status = agent.status,
            kind = SwarmVisualNodeKind.PROFILE,
            agent = agent,
        )
    }
    val taskNodes = tasks.map { task ->
        SwarmVisualNode(
            id = "task:${task.id}",
            label = task.title,
            detail = "${task.role.name.lowercase()} · ${task.status.name.lowercase()}",
            status = task.status.name.lowercase(),
            kind = SwarmVisualNodeKind.TASK,
        )
    }
    return (profiles + taskNodes).take(MAX_VISUAL_NODES)
}

/**
 * Canvas swarm 可视化：中心节点始终代表真实主 Agent；卫星节点来自额外 Pi Profile
 * 与最近一次蜂群运行的动态任务，不再渲染无数据来源的装饰节点。
 */
@Composable
fun SwarmVisualization(
    agents: List<AgentDto>,
    tasks: List<SwarmTask> = emptyList(),
    onNodeClick: (AgentDto) -> Unit,
    modifier: Modifier = Modifier
) {
    var rotationAngle by remember { mutableFloatStateOf(0f) }
    var hoveredIndex by remember { mutableStateOf(-1) }
    var hoveredPos by remember { mutableStateOf<Offset?>(null) }
    val primaryAgent = agents.firstOrNull()
    val visualNodes = remember(agents, tasks) { buildSwarmVisualNodes(agents, tasks) }

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
            .pointerInput(primaryAgent, visualNodes) {
                detectTapGestures(
                    onTap = { offset ->
                        val canvasW = size.width.toFloat()
                        val canvasH = size.height.toFloat()
                        val center = Offset(canvasW / 2f, canvasH / 2f)
                        val centerRadius = min(canvasW / 2f, canvasH / 2f) * 0.22f
                        val centerDx = offset.x - center.x
                        val centerDy = offset.y - center.y
                        if (primaryAgent != null && centerDx * centerDx + centerDy * centerDy <= (centerRadius + 8f) * (centerRadius + 8f)) {
                            onNodeClick(primaryAgent)
                            return@detectTapGestures
                        }
                        visualNodes.forEachIndexed { i, node ->
                            val c = nodeCenter(i, canvasW, canvasH, visualNodes.size)
                            val dx = offset.x - c.x
                            val dy = offset.y - c.y
                            if (dx * dx + dy * dy <= (nodeRadius + 8f) * (nodeRadius + 8f)) {
                                node.agent?.let(onNodeClick)
                                return@detectTapGestures
                            }
                        }
                    }
                )
            }
            .pointerInput(visualNodes) {
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
                            visualNodes.forEachIndexed { i, _ ->
                                val c = nodeCenter(i, canvasW, canvasH, visualNodes.size)
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
            AgentClaude, AgentQwen, AgentGemini,
            AgentKimi, AgentOpenCode, Ac2,
        )
        val sweepAngle = 360f / (conicColors.size - 1)

        // 中心 → 各卫星的虚线
        visualNodes.forEachIndexed { i, node ->
            val c = nodeCenter(i, canvasW, canvasH, visualNodes.size)
            val isActive = node.isActive()
            val lineAlpha = if (isActive) 0.5f else 0.2f
            val lineWidth = if (i == hoveredIndex) 1.5f else 1f
            drawLine(
                color = visualNodeColor(node, i).copy(alpha = lineAlpha),
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

        // 中心主 Agent 标识
        val centerText = textMeasurer.measure(
            primaryAgent?.config?.name?.let(::agentLetter) ?: "—",
            style = TextStyle(color = Tx, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
        )
        drawText(
            textLayoutResult = centerText,
            topLeft = Offset(cx - centerText.size.width / 2f, cy - centerText.size.height / 2f)
        )
        val centerLabel = textMeasurer.measure(
            primaryAgent?.config?.name ?: "等待主智能体",
            style = TextStyle(color = Tx2, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont),
        )
        drawText(
            textLayoutResult = centerLabel,
            topLeft = Offset(cx - centerLabel.size.width / 2f, cy + centerRadius + 8f),
        )

        // 卫星节点
        visualNodes.forEachIndexed { i, node ->
            val c = nodeCenter(i, canvasW, canvasH, visualNodes.size)
            val isActive = node.isActive()
            val alpha = when {
                isActive -> 1f
                node.status in setOf("disconnected", "pending", "blocked", "canceled") -> 0.5f
                else -> 0.38f
            }
            val color = visualNodeColor(node, i)
            val isHovered = i == hoveredIndex
            val foreground = if (isActive) OnAccent else Tx2.copy(alpha = 0.82f)

            // 在线节点外发光
            if (isActive) {
                drawCircle(
                    color = color.copy(alpha = if (isHovered) 0.24f else 0.15f),
                    radius = nodeRadius + if (isHovered) 13f else 10f,
                    center = c
                )
            }
            // 节点圆
            drawCircle(color = color.copy(alpha = alpha), radius = nodeRadius, center = c)
            if (isHovered) {
                drawCircle(
                    color = Tx.copy(alpha = 0.72f),
                    radius = nodeRadius + 2f,
                    center = c,
                    style = Stroke(width = 1.5f)
                )
            }
            // 字母
            val letter = if (node.kind == SwarmVisualNodeKind.TASK) "T" else agentLetter(node.label)
            val letterResult = textMeasurer.measure(
                letter,
                style = TextStyle(
                    color = foreground,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont
                )
            )
            drawText(
                textLayoutResult = letterResult,
                topLeft = Offset(c.x - letterResult.size.width / 2f, c.y - letterResult.size.height / 2f)
            )
            val labelResult = textMeasurer.measure(
                node.label.take(18),
                style = TextStyle(color = Tx3.copy(alpha = alpha), fontSize = 9.sp, fontFamily = SansFont),
            )
            drawText(
                textLayoutResult = labelResult,
                topLeft = Offset(c.x - labelResult.size.width / 2f, c.y + nodeRadius + 5f),
            )
        }
    }
        // 节点 hover tooltip（对齐核心稿 .swarm-node[data-tip]）
        val hp = hoveredPos
        if (hp != null && hoveredIndex >= 0) {
            visualNodes.getOrNull(hoveredIndex)?.let { node ->
                Popup(alignment = Alignment.TopStart, offset = IntOffset(hp.x.toInt(), (hp.y + 18).toInt())) {
                    Text(
                        text = "${node.label} · ${node.detail}",
                        color = Tx, fontSize = 11.sp, fontFamily = SansFont,
                        modifier = Modifier
                            .clip(AppShapes.xs)
                            .background(Bg2)
                            .border(1.dp, Line2, AppShapes.xs)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}

private fun SwarmVisualNode.isActive(): Boolean = status in setOf("connected", "running", "succeeded")

private fun visualNodeColor(node: SwarmVisualNode, index: Int): Color = when {
    node.kind == SwarmVisualNodeKind.PROFILE -> agentColor(index + 1)
    node.status == SwarmTaskStatus.RUNNING.name.lowercase() -> AcLight
    node.status == SwarmTaskStatus.SUCCEEDED.name.lowercase() -> OkLight
    node.status == SwarmTaskStatus.FAILED.name.lowercase() -> ErrLight
    node.status == SwarmTaskStatus.BLOCKED.name.lowercase() -> WarnLight
    else -> Tx3
}

private const val MAX_VISUAL_NODES = 12
