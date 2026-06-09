package com.swarmeditor.desktop.ui.mcp

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
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.*

/**
 * MCP 独立面板 — 可从右侧 Tab 或设置模态框中使用。
 * 展示 MCP Server 列表 + 工具浏览。
 */
@Composable
fun McpPanel(
    servers: List<McpServerDto>,
    selectedServerId: String?,
    onSelectServer: (String) -> Unit,
    onAddServer: () -> Unit,
    onDeleteServer: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        // Header
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("MCP Servers", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("+ 添加", color = Bg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).clickable(onClick = onAddServer).padding(horizontal = 12.dp, vertical = 5.dp))
        }

        // Server 列表
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            if (servers.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    Text("暂无 MCP Server，点击添加", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
                }
            }
            servers.forEach { server ->
                val isSelected = server.id == selectedServerId
                val borderColor = if (isSelected) Ac else Bd
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Surface2)
                        .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                        .clickable { onSelectServer(server.id) }.padding(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(server.name, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
                        Spacer(Modifier.width(8.dp))
                        Text(server.type, color = Ac, fontSize = 9.sp, fontFamily = MonoFont,
                            modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(AcD).padding(horizontal = 5.dp, vertical = 1.dp))
                        Spacer(Modifier.weight(1f))
                        Text("●", color = Gn, fontSize = 10.sp)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(server.command.ifEmpty { server.url }, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, maxLines = 1)
                    Spacer(Modifier.height(8.dp))
                    Text("启用 Agent:", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
                    Spacer(Modifier.height(4.dp))
                    Row {
                        server.enabledAgents.filter { it.value }.forEach { (agentId, _) ->
                            Text(agentId, color = Ac, fontSize = 10.sp, fontFamily = MonoFont,
                                modifier = Modifier.padding(end = 4.dp).clip(RoundedCornerShape(4.dp)).background(AcD).padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                        if (server.enabledAgents.none { it.value }) {
                            Text("无", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}
