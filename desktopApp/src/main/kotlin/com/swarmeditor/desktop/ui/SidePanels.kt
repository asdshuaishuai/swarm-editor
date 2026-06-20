package com.swarmeditor.desktop.ui

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
import androidx.compose.material.icons.filled.Add
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
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
                modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).clickable(onClick = onAdd),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.Add, contentDescription = "添加", tint = Tx3, modifier = Modifier.size(16.dp))
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
    onAdd: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Column(modifier.width(260.dp).fillMaxHeight().background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        SideHeader("Agents", onAdd)
        Box(Modifier.height(1.dp).fillMaxWidth().background(Line))
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)) {
            agents.forEach { a ->
                val (dotColor, label) = when {
                    a.isConnected -> OkLight to "已连接"
                    a.version.isEmpty() -> WarnLight to "未安装"
                    else -> ErrLight to "未连接"
                }
                val hovInt = remember { MutableInteractionSource() }
                val hov by hovInt.collectIsHoveredAsState()
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .background(if (hov) Bg3.copy(alpha = 0.6f) else Color.Transparent)
                        .hoverable(hovInt)
                        .clickable { onSelect(a) }.padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(26.dp), contentAlignment = Alignment.Center) {
                        Box(
                            Modifier.size(26.dp).clip(RoundedCornerShape(8.dp))
                                .background(Brush.linearGradient(listOf(a.color, a.color.copy(alpha = 0.7f)))),
                            contentAlignment = Alignment.Center
                        ) { Text(a.letter, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        Box(
                            Modifier.align(Alignment.BottomEnd).size(9.dp).clip(CircleShape)
                                .background(dotColor).border(2.dp, Bg1, CircleShape)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(a.name, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(dotColor))
                            Spacer(Modifier.width(5.dp))
                            Text(label, color = Tx3, fontSize = 11.sp)
                            if (a.version.isNotEmpty()) {
                                Text(" · ${a.version}", color = Tx3, fontSize = 11.sp)
                            }
                        }
                    }
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
    modifier: Modifier = Modifier
) {
    val tab = if (activeTab == "skills") PluginSideTab.SKILLS else PluginSideTab.MCP
    Column(modifier.width(260.dp).fillMaxHeight().background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        SideHeader("插件", onAdd)
        // 子 tab
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            PluginSideTab.entries.forEach { st ->
                val active = tab == st
                Row(
                    Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                        .background(if (active) Ac.withAlpha(0.12f) else Color.Transparent)
                        .clickable { onTabChange(if (st == PluginSideTab.MCP) "mcp" else "skills") }.padding(vertical = 6.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(st.label, color = if (active) AcLight else Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.width(5.dp))
                    Text(
                        if (st == PluginSideTab.MCP) "${mcpServers.size}" else "${skills.size}",
                        color = Tx3, fontSize = 10.sp,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }
        }
        Box(Modifier.height(1.dp).fillMaxWidth().background(Line))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)) {
            when (tab) {
                PluginSideTab.MCP -> mcpServers.forEach { s ->
                    PluginSideRow(
                        iconText = s.icon.ifEmpty { s.name.take(1) },
                        iconBg = Ac,
                        title = s.name,
                        meta = "${s.type}${if (s.version.isNotEmpty()) " · v${s.version}" else ""}",
                        online = true,
                        onClick = { onSelectMcp(s) }
                    )
                }
                PluginSideTab.SKILLS -> skills.forEach { s ->
                    PluginSideRow(
                        iconText = s.name.take(1),
                        iconBg = if (s.source == "MCP") AgentQwen else AgentGemini,
                        title = s.name,
                        meta = "${s.tags.size} tags · ${s.source}",
                        online = true,
                        onClick = { onSelectSkill(s) }
                    )
                }
            }
        }
    }
}

@Composable
private fun PluginSideRow(
    iconText: String,
    iconBg: Color,
    title: String,
    meta: String,
    online: Boolean,
    onClick: () -> Unit
) {
    val hovInt = remember { MutableInteractionSource() }
    val hov by hovInt.collectIsHoveredAsState()
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(if (hov) Bg3.copy(alpha = 0.6f) else Color.Transparent)
            .hoverable(hovInt)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier.size(26.dp).clip(RoundedCornerShape(8.dp)).background(iconBg.withAlpha(0.15f)),
            contentAlignment = Alignment.Center
        ) { Text(iconText.uppercase(), color = iconBg, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            Text(meta, color = Tx3, fontSize = 11.sp, maxLines = 1)
        }
        Box(Modifier.size(7.dp).clip(CircleShape).background(if (online) OkLight else Tx3))
    }
}
