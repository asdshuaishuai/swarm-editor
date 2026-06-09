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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.theme.*

/**
 * Agent info card with gradient top bar, logo, name, version, status chip,
 * description, stats grid (tasks / successRate / avgLatency), and config button.
 */

// Agent color palette — one per adapter type
val AGENT_COLORS = listOf(
    Color(0xFFaa66ff), // Claude Code  — purple
    Color(0xFF0088ff), // QwenCode     — blue
    Color(0xFF00cc66), // Gemini CLI   — green
    Color(0xFFffcc00), // Kimi Code    — gold
    Color(0xFFff8800)  // OpenCode     — orange
)

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

    val (statusBg, statusFg) = when {
        isConnected -> Gn to Gn
        isInstalled -> Tx3 to Tx3
        else -> Or.copy(alpha = 0.1f) to Or
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR))
            .background(Glass)
            .border(1.dp, Bd, RoundedCornerShape(RR))
    ) {
        // Gradient top bar (2dp)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(agentColor, agentColor.copy(alpha = 0.3f))
                    )
                )
        )

        Column(modifier = Modifier.padding(14.dp)) {
            // Row 1: Logo + Name + Command + Version + Status chip
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Logo circle
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(agentColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        letter,
                        color = agentColor,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            agent.config.name,
                            color = Tx,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = FontFamily.Monospace,
                            maxLines = 1
                        )
                        if (agent.version.isNotEmpty()) {
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "v${agent.version}",
                                color = Tx3,
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                    if (agent.config.command.isNotEmpty()) {
                        Text(
                            agent.config.command,
                            color = Tx3,
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            maxLines = 1
                        )
                    }
                }

                // Status chip
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(statusBg)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        statusText,
                        color = statusFg,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            // Description
            if (agent.description.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    agent.description,
                    color = Tx2,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 2
                )
            }

            Spacer(Modifier.height(10.dp))

            // Stats grid: 3 columns
            Row(modifier = Modifier.fillMaxWidth()) {
                StatCell("Tasks", "${agent.stats.tasks}", modifier = Modifier.weight(1f))
                StatCell("Success", formatPercent(agent.stats.successRate), modifier = Modifier.weight(1f))
                StatCell("Latency", agent.stats.avgLatency.ifEmpty { "--" }, modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(10.dp))

            // Config button
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(RR))
                        .background(Surface2)
                        .border(1.dp, Bd, RoundedCornerShape(RR))
                        .clickable(onClick = onConfigClick)
                        .padding(horizontal = 12.dp, vertical = 5.dp)
                ) {
                    Text(
                        "Config",
                        color = Tx2,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(Modifier.weight(1f))

                if (isConnected) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(Gn)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "Online",
                        color = Gn,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            value,
            color = Tx,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace
        )
        Spacer(Modifier.height(2.dp))
        Text(
            label,
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}

private fun formatPercent(rate: Double): String {
    if (rate <= 0.0) return "--"
    return "${(rate * 100).toInt()}%"
}
