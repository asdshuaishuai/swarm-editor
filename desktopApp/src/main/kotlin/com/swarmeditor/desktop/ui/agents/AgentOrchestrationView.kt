package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentConfigDto
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.api.AgentStatsDto
import com.swarmeditor.desktop.theme.*

/**
 * Agent Orchestration View — main composable for the "agents" tab.
 *
 * Layout:
 *  1. Title bar: "Agent 编排台" + agent count badge + "添加 Agent" button
 *  2. SwarmVisualization canvas area (fixed height)
 *  3. "在线 Agents" section — AgentCard list for connected/disconnected agents
 *  4. "待安装" section — placeholder cards for not-yet-installed agents
 *
 * Does NOT modify App.kt — the orchestrator will wire this in later.
 */
@Composable
fun AgentOrchestrationView(
    agents: List<AgentDto>,
    onRefresh: () -> Unit = {},
    onConfigClick: (AgentDto) -> Unit = {},
    onAddAgent: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var loadedAgents by remember { mutableStateOf(agents) }

    LaunchedEffect(agents) {
        loadedAgents = agents
    }

    // Default demo data when no agents are loaded
    val displayAgents = loadedAgents.ifEmpty {
        listOf(
            AgentDto(
                config = AgentConfigDto("claude-code", "Claude Code", "Anthropic 旗舰编码助手", "claude", agentType = "claude"),
                status = "connected",
                version = "1.0.3",
                description = "Anthropic 旗舰编码助手，支持 ACP 协议",
                stats = AgentStatsDto(tasks = 142, successRate = 0.97, avgLatency = "1.2s")
            ),
            AgentDto(
                config = AgentConfigDto("qwencode", "QwenCode", "通义灵码编码助手", "qwen", agentType = "qwen"),
                status = "connected",
                version = "0.9.1",
                description = "通义灵码编码助手",
                stats = AgentStatsDto(tasks = 89, successRate = 0.94, avgLatency = "0.8s")
            ),
            AgentDto(
                config = AgentConfigDto("gemini-cli", "Gemini CLI", "Google Gemini 命令行工具", "gemini", agentType = "gemini"),
                status = "disconnected",
                version = "0.1.0",
                description = "Google Gemini 命令行工具",
                stats = AgentStatsDto(tasks = 23, successRate = 0.91, avgLatency = "2.1s")
            ),
            AgentDto(
                config = AgentConfigDto("kimi-code", "Kimi Code", "Moonshot 编码助手", "kimi", agentType = "kimi"),
                status = "disconnected",
                version = "",
                description = "Moonshot 编码助手",
                stats = AgentStatsDto()
            ),
            AgentDto(
                config = AgentConfigDto("opencode", "OpenCode", "开源编码 Agent", "opencode", agentType = "opencode"),
                status = "not_installed",
                version = "",
                description = "开源编码 Agent — 尚未安装",
                stats = AgentStatsDto()
            )
        )
    }

    val onlineAgents = displayAgents.filter { it.status != "not_installed" }
    val pendingAgents = displayAgents.filter { it.status == "not_installed" }
    val onlineCount = displayAgents.count { it.status == "connected" }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        // ── Title bar ────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Agent 编排台",
                color = Tx,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )

            Spacer(Modifier.width(10.dp))

            // Agent count badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(Ac.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    "${displayAgents.size} Agents",
                    color = Ac,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(Modifier.width(8.dp))

            // Online count
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .width(6.dp)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Gn)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    "$onlineCount 在线",
                    color = Gn,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(Modifier.weight(1f))

            // Refresh button
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Bg3)
                    .border(1.dp, Bd, RoundedCornerShape(6.dp))
                    .clickable(onClick = onRefresh)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    "Scan",
                    color = Tx2,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(Modifier.width(8.dp))

            // Add Agent button
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Ac.copy(alpha = 0.15f))
                    .border(1.dp, Ac.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                    .clickable(onClick = onAddAgent)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    "+ 添加 Agent",
                    color = Ac,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(Modifier.height(20.dp))

        // ── Swarm Visualization ──────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(260.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Bg2)
                .border(1.dp, Bd, RoundedCornerShape(12.dp))
        ) {
            SwarmVisualization(
                agents = displayAgents,
                onNodeClick = onConfigClick,
                modifier = Modifier.fillMaxSize()
            )
        }

        Spacer(Modifier.height(24.dp))

        // ── Online Agents section ────────────────────────────────────
        SectionHeader(title = "在线 Agents", count = onlineAgents.size)

        Spacer(Modifier.height(10.dp))

        if (onlineAgents.isEmpty()) {
            EmptySection("暂无在线 Agent，点击 Scan 扫描本地安装")
        } else {
            // 2-column grid via Rows
            onlineAgents.chunked(2).forEach { rowAgents ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    rowAgents.forEachIndexed { idxInRow, agent ->
                        // Find the original index in displayAgents for color/letter mapping
                        val colorIdx = displayAgents.indexOf(agent).coerceAtLeast(0)
                        AgentCard(
                            agent = agent,
                            colorIndex = colorIdx,
                            onConfigClick = { onConfigClick(agent) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    // Pad last row if odd count
                    if (rowAgents.size < 2) {
                        Spacer(Modifier.weight(1f))
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }

        Spacer(Modifier.height(12.dp))

        // ── Pending Install section ──────────────────────────────────
        SectionHeader(title = "待安装", count = pendingAgents.size)

        Spacer(Modifier.height(10.dp))

        if (pendingAgents.isEmpty()) {
            EmptySection("所有已知 Agent 均已安装")
        } else {
            pendingAgents.forEachIndexed { idx, agent ->
                val colorIdx = displayAgents.indexOf(agent).coerceAtLeast(0)
                AgentCard(
                    agent = agent,
                    colorIndex = colorIdx,
                    onConfigClick = { onConfigClick(agent) },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
            }
        }

        // Bottom spacer for scroll comfort
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun SectionHeader(title: String, count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            title,
            color = Tx,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "($count)",
            color = Tx3,
            fontSize = 12.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun EmptySection(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Bg2)
            .border(1.dp, Bd, RoundedCornerShape(8.dp))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = Tx3,
            fontSize = 12.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}
