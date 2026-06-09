package com.swarmeditor.desktop.ui.session

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

@Composable
fun RightPanel(
    selectedAgent: AgentInfo,
    currentTab: String,
    onTabChange: (String) -> Unit,
    mcpServers: List<McpServerDto>,
    skills: List<SkillDto>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.background(Bg2).border(1.dp, Bd)) {
        // Tabs
        Row(modifier = Modifier.fillMaxWidth().border(1.dp, Bd)) {
            listOf("mcp" to "MCP", "skills" to "Skills", "diff" to "Diff").forEach { (id, label) ->
                val isActive = currentTab == id
                Box(modifier = Modifier.weight(1f).clickable { onTabChange(id) }.padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                    Text(label, color = if (isActive) Ac else Tx3, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.3.sp)
                }
            }
        }

        // Content
        when (currentTab) {
            "mcp" -> McpTabContent(mcpServers)
            "skills" -> SkillsTabContent(skills)
            "diff" -> DiffTabContent()
        }

        // 活动日志
        ActivityLogSection()
    }
}

@Composable
private fun McpTabContent(servers: List<McpServerDto>) {
    Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
        Text("已启用 (${servers.size})", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.7.sp)
        Spacer(Modifier.height(8.dp))
        if (servers.isEmpty()) {
            Text("暂无 MCP Server", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, modifier = Modifier.padding(8.dp))
        }
        servers.forEach { server ->
            Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(server.name, color = Tx, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
                    Spacer(Modifier.width(6.dp))
                    Text(server.type, color = Ac, fontSize = 9.sp, fontFamily = MonoFont)
                    Spacer(Modifier.weight(1f))
                    Text("●", color = Gn, fontSize = 10.sp)
                }
                Spacer(Modifier.height(5.dp))
                Text(server.command.ifEmpty { server.url }, color = Tx3, fontSize = 10.sp, fontFamily = MonoFont, maxLines = 1)
            }
            Spacer(Modifier.height(5.dp))
        }
    }
}

@Composable
private fun SkillsTabContent(skills: List<SkillDto>) {
    Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
        Text("已启用 (${skills.size})", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.7.sp)
        Spacer(Modifier.height(8.dp))
        if (skills.isEmpty()) {
            Text("暂无 Skills", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, modifier = Modifier.padding(8.dp))
        }
        skills.forEach { skill ->
            Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(skill.name, color = Tx, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
                    Spacer(Modifier.weight(1f))
                    Text(skill.source, color = Tx3, fontSize = 9.sp, fontFamily = MonoFont)
                }
                Spacer(Modifier.height(4.dp))
                Text(skill.description, color = Tx3, fontSize = 11.sp)
            }
            Spacer(Modifier.height(5.dp))
        }
    }
}

@Composable
private fun DiffTabContent() {
    Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        Text("暂无变更", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, modifier = Modifier.padding(8.dp))
    }
}

@Composable
private fun ActivityLogSection() {
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Bd).padding(10.dp, 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("活动日志", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.6.sp)
            Spacer(Modifier.weight(1f))
            listOf("全部", "MCP", "文件", "命令").forEach { label ->
                val isActive = label == "全部"
                Text(label, color = if (isActive) Ac else Tx3, fontSize = 10.sp, fontFamily = MonoFont,
                    modifier = Modifier.padding(start = 3.dp).clip(RoundedCornerShape(5.dp))
                        .then(if (isActive) Modifier.border(1.dp, Ac, RoundedCornerShape(5.dp)).background(AcD) else Modifier)
                        .padding(horizontal = 7.dp, vertical = 3.dp))
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("暂无活动记录", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont, modifier = Modifier.padding(8.dp))
    }
}
