package com.swarmeditor.desktop.ui.settings

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.SettingsViewModel

// 全局 Agent 列表（用于 MCP/Skills 面板的 per-Agent 勾选）
private data class AgentRef(val id: String, val name: String, val emoji: String)
private val ALL_AGENTS = listOf(
    AgentRef("claude-code", "Claude Code", "🟣"), AgentRef("qwen-code", "QwenCode", "🔵"),
    AgentRef("gemini-cli", "Gemini CLI", "🟢"), AgentRef("kimi-code", "Kimi Code", "🟡"), AgentRef("opencode", "OpenCode", "🟠")
)

@Composable
fun SettingsModal(agents: List<AgentInfo>, settingsVm: SettingsViewModel, onClose: () -> Unit) {
    var activeTab by remember { mutableStateOf("agent") }
    val selectedAgentId by settingsVm.selectedAgentId.collectAsState()
    val configFields by settingsVm.configFields.collectAsState()
    val configPath by settingsVm.configPath.collectAsState()
    val mcpServers by settingsVm.mcpServers.collectAsState()
    val skills by settingsVm.skills.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
        Column(modifier = Modifier.width(720.dp).clip(RoundedCornerShape(12.dp)).background(Bg2).border(1.dp, Bd2, RoundedCornerShape(12.dp)).clickable(enabled = false) {}) {
            // Header
            Row(modifier = Modifier.fillMaxWidth().background(Bg).padding(14.dp, 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("设置", color = Ac, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont, letterSpacing = 0.5.sp)
                Spacer(Modifier.weight(1f))
                Box(modifier = Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).clickable(onClick = onClose), contentAlignment = Alignment.Center) { Text("✕", color = Tx3, fontSize = 14.sp) }
            }
            // Tabs
            Row(modifier = Modifier.fillMaxWidth().background(Bg).border(1.dp, Bd)) {
                listOf("agent" to "Agent 配置", "mcp" to "MCP 管理", "skills" to "Skills 管理").forEach { (id, label) ->
                    val isActive = activeTab == id
                    Box(modifier = Modifier.clickable { activeTab = id }.padding(10.dp, 16.dp), contentAlignment = Alignment.Center) {
                        Text(label, color = if (isActive) Ac else Tx3, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont)
                    }
                }
            }
            // Body
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (activeTab) {
                    "agent" -> AgentConfigTab(agents, selectedAgentId, { settingsVm.selectAgent(it) }, configFields, configPath, settingsVm)
                    "mcp" -> McpManagementTab(mcpServers, settingsVm)
                    "skills" -> SkillsManagementTab(skills, settingsVm)
                }
            }
            // Footer
            Row(modifier = Modifier.fillMaxWidth().border(1.dp, Bd).padding(12.dp, 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                Text("关闭", color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp)).clickable(onClick = onClose).padding(horizontal = 16.dp, vertical = 7.dp))
            }
        }
    }
}

// ==================== Agent 配置 Tab ====================
@Composable
private fun AgentConfigTab(agents: List<AgentInfo>, selectedId: String, onSelect: (String) -> Unit, fields: List<com.swarmeditor.desktop.viewmodel.AgentConfigField>, configPath: String, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        // Agent 选择器
        Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Surface).padding(4.dp)) {
            agents.forEach { agent ->
                val isActive = agent.id == selectedId
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(if (isActive) AcD else Color.Transparent).clickable { onSelect(agent.id) }.padding(vertical = 7.dp), contentAlignment = Alignment.Center) {
                    Text("${agent.emoji} ${agent.name}", color = if (isActive) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont)
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // 连接信息
        val agent = agents.find { it.id == selectedId }
        if (agent != null) {
            Section("连接") {
                InfoRow("状态", if (agent.isConnected) "● 已连接" else "○ 未连接", if (agent.isConnected) Gn else Tx3)
                if (agent.version.isNotEmpty()) InfoRow("版本", agent.version)
                InfoRow("配置文件", configPath.ifEmpty { "未检测" }, Tx3, 11)
            }
            Spacer(Modifier.height(14.dp))
        }

        // 原生配置字段
        Section("原生配置") {
            if (fields.isEmpty()) {
                Text("此 Agent 暂无配置或未安装", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
            }
            fields.forEach { field ->
                EditableField(field) { key, value -> settingsVm.saveField(key, value) }
            }
        }
    }
}

// ==================== MCP 管理 Tab ====================
@Composable
private fun McpManagementTab(servers: List<McpServerDto>, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("MCP Servers", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("导入", color = Tx2, fontSize = 11.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp)).padding(horizontal = 14.dp, vertical = 6.dp))
            Spacer(Modifier.width(6.dp))
            Text("+ 添加", color = Bg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).padding(horizontal = 14.dp, vertical = 6.dp))
        }
        Spacer(Modifier.height(16.dp))
        if (servers.isEmpty()) {
            Text("暂无 MCP Server 配置", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
        }
        servers.forEach { server ->
            McpMgmtCard(server, settingsVm)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun McpMgmtCard(server: McpServerDto, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(server.name, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
            Spacer(Modifier.width(6.dp))
            Text(server.type, color = Ac, fontSize = 9.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(AcD).padding(horizontal = 5.dp, vertical = 1.dp))
            Spacer(Modifier.weight(1f))
            Text("编辑", color = Tx2, fontSize = 11.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Bd2, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
            Spacer(Modifier.width(4.dp))
            Text("删除", color = Rd, fontSize = 11.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Rd.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                    .clickable { settingsVm.deleteMcpServer(server.id) }.padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(server.command.ifEmpty { server.url }, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, maxLines = 1)
        Spacer(Modifier.height(8.dp))
        // Per-Agent 启用
        Row { ALL_AGENTS.forEach { agent ->
            val isOn = server.enabledAgents[agent.id] == true
            AgentToggle(agent.name, isOn) { settingsVm.toggleMcpAgent(server.id, agent.id, !isOn) }
            Spacer(Modifier.width(5.dp))
        }}
    }
}

// ==================== Skills 管理 Tab ====================
@Composable
private fun SkillsManagementTab(skills: List<SkillDto>, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Skills 管理", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("扫描", color = Tx2, fontSize = 11.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp))
                    .clickable { settingsVm.scanSkills() }.padding(horizontal = 14.dp, vertical = 6.dp))
            Spacer(Modifier.width(6.dp))
            Text("+ 创建 Skill", color = Bg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).padding(horizontal = 14.dp, vertical = 6.dp))
        }
        Spacer(Modifier.height(12.dp))
        Text("💡 创建 Skill 通过 Claude Code 的 SKILL.md 规范实现，使用 Claude Code 进行创建。（暂未实现）", color = Tx3, fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(8.dp)).padding(10.dp))
        Spacer(Modifier.height(16.dp))
        if (skills.isEmpty()) {
            Text("暂无 Skills，点击扫描发现", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
        }
        skills.forEach { skill ->
            SkillMgmtCard(skill, settingsVm)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun SkillMgmtCard(skill: SkillDto, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(skill.name, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
            Spacer(Modifier.weight(1f))
            Text(skill.source, color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
        }
        if (skill.description.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(skill.description, color = Tx3, fontSize = 11.sp)
        }
        Spacer(Modifier.height(8.dp))
        Row { ALL_AGENTS.forEach { agent ->
            val isOn = skill.enabledAgents[agent.id] == true
            AgentToggle(agent.name, isOn) { settingsVm.toggleSkillAgent(skill.id, agent.id, !isOn) }
            Spacer(Modifier.width(5.dp))
        }}
    }
}

// ==================== 通用组件 ====================
@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Text(title, color = Tx2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.3.sp)
    Spacer(Modifier.height(10.dp))
    content()
}

@Composable
private fun InfoRow(label: String, value: String, valueColor: Color = Tx2, valueSize: Int = 12) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tx3, fontSize = 12.sp, fontFamily = MonoFont, modifier = Modifier.width(90.dp))
        Text(value, color = valueColor, fontSize = valueSize.sp, fontFamily = MonoFont)
    }
}

@Composable
private fun EditableField(field: com.swarmeditor.desktop.viewmodel.AgentConfigField, onSave: (String, String) -> Unit) {
    var editValue by remember(field.label) { mutableStateOf(field.value) }
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(field.label, color = Tx3, fontSize = 12.sp, fontFamily = MonoFont, modifier = Modifier.width(90.dp))
        Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(Bg).border(1.dp, Bd2, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 7.dp)) {
            Text(
                if (field.isPassword && editValue.isNotEmpty()) "••••••••" else editValue.ifEmpty { "未配置" },
                color = if (editValue.isEmpty()) Tx4 else Tx, fontSize = 12.sp, fontFamily = MonoFont
            )
        }
    }
}

@Composable
private fun AgentToggle(name: String, enabled: Boolean, onToggle: () -> Unit) {
    Row(modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(if (enabled) AcD else Surface)
        .border(1.dp, if (enabled) Ac else Bd, RoundedCornerShape(5.dp))
        .clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(5.dp).clip(RoundedCornerShape(2.5.dp)).background(if (enabled) Ac else Tx3))
        Spacer(Modifier.width(4.dp))
        Text(name, color = if (enabled) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.Medium, fontFamily = MonoFont)
    }
}
