package com.swarmeditor.desktop.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Plus
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

// ── 侧栏通用标题行（对齐核心稿 .side-header）──────────────────────
@Composable
private fun SideHeader(title: String, onAdd: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title.uppercase(),
            color = Tx2,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.4.sp
        )
        Spacer(Modifier.weight(1f))
        if (onAdd != null) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .fluidClickable(onClick = onAdd)
                    .clip(AppShapes.xs),
                contentAlignment = Alignment.Center
            ) {
                Icon(imageVector = Feather.Plus, contentDescription = "添加", tint = Tx3, modifier = Modifier.size(16.dp))
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  Agents 侧栏（agents 视图）— Agent 列表
// ════════════════════════════════════════════════════════════════
@Composable
fun AgentSideBar(
    agents: List<AgentInfo>,
    onSelect: (AgentInfo) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.width(260.dp).fillMaxHeight().background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        SideHeader("主智能体")
        Box(Modifier.height(1.dp).fillMaxWidth().background(Line))
        LazyColumn(modifier = Modifier.weight(1f).padding(6.dp)) {
            items(agents, key = { it.id }) { agent ->
                AgentSideRow(agent = agent, onClick = { onSelect(agent) })
            }
        }
    }
}

@Composable
private fun AgentSideRow(agent: AgentInfo, onClick: () -> Unit) {
    val (dotColor, label) = when {
        agent.isConnected -> OkLight to "已连接"
        agent.version.isEmpty() -> WarnLight to "未安装"
        else -> ErrLight to "未连接"
    }
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.sm)
            .background(if (isHovered) Bg3.copy(alpha = 0.6f) else Color.Transparent)
            .hoverable(interactionSource)
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(28.dp)
                    .clip(AppShapes.sm)
                    .background(Brush.linearGradient(listOf(agent.color, agent.color.copy(alpha = 0.7f)))),
                contentAlignment = Alignment.Center
            ) {
                Text(agent.letter, color = OnAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(dotColor)
                    .border(2.dp, Bg1, CircleShape)
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                agent.name,
                color = Tx,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(dotColor))
                Spacer(Modifier.width(5.dp))
                Text(label, color = Tx3, fontSize = 11.sp)
                if (agent.version.isNotEmpty()) {
                    Text(" · ${agent.version}", color = Tx3, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  Plugins 侧栏（plugins 视图）— MCP / Skills 子tab + 列表
// ════════════════════════════════════════════════════════════════
private enum class PluginSideTab(val label: String) { MCP("MCP"), SKILLS("Skills") }

@Composable
fun PluginSideBar(
    mcpServers: List<McpServerDto>,
    skills: List<SkillDto>,
    onSelectMcp: (McpServerDto) -> Unit,
    onSelectSkill: (SkillDto) -> Unit,
    onAdd: () -> Unit = {},
    activeTab: String = "mcp",
    onTabChange: (String) -> Unit = {},
    selectedMcpId: String? = null,
    selectedSkillId: String? = null,
    modifier: Modifier = Modifier
) {
    val tab = if (activeTab == "skills") PluginSideTab.SKILLS else PluginSideTab.MCP
    Column(modifier.width(260.dp).fillMaxHeight().background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        SideHeader("插件", onAdd)
        // 子 tab
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            PluginSideTab.entries.forEach { st ->
                PluginSideTabButton(
                    label = st.label,
                    count = if (st == PluginSideTab.MCP) mcpServers.size else skills.size,
                    isActive = tab == st,
                    onClick = { onTabChange(if (st == PluginSideTab.MCP) "mcp" else "skills") },
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Box(Modifier.height(1.dp).fillMaxWidth().background(Line))
        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(6.dp)) {
            when (tab) {
                PluginSideTab.MCP -> items(mcpServers, key = { it.id }) { server ->
                    val s = server
                    val (statusColor, statusLabel) = when (s.runtimeStatus) {
                        McpRuntimeStatus.BRIDGED -> OkLight to "已桥接"
                        McpRuntimeStatus.CONFIGURED -> AcLight to "已配置"
                        McpRuntimeStatus.DISABLED -> Tx3 to "已停用"
                        McpRuntimeStatus.UNSUPPORTED -> WarnLight to "不支持"
                        McpRuntimeStatus.FAILED -> ErrLight to "运行失败"
                    }
                    PluginSideRow(
                        iconText = s.icon.ifEmpty { s.name.take(1) },
                        iconBg = Ac,
                        title = s.id,
                        meta = buildList {
                            add("${s.tools.size} tools")
                            s.version.takeIf(String::isNotBlank)?.let { add("v$it") }
                        }.joinToString(" · "),
                        statusColor = statusColor,
                        statusLabel = statusLabel,
                        isActive = s.id == selectedMcpId,
                        onClick = { onSelectMcp(s) }
                    )
                }
                PluginSideTab.SKILLS -> items(skills, key = { it.id }) { s ->
                    PluginSideRow(
                        iconText = s.name.take(1),
                        iconBg = if (s.source == "MCP") AgentQwen else AgentGemini,
                        title = s.name,
                        titleSuffix = s.source,
                        meta = s.source,
                        isActive = s.id == selectedSkillId,
                        onClick = { onSelectSkill(s) }
                    )
                }
            }
        }
    }
}

@Composable
private fun PluginSideTabButton(
    label: String,
    count: Int,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    val background by animateColorAsState(
        when {
            isActive -> Ac.withAlpha(0.14f)
            isHovered -> Bg3.copy(alpha = 0.65f)
            else -> Color.Transparent
        },
        Motion.colorDefault,
        label = "pluginTabBackground",
    )

    Box(
        modifier = modifier
            .height(TileMetrics.compactHeight)
            .fluidClickable(interactionSource = interactionSource, onClick = onClick)
            .clip(AppShapes.sm)
            .background(background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (isActive) AcLight else Tx3,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        MicroPill(
            label = count.coerceAtMost(999).let { if (count > 999) "999+" else it.toString() },
            color = if (isActive) AcLight else Tx3,
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 6.dp)
        )
    }
}

@Composable
private fun PluginSideRow(
    iconText: String,
    iconBg: Color,
    title: String,
    meta: String,
    statusColor: Color? = null,
    statusLabel: String? = null,
    isActive: Boolean = false,
    titleSuffix: String? = null,
    onClick: () -> Unit
) {
    val hovInt = remember { MutableInteractionSource() }
    val hov by hovInt.collectIsHoveredAsState()
    val rowBg by animateColorAsState(
        when {
            isActive -> Ac.withAlpha(0.1f)
            hov -> Bg3.copy(alpha = 0.65f)
            else -> Color.Transparent
        },
        Motion.colorDefault,
        label = "pluginRowBackground",
    )
    Row(
        modifier = Modifier.fillMaxWidth().fluidClickable(interactionSource = hovInt, onClick = onClick).clip(AppShapes.sm)
            .background(rowBg)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier.size(26.dp).clip(AppShapes.sm).background(iconBg.withAlpha(0.15f)),
            contentAlignment = Alignment.Center
        ) { Text(iconText.uppercase(), color = iconBg, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    color = Tx,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                if (titleSuffix != null) {
                    Spacer(Modifier.width(5.dp))
                    Text(titleSuffix, color = if (titleSuffix == "MCP") AgentQwen else OkLight, fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(AppShapes.xs).background((if (titleSuffix == "MCP") AgentQwen else OkLight).withAlpha(0.15f)).padding(horizontal = 4.dp, vertical = 1.dp))
                }
            }
            Text(meta, color = Tx3, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = CodeFont)
        }
        if (statusColor != null) {
            Box(
                Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(statusColor)
                    .semantics { contentDescription = statusLabel ?: "状态" }
            )
        }
    }
}
