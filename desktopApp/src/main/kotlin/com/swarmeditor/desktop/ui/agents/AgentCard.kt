package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticAgentIconSpec
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Activity

val AGENT_COLORS = listOf(Ac)

fun agentColor(index: Int): Color = AGENT_COLORS[index.coerceIn(AGENT_COLORS.indices)]
fun agentLetter(name: String): String = name.firstOrNull()?.uppercase() ?: "P"

@Composable
fun AgentCard(
    agent: AgentDto,
    colorIndex: Int,
    onConfigClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val agentColor = agentColor(colorIndex)
    val isEnabled = agent.config.enabled
    val isConnected = isEnabled && agent.status == "connected"
    val isInstalled = agent.status != "not_installed"

    val statusText = when {
        !isEnabled -> "已停用"
        isConnected -> "已连接"
        isInstalled -> "未连接"
        else -> "执行环境不可用"
    }

    val (statusBg, statusFg, statusDotColor) = when {
        !isEnabled -> Triple(Tx3.withAlpha(0.12f), Tx3, Tx3)
        isConnected -> Triple(Ok.withAlpha(0.12f), OkLight, OkLight)
        isInstalled -> Triple(Err.withAlpha(0.12f), ErrLight, ErrLight)
        else -> Triple(Warn.withAlpha(0.12f), WarnLight, WarnLight)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .fluidClickable(onClick = onConfigClick)
            .clip(AppShapes.md)
            .background(
                Brush.linearGradient(
                    listOf(Bg2.withAlpha(0.5f), Bg1.withAlpha(0.4f))
                )
            )
            .border(1.dp, Line, AppShapes.md)
    ) {
        // 顶部彩色条（2dp，Agent 配色）
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(agentColor.withAlpha(0.6f))
        )

        Column(modifier = Modifier.padding(Spacing.panel)) {
            // 第 1 行：Logo + 名称/元信息 + 状态 + 配置按钮
            Row(verticalAlignment = Alignment.CenterVertically) {
                SemanticIconBadge(
                    spec = semanticAgentIconSpec(agent.config.name, agent.config.id).copy(accent = agentColor),
                    contentDescription = "${agent.config.name} 图标",
                    size = 40.dp,
                )

                Spacer(Modifier.width(Spacing.md))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        agent.config.name,
                        color = Tx,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                    val meta = buildString {
                        val model = listOf(agent.config.provider, agent.config.model)
                            .filter { it.isNotBlank() }
                            .joinToString("/")
                        if (model.isNotEmpty()) append(model) else append("自动选择模型")
                        if (agent.version.isNotEmpty()) {
                            if (isNotEmpty()) append(" · ")
                            append("v${agent.version}")
                        }
                    }
                    if (meta.isNotEmpty()) {
                        Text(
                            meta,
                            color = Tx3,
                            fontSize = 12.sp,
                            maxLines = 1
                        )
                    }
                }

                Spacer(Modifier.width(8.dp))

                // 状态胶囊
                Row(
                    modifier = Modifier
                        .clip(AppShapes.pill)
                        .background(statusBg)
                        .border(1.dp, statusDotColor.withAlpha(0.22f), AppShapes.pill)
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(statusDotColor)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        statusText,
                        color = statusFg,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                Spacer(Modifier.width(8.dp))

                ActionButton(
                    text = "配置",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    compact = true,
                    onClick = onConfigClick,
                )
            }

            // 描述
            if (agent.description.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    agent.description,
                    color = Tx2,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    maxLines = 2
                )
            }

            // 内置 runtime 不可用提示
            if (!isInstalled) {
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(AppShapes.sm)
                        .background(Warn.withAlpha(0.08f))
                        .border(1.dp, Warn.withAlpha(0.2f), AppShapes.sm)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("💡", fontSize = 13.sp)
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("内置执行引擎尚未就绪", color = WarnLight, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "请重新构建内置执行环境",
                            color = WarnLight,
                            fontSize = 11.sp,
                            fontFamily = CodeFont,
                            maxLines = 1
                        )
                    }
                    ActionButton(
                        text = "配置",
                        compact = true,
                        onClick = onConfigClick,
                    )
                }
            }

            val hasStats = agent.stats.tasks > 0 || agent.stats.successRate > 0.0 || agent.stats.avgLatency.isNotBlank()
            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            if (hasStats) {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    StatCell(
                        label = "任务",
                        value = agent.stats.tasks.toString(),
                        valueColor = agentColor,
                        modifier = Modifier.weight(1f),
                        showDivider = false
                    )
                    StatCell(
                        label = "成功率",
                        value = formatPercent(agent.stats.successRate),
                        valueColor = Tx,
                        modifier = Modifier.weight(1f),
                        showDivider = true
                    )
                    StatCell(
                        label = "平均延迟",
                        value = agent.stats.avgLatency.ifEmpty { "—" },
                        valueColor = Tx,
                        modifier = Modifier.weight(1f),
                        showDivider = true
                    )
                }
            } else {
                Row(
                    modifier = Modifier.padding(top = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Feather.Activity,
                        contentDescription = null,
                        tint = Tx3,
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text("完成首个任务后生成运行统计", color = Tx3, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun StatCell(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
    showDivider: Boolean = false
) {
    Box(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                value,
                color = valueColor,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(2.dp))
            Text(
                label,
                color = Tx3,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.4.sp
            )
        }
        // Subtle divider line after the cell (except last)
        if (showDivider) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = (-8).dp)
                    .width(1.dp)
                    .height(24.dp)
                    .background(Line2)
            )
        }
    }
}

private fun formatPercent(rate: Double): String {
    if (rate <= 0.0) return "—"
    return "${(rate * 100).toInt()}%"
}
