package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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

val AGENT_COLORS = listOf(AgentClaude, AgentQwen, AgentGemini, AgentKimi, AgentOpenCode)
val AGENT_LETTERS = listOf("C", "Q", "G", "K", "O")

fun agentColor(index: Int): Color = AGENT_COLORS[index.coerceIn(AGENT_COLORS.indices)]
fun agentLetter(index: Int): String = AGENT_LETTERS[index.coerceIn(AGENT_LETTERS.indices)]

@Composable
fun AgentCard(
    agent: AgentDto,
    colorIndex: Int,
    onConfigClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val agentColor = agentColor(colorIndex)
    val letter = agentLetter(colorIndex)
    val isConnected = agent.status == "connected"
    val isInstalled = agent.status != "not_installed"

    val statusText = when {
        isConnected -> "已连接"
        isInstalled -> "未连接"
        else -> "未安装"
    }

    val (statusBg, statusFg, statusDotColor) = when {
        isConnected -> Triple(Ok.withAlpha(0.12f), OkLight, OkLight)
        isInstalled -> Triple(Err.withAlpha(0.12f), ErrLight, ErrLight)
        else -> Triple(Warn.withAlpha(0.12f), WarnLight, WarnLight)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .hoverLift(RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(
                Brush.linearGradient(
                    listOf(Bg2.withAlpha(0.5f), Bg1.withAlpha(0.4f))
                )
            )
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .clickable(onClick = onConfigClick)
    ) {
        // 顶部彩色条（2dp，Agent 配色）
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(agentColor.withAlpha(0.6f))
        )

        Column(modifier = Modifier.padding(20.dp)) {
            // 第 1 行：Logo + 名称/元信息 + 状态 + 配置按钮
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(agentColor, agentColor.withAlpha(0.7f))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        letter,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        agent.config.name,
                        color = Tx,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                    val meta = buildString {
                        if (agent.config.command.isNotEmpty()) append(agent.config.command)
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
                        .clip(RoundedCornerShape(7.dp))
                        .background(statusBg)
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(RoundedCornerShape(3.5.dp))
                            .background(statusDotColor)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        statusText,
                        color = statusFg,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                Spacer(Modifier.width(8.dp))

                // 配置按钮（描边）
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(Bg3)
                        .border(1.dp, Line, RoundedCornerShape(7.dp))
                        .clickable(onClick = onConfigClick)
                        .padding(horizontal = 12.dp, vertical = 5.dp)
                ) {
                    Text(
                        "配置",
                        color = Tx2,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
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

            // 待安装：💡 安装提示 + 命令 + 安装按钮（对齐核心稿）
            if (!isInstalled) {
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(7.dp))
                        .background(Warn.withAlpha(0.08f))
                        .border(1.dp, Warn.withAlpha(0.2f), RoundedCornerShape(7.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("💡", fontSize = 13.sp)
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("请先安装", color = WarnLight, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "npm install -g @anthropic-ai/${agent.config.id}",
                            color = WarnLight,
                            fontSize = 11.sp,
                            fontFamily = CodeFont,
                            maxLines = 1
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(7.dp))
                            .background(Brush.linearGradient(listOf(Ac, Ac2)))
                            .clickable(onClick = onConfigClick)
                            .padding(horizontal = 12.dp, vertical = 5.dp)
                    ) {
                        Text("安装", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            // 统计三联格（顶部细分隔线，对齐 .agent-stats）
            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                StatCell(
                    label = "任务",
                    value = if (agent.stats.tasks > 0) "${agent.stats.tasks}" else "—",
                    valueColor = if (agent.stats.tasks > 0) agentColor else Tx3,
                    modifier = Modifier.weight(1f)
                )
                StatCell(
                    label = "成功率",
                    value = formatPercent(agent.stats.successRate),
                    valueColor = Tx,
                    modifier = Modifier.weight(1f)
                )
                StatCell(
                    label = "平均延迟",
                    value = agent.stats.avgLatency.ifEmpty { "—" },
                    valueColor = Tx,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun StatCell(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
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
}

private fun formatPercent(rate: Double): String {
    if (rate <= 0.0) return "—"
    return "${(rate * 100).toInt()}%"
}
