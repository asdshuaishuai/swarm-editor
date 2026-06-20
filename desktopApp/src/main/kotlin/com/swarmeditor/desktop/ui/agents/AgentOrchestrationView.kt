package com.swarmeditor.desktop.ui.agents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentConfigDto
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.api.AgentStatsDto
import com.swarmeditor.desktop.theme.*

/**
 * Agent Orchestration View — aligned with mvp-design-mockup.html
 *
 * Layout:
 *  1. Chat-topbar style header: icon + title/subtitle + "+ 添加 Agent" button
 *  2. SwarmVisualization (120dp height)
 *  3. "在线 Agents" section — full-width AgentCard list
 *  4. "待安装" section — full-width AgentCard list
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

    val displayAgents = loadedAgents.ifEmpty {
        listOf(
            AgentDto(
                config = AgentConfigDto("claude-code", "Claude Code", "Anthropic 旗舰编码助手", "claude", agentType = "claude"),
                status = "connected",
                version = "1.2.3",
                description = "官方 Anthropic 命令行 Agent。擅长代码重构、系统设计与深度分析。",
                stats = AgentStatsDto(tasks = 47, successRate = 0.98, avgLatency = "24ms")
            ),
            AgentDto(
                config = AgentConfigDto("qwencode", "QwenCode", "通义灵码编码助手", "qwen", agentType = "qwen"),
                status = "disconnected",
                version = "0.8.1",
                description = "阿里通义千问。中文理解强，适合文档/测试生成。",
                stats = AgentStatsDto(tasks = 12, successRate = 0.89, avgLatency = "")
            ),
            AgentDto(
                config = AgentConfigDto("gemini-cli", "Gemini CLI", "Google Gemini 命令行工具", "gemini", agentType = "gemini"),
                status = "not_installed",
                version = "",
                description = "Google Gemini 命令行 Agent。多模态能力强。",
                stats = AgentStatsDto()
            ),
            AgentDto(
                config = AgentConfigDto("kimi-code", "Kimi Code", "Moonshot Kimi 命令行工具", "kimi", agentType = "kimi"),
                status = "not_installed",
                version = "",
                description = "Moonshot Kimi。超长上下文处理能力。",
                stats = AgentStatsDto()
            ),
            AgentDto(
                config = AgentConfigDto("opencode", "OpenCode", "OpenCode 开源 Agent", "opencode", agentType = "opencode"),
                status = "not_installed",
                version = "",
                description = "OpenCode 开源 Agent。可定制性高。",
                stats = AgentStatsDto()
            )
        )
    }

    val onlineAgents = displayAgents.filter { it.status != "not_installed" }
    val pendingAgents = displayAgents.filter { it.status == "not_installed" }
    val onlineCount = onlineAgents.size
    val totalCount = displayAgents.size

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg0)
            .verticalScroll(rememberScrollState())
    ) {
        // ── Top bar (chat-topbar style) ─────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Bg1)
                .border(1.dp, Line)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Ac.withAlpha(0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = "Agents",
                    tint = Ac,
                    modifier = Modifier.size(14.dp)
                )
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    "Agent 编排台",
                    color = Tx,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "$totalCount 个 Agent · $onlineCount 在线 · ${pendingAgents.size} 待安装",
                    color = Tx3,
                    fontSize = 12.sp
                )
            }
            Spacer(Modifier.weight(1f))
            // + 添加 Agent button
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Brush.linearGradient(listOf(Ac, Ac2)))
                    .clickable(onClick = onAddAgent)
                    .padding(horizontal = 14.dp, vertical = 7.dp)
            ) {
                Text(
                    "+ 添加 Agent",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // ── Scrollable content ─────────────────────────────────────
        Column(modifier = Modifier.padding(24.dp, 20.dp, 24.dp, 20.dp)) {
            // Swarm Visualization
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.radialGradient(
                            listOf(Ac.withAlpha(0.1f), Color.Transparent),
                            center = androidx.compose.ui.geometry.Offset(0.5f, 0.5f),
                            radius = 0.7f
                        )
                    )
                    .background(Bg0.withAlpha(0.5f))
                    .border(1.dp, Line, RoundedCornerShape(12.dp))
            ) {
                SwarmVisualization(
                    agents = displayAgents,
                    onNodeClick = onConfigClick,
                    modifier = Modifier.fillMaxSize()
                )
            }

            Spacer(Modifier.height(24.dp))

            // ── Online Agents ────────────────────────────────────────
            SectionLabel("在线 Agents", onlineAgents.size)
            Spacer(Modifier.height(10.dp))

            if (onlineAgents.isEmpty()) {
                EmptySection("暂无在线 Agent，点击 Scan 扫描本地安装")
            } else {
                onlineAgents.forEachIndexed { idx, agent ->
                    val colorIdx = displayAgents.indexOf(agent).coerceAtLeast(0)
                    AgentCard(
                        agent = agent,
                        colorIndex = colorIdx,
                        onConfigClick = { onConfigClick(agent) }
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }

            Spacer(Modifier.height(12.dp))

            // ── Pending Install ──────────────────────────────────────
            SectionLabel("待安装", pendingAgents.size)
            Spacer(Modifier.height(10.dp))

            if (pendingAgents.isEmpty()) {
                EmptySection("所有已知 Agent 均已安装")
            } else {
                pendingAgents.forEachIndexed { idx, agent ->
                    val colorIdx = displayAgents.indexOf(agent).coerceAtLeast(0)
                    AgentCard(
                        agent = agent,
                        colorIndex = colorIdx,
                        onConfigClick = { onConfigClick(agent) }
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }
}

@Composable
private fun SectionLabel(title: String, count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            title.uppercase(),
            color = Tx3,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.6.sp
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "($count)",
            color = Tx3,
            fontSize = 11.sp
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
            .border(1.dp, Line, RoundedCornerShape(8.dp))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = Tx3,
            fontSize = 12.sp
        )
    }
}
