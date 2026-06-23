package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import com.woowla.compose.icon.collections.feather.feather.Server
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
import androidx.compose.ui.window.Dialog
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.*

private val AUTH_AGENTS = listOf(
    "claude-code" to "Claude Code", "qwen-code" to "QwenCode", "gemini-cli" to "Gemini",
    "kimi-code" to "Kimi", "opencode" to "OpenCode"
)

@Composable
fun McpConfigModal(
    serverId: String?,
    servers: List<McpServerDto> = emptyList(),
    onDismiss: () -> Unit
) {
    if (serverId == null) return

    val server = servers.find { it.id == serverId } ?: remember {
        McpServerDto(serverId, "Server $serverId", "stdio", "node $serverId.js")
    }
    var cmd by remember { mutableStateOf(server.command) }
    var protocol by remember { mutableStateOf(server.type.ifEmpty { "stdio" }) }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.withAlpha(0.6f)).clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.width(620.dp).modalEnter().clip(RoundedCornerShape(R16))
                    .background(Brush.linearGradient(listOf(Color(0xFF0f1220), Color(0xFF0a0c14))))
                    .border(1.dp, Line2, RoundedCornerShape(R16))
                    .clickable(enabled = false) {}
                    .padding(20.dp, 24.dp)
            ) {
                // 头部
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(Bg0.withAlpha(0.6f))
                                .border(1.dp, Line2, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(server.icon.ifEmpty { "🔌" }, fontSize = 24.sp)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(server.name, color = Tx, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Text("${server.type} · MCP Server", color = Tx3, fontSize = 12.sp, fontFamily = CodeFont)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // 运行中状态
                        Row(
                            Modifier.clip(RoundedCornerShape(R6)).background(Ok.withAlpha(0.12f))
                                .border(1.dp, Ok.withAlpha(0.3f), RoundedCornerShape(R6)).padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(OkLight))
                            Spacer(Modifier.width(4.dp))
                            Text("运行中", color = OkLight, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
                            Icon(imageVector = Feather.X, contentDescription = "关闭", tint = Tx3, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                // 启动配置
                Spacer(Modifier.height(18.dp))
                SectionLabel("启动配置")
                Spacer(Modifier.height(8.dp))
                FormField("启动命令", cmd, { cmd = it }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                Text("传输协议", color = Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("stdio", "sse", "http").forEach { p ->
                        val active = protocol == p
                        Text(
                            p, color = if (active) Color.White else Tx2, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                                .background(if (active) Ac else Bg2)
                                .border(1.dp, if (active) Ac else Line, RoundedCornerShape(8.dp))
                                .clickable { protocol = p }.padding(vertical = 8.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // 环境变量
                Spacer(Modifier.height(16.dp))
                SectionLabel("环境变量")
                Spacer(Modifier.height(8.dp))
                if (server.env.isEmpty()) {
                    Text("暂无环境变量", color = Tx3, fontSize = 12.sp,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg2.withAlpha(0.3f))
                            .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                } else {
                    server.env.forEach { (k, v) ->
                        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(k, color = Tx, fontSize = 12.sp, fontFamily = CodeFont,
                                modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(Bg3.withAlpha(0.6f))
                                    .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(horizontal = 11.dp, vertical = 8.dp))
                            Text("•".repeat(v.length.coerceIn(6, 16)), color = Tx2, fontSize = 12.sp, fontFamily = CodeFont,
                                modifier = Modifier.weight(1.5f).clip(RoundedCornerShape(8.dp)).background(Bg3.withAlpha(0.6f))
                                    .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(horizontal = 11.dp, vertical = 8.dp))
                        }
                    }
                }

                // 可用工具
                Spacer(Modifier.height(14.dp))
                SectionLabel("可用工具 (${server.tools.size})")
                Spacer(Modifier.height(8.dp))
                FlowTools(server.tools.map { it.name })

                // 授权 Agent
                Spacer(Modifier.height(14.dp))
                SectionLabel("授权 Agent")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AUTH_AGENTS.forEach { (id, name) ->
                        val allowed = server.agents.any { it.equals(id.substringBefore("-"), true) || it == id }
                        Text(name, color = if (allowed) AcLight else Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp))
                                .background(if (allowed) Ac.withAlpha(0.12f) else Color.Transparent)
                                .border(1.dp, if (allowed) Ac else Line, RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }

                // 底部按钮
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("重启服务", color = Tx2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp))
                            .clickable(onClick = onDismiss).padding(horizontal = 12.dp, vertical = 7.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("删除", color = ErrLight, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp))
                            .clickable(onClick = onDismiss).padding(horizontal = 12.dp, vertical = 7.dp))
                    Spacer(Modifier.weight(1f))
                    GhostButton("取消", onClick = onDismiss)
                    Spacer(Modifier.width(8.dp))
                    GlowButton("保存配置", active = true, onClick = onDismiss)
                }
            }
        }
    }
}

@Composable
private fun FlowTools(tools: List<String>) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg2.withAlpha(0.3f))
            .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(10.dp)
    ) {
        tools.forEach { t ->
            Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(5.dp).clip(CircleShape).background(OkLight))
                Spacer(Modifier.width(6.dp))
                Text(t, color = Tx2, fontSize = 11.sp, fontFamily = CodeFont)
            }
        }
    }
}
