package com.swarmeditor.desktop.ui.settings

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.SettingsViewModel

// 全局 Agent 列表（用于 MCP/Skills 面板的 per-Agent 勾选）
private data class AgentRef(val id: String, val name: String, val letter: String)
private val ALL_AGENTS = listOf(
    AgentRef("claude-code", "Claude Code", "C"), AgentRef("qwen-code", "QwenCode", "Q"),
    AgentRef("gemini-cli", "Gemini CLI", "G"), AgentRef("kimi-code", "Kimi Code", "K"), AgentRef("opencode", "OpenCode", "O")
)

@Composable
fun SettingsModal(
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
    onClose: () -> Unit,
    mcpServers: List<McpServerDto> = emptyList(),
    skills: List<SkillDto> = emptyList()
) {
    var activeTab by remember { mutableStateOf(System.getProperty("swarm.settingsTab") ?: "agent") }
    val selectedAgentId by settingsVm.selectedAgentId.collectAsState()
    val configFields by settingsVm.configFields.collectAsState()
    val configPath by settingsVm.configPath.collectAsState()

    val tabs = listOf(
        "agent" to "Agent 配置", "mcp" to "MCP 管理", "skills" to "Skills 管理",
        "general" to "通用", "appearance" to "外观", "shortcuts" to "快捷键", "about" to "关于"
    )

    Box(modifier = Modifier.fillMaxSize().background(Color.Black.withAlpha(0.5f)).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
        Column(modifier = Modifier.width(760.dp).height(520.dp).modalEnter().clip(RoundedCornerShape(R12)).background(Bg2).border(1.dp, Line2, RoundedCornerShape(R12)).clickable(enabled = false) {}) {
            // Header
            Row(modifier = Modifier.fillMaxWidth().background(Bg).padding(14.dp, 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("设置", color = Ac, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont, letterSpacing = 0.5.sp)
                Spacer(Modifier.weight(1f))
                Box(modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Tx3, modifier = Modifier.size(14.dp))
                }
            }
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                Column(modifier = Modifier.width(130.dp).fillMaxHeight().background(Bg).padding(vertical = 4.dp)) {
                    tabs.forEach { (id, label) ->
                        val isActive = activeTab == id
                        Row(modifier = Modifier.fillMaxWidth().clickable { activeTab = id }.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (isActive) {
                                Box(modifier = Modifier.width(2.dp).height(14.dp).clip(RoundedCornerShape(1.dp)).background(Ac))
                            } else {
                                Box(modifier = Modifier.width(2.dp).height(14.dp))
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(label, color = if (isActive) Ac else Tx3, fontSize = 11.sp, fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal, fontFamily = SansFont)
                        }
                    }
                }
                // Body
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    when (activeTab) {
                        "agent" -> AgentConfigTab(agents, selectedAgentId, { settingsVm.selectAgent(it) }, configFields, configPath, settingsVm)
                        "mcp" -> McpManagementTab(mcpServers, settingsVm)
                        "skills" -> SkillsManagementTab(skills, settingsVm)
                        "general" -> GeneralTab(agents)
                        "appearance" -> AppearanceTab()
                        "shortcuts" -> ShortcutsTab()
                        "about" -> AboutTab()
                    }
                }
            }
            // Footer
            Row(modifier = Modifier.fillMaxWidth().background(Bg).border(1.dp, Line).padding(12.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                Text("关闭", color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line2, RoundedCornerShape(6.dp)).clickable(onClick = onClose).padding(horizontal = 16.dp, vertical = 7.dp))
            }
        }
    }
}

// ==================== Agent 配置 Tab ====================
@Composable
private fun AgentConfigTab(agents: List<AgentInfo>, selectedId: String, onSelect: (String) -> Unit, fields: List<com.swarmeditor.desktop.viewmodel.AgentConfigField>, configPath: String, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        // Agent 选择器
        Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).padding(4.dp)) {
            agents.forEach { agent ->
                val isActive = agent.id == selectedId
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(if (isActive) Ac.withAlpha(0.12f) else Color.Transparent).clickable { onSelect(agent.id) }.padding(vertical = 7.dp), contentAlignment = Alignment.Center) {
                    Text("${agent.letter} ${agent.name}", color = if (isActive) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // 连接信息
        val agent = agents.find { it.id == selectedId }
        if (agent != null) {
            Section("连接") {
                InfoRow("状态", if (agent.isConnected) "已连接" else "未连接", if (agent.isConnected) Gn else Tx3)
                if (agent.version.isNotEmpty()) InfoRow("版本", agent.version)
                InfoRow("配置文件", configPath.ifEmpty { "未检测" }, Tx3, 11)
            }
            Spacer(Modifier.height(14.dp))
        }

        // 原生配置字段
        Section("原生配置") {
            if (fields.isEmpty()) {
                Text("此 Agent 暂无配置或未安装", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
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
            Text("导入", color = Tx2, fontSize = 11.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line2, RoundedCornerShape(6.dp)).padding(horizontal = 14.dp, vertical = 6.dp))
            Spacer(Modifier.width(6.dp))
            Text("+ 添加", color = Bg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).padding(horizontal = 14.dp, vertical = 6.dp))
        }
        Spacer(Modifier.height(16.dp))
        if (servers.isEmpty()) {
            Text("暂无 MCP Server 配置", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
        }
        servers.forEach { server ->
            McpMgmtCard(server, settingsVm)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun McpMgmtCard(server: McpServerDto, settingsVm: SettingsViewModel) {
    Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(6.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(server.name, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
            Spacer(Modifier.width(6.dp))
            Text(server.type, color = Ac, fontSize = 9.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(Ac.withAlpha(0.12f)).padding(horizontal = 5.dp, vertical = 1.dp))
            Spacer(Modifier.weight(1f))
            Text("编辑", color = Tx2, fontSize = 11.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Line2, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
            Spacer(Modifier.width(4.dp))
            Text("删除", color = Rd, fontSize = 11.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Rd.withAlpha(0.3f), RoundedCornerShape(4.dp))
                    .clickable { settingsVm.deleteMcpServer(server.id) }.padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(server.command.ifEmpty { server.url }, color = Tx3, fontSize = 11.sp, fontFamily = SansFont, maxLines = 1)
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
            Text("扫描", color = Tx2, fontSize = 11.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line2, RoundedCornerShape(6.dp))
                    .clickable { settingsVm.scanSkills() }.padding(horizontal = 14.dp, vertical = 6.dp))
            Spacer(Modifier.width(6.dp))
            Text("+ 创建 Skill", color = Bg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).padding(horizontal = 14.dp, vertical = 6.dp))
        }
        Spacer(Modifier.height(12.dp))
        Text("创建 Skill 通过 Claude Code 的 SKILL.md 规范实现，使用 Claude Code 进行创建。（暂未实现）", color = Tx3, fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(10.dp))
        Spacer(Modifier.height(16.dp))
        if (skills.isEmpty()) {
            Text("暂无 Skills，点击扫描发现", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
        }
        skills.forEach { skill ->
            SkillMgmtCard(skill, settingsVm)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun SkillMgmtCard(skill: SkillDto, settingsVm: SettingsViewModel) {
    val isMcp = skill.source.equals("MCP", true)
    val accent = if (isMcp) AgentQwen else AgentGemini
    val enabled = skill.enabledAgents.isEmpty() || skill.enabledAgents.values.any { it }
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Bg2.withAlpha(0.5f)).border(1.dp, Line, RoundedCornerShape(12.dp)).padding(14.dp)
    ) {
        // 头部：图标 + 名称/来源 + 状态
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(accent.withAlpha(0.15f)),
                contentAlignment = Alignment.Center
            ) { Text(if (isMcp) "🔌" else "🧩", fontSize = 16.sp) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(skill.name, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text("${skill.source} · ${skill.tags.size} 标签", color = Tx3, fontSize = 11.sp)
            }
            Text(
                if (enabled) "已启用" else "已禁用", color = if (enabled) OkLight else Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background((if (enabled) Ok else Tx3).withAlpha(0.12f)).padding(horizontal = 7.dp, vertical = 2.dp)
            )
        }
        if (skill.description.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(skill.description, color = Tx2, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2)
        }
        // Agent 标签
        if (skill.tags.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                skill.tags.take(4).forEach { t ->
                    Text(t, color = AcLight, fontSize = 10.sp, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Ac.withAlpha(0.12f)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }
        }
        // 底部操作
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("配置", color = Tx2, fontSize = 11.sp,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
            Spacer(Modifier.width(6.dp))
            Text("查看源码", color = Tx2, fontSize = 11.sp,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
            Spacer(Modifier.weight(1f))
            Text(if (enabled) "禁用" else "启用", color = if (enabled) ErrLight else OkLight, fontSize = 11.sp,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, if (enabled) Err.withAlpha(0.3f) else Ok.withAlpha(0.3f), RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
}

// ==================== 通用组件 ====================
@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Text(title.uppercase(), color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont, letterSpacing = 0.8.sp)
    Spacer(Modifier.height(10.dp))
    content()
}

@Composable
private fun InfoRow(label: String, value: String, valueColor: Color = Tx2, valueSize: Int = 12) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tx3, fontSize = 12.sp, fontFamily = SansFont, modifier = Modifier.width(90.dp))
        Text(value, color = valueColor, fontSize = valueSize.sp, fontFamily = SansFont)
    }
}

@Composable
private fun EditableField(field: com.swarmeditor.desktop.viewmodel.AgentConfigField, onSave: (String, String) -> Unit) {
    var editValue by remember(field.label) { mutableStateOf(field.value) }
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(field.label, color = Tx3, fontSize = 12.sp, fontFamily = SansFont, modifier = Modifier.width(90.dp))
        Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line2, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
            Text(
                if (field.isPassword && editValue.isNotEmpty()) "••••••••" else editValue.ifEmpty { "未配置" },
                color = if (editValue.isEmpty()) Tx3 else Tx, fontSize = 12.sp, fontFamily = SansFont
            )
        }
    }
}

@Composable
private fun AgentToggle(name: String, enabled: Boolean, onToggle: () -> Unit) {
    Row(modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (enabled) Ac.withAlpha(0.12f) else Bg3)
        .border(1.dp, if (enabled) Ac else Line, RoundedCornerShape(6.dp))
        .clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(5.dp).clip(RoundedCornerShape(2.5.dp)).background(if (enabled) Ac else Tx3))
        Spacer(Modifier.width(4.dp))
        Text(name, color = if (enabled) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont)
    }
}

// ==================== 通用 Tab ====================
@Composable
private fun GeneralTab(agents: List<AgentInfo>) {
    var workDir by remember { mutableStateOf(System.getProperty("user.dir")) }
    var defaultAgent by remember { mutableStateOf(agents.firstOrNull()?.id ?: "claude-code") }

    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        Section("默认工作目录") {
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text(workDir, color = Tx, fontSize = 12.sp, fontFamily = SansFont)
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text("浏览...", color = Ac, fontSize = 11.sp, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Line2, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("默认 Agent") {
            Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).padding(4.dp)) {
                agents.forEach { agent ->
                    val isActive = agent.id == defaultAgent
                    Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(if (isActive) Ac.withAlpha(0.12f) else Color.Transparent).clickable { defaultAgent = agent.id }.padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                        Text("${agent.letter} ${agent.name}", color = if (isActive) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("会话自动保存间隔") {
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line2, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text("实时", color = Tx, fontSize = 12.sp, fontFamily = SansFont)
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("偏好") {
            ToggleRow("启动时恢复连接", true)
            ToggleRow("自动保存会话", true)
            ToggleRow("显示桌面通知", false)
            ToggleRow("归档活动日志到本地", true)
        }
    }
}

@Composable
private fun ToggleRow(label: String, defaultOn: Boolean) {
    var on by remember { mutableStateOf(defaultOn) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
            .clip(RoundedCornerShape(8.dp)).background(Bg3.withAlpha(0.4f)).border(1.dp, Line, RoundedCornerShape(8.dp))
            .clickable { on = !on }.padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = Tx2, fontSize = 12.sp, fontFamily = SansFont, modifier = Modifier.weight(1f))
        ToggleChip(on)
    }
}

@Composable
private fun ToggleChip(on: Boolean) {
    Box(modifier = Modifier.size(32.dp, 18.dp).clip(RoundedCornerShape(8.dp)).background(if (on) Ac else Bg3).border(1.dp, if (on) Ac else Line2, RoundedCornerShape(8.dp)), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
        Box(modifier = Modifier.size(14.dp).padding(horizontal = 2.dp).clip(CircleShape).background(if (on) Bg else Tx3))
    }
}

// ==================== 外观 Tab ====================
@Composable
private fun AppearanceTab() {
    var selectedTheme by remember { mutableStateOf("dark") }
    val themes = listOf("dark" to "深色", "light" to "浅色", "system" to "系统")

    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
        Section("主题预设") {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                themes.forEach { (id, label) ->
                    val isActive = selectedTheme == id
                    Column(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(if (isActive) Ac.withAlpha(0.12f) else Bg3).border(1.dp, if (isActive) Ac else Line2, RoundedCornerShape(R8)).clickable { selectedTheme = id }.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)).background(if (id == "dark") Bg else if (id == "light") Color(0xFFe0e0e8) else Color(0xFF2a2a34)).border(1.dp, Line2, RoundedCornerShape(8.dp)))
                        Spacer(Modifier.height(8.dp))
                        Text(label, color = if (isActive) Ac else Tx2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("字体大小") {
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("界面字体", color = Tx3, fontSize = 12.sp, fontFamily = SansFont, modifier = Modifier.width(90.dp))
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                    Text("13px", color = Tx, fontSize = 12.sp, fontFamily = SansFont)
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("代码字体", color = Tx3, fontSize = 12.sp, fontFamily = SansFont, modifier = Modifier.width(90.dp))
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                    Text("JetBrains Mono 12px", color = Tx, fontSize = 12.sp, fontFamily = SansFont)
                }
            }
        }
    }
}

// ==================== 快捷键 Tab ====================
private data class ShortcutItem(val command: String, val keys: String, val description: String)

@Composable
private fun ShortcutsTab() {
    val shortcuts = listOf(
        ShortcutItem("新建会话", "⌘ N", "创建新的 Agent 会话"),
        ShortcutItem("打开设置", "⌘ ,", "打开设置面板"),
        ShortcutItem("命令面板", "⌘ K", "打开 Cmd+K 快速命令"),
        ShortcutItem("发送消息", "Enter", "在输入框中发送消息"),
        ShortcutItem("换行", "Shift+Enter", "在输入框中插入换行"),
        ShortcutItem("切换侧栏", "⌘ B", "显示/隐藏右侧面板"),
        ShortcutItem("切换视图", "⌘ 1-5", "切换到对应视图"),
        ShortcutItem("关闭弹窗", "Esc", "关闭当前弹窗或对话框"),
    )

    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("键盘快捷键", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
            Spacer(Modifier.weight(1f))
            Text("只读", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                modifier = Modifier.clip(RoundedCornerShape(R8)).background(Bg3).padding(horizontal = 8.dp, vertical = 3.dp))
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            items(shortcuts, key = { it.command }) { item ->
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).background(Bg3).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.command, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont)
                        Text(item.description, color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                    }
                    Box(modifier = Modifier.clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                        Text(item.keys, color = Ac, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
                    }
                }
            }
        }
    }
}

// ==================== 关于 Tab ====================
@Composable
private fun AboutTab() {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(20.dp))
        Box(modifier = Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).background(Ac.withAlpha(0.12f)).border(1.dp, Ac.withAlpha(0.3f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            Text("SE", color = Ac, fontSize = 18.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
        }
        Spacer(Modifier.height(12.dp))
        Text("Swarm Editor", color = Tx, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
        Text("v0.1.0 MVP", color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
        Spacer(Modifier.height(16.dp))
        Text(buildAnnotatedString {
            withStyle(SpanStyle(color = Tx3, fontSize = 11.sp, fontFamily = SansFont)) {
                append("多 Agent 协调桌面客户端\n")
                append("Kotlin/JVM · Compose Desktop · Ktor")
            }
        }, color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
        Spacer(Modifier.height(24.dp))
        Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp)) {
            InfoRow("技术栈", "Kotlin 2.3.10 + JDK 21")
            InfoRow("前端", "Compose Desktop 1.8.1")
            InfoRow("后端", "Ktor 3.2.2 (CIO)")
            InfoRow("协议", "ACP 0.13.1 / MCP 0.4.0")
            InfoRow("构建", "Gradle 8.x + Kotlin DSL")
        }
        Spacer(Modifier.height(16.dp))
        Text("github.com/swarm-editor", color = Ac, fontSize = 11.sp, fontFamily = SansFont,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Line2, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}
