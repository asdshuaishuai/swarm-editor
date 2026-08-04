package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.updatedAgentAccess

internal fun parseKeyValueList(value: String): Map<String, String> = value
    .split('\n', ';')
    .mapNotNull { entry ->
        val separator = entry.indexOf('=')
        if (separator <= 0) null else entry.substring(0, separator).trim().takeIf { it.isNotEmpty() }
            ?.let { key -> key to entry.substring(separator + 1).trim() }
    }
    .toMap()

private fun Map<String, String>.toEditableText(): String = entries.joinToString("; ") { "${it.key}=${it.value}" }

@Composable
fun McpConfigModal(
    serverId: String?,
    servers: List<McpServerDto> = emptyList(),
    agents: List<AgentInfo> = emptyList(),
    onSave: (McpServerDto) -> Unit = {},
    onDelete: (String) -> Unit = {},
    onDismiss: () -> Unit
) {
    if (serverId == null) return

    val existingServer = servers.find { it.id == serverId }
    val server = existingServer ?: McpServerDto(serverId, "")
    var name by remember(server) { mutableStateOf(server.name) }
    var command by remember(server) { mutableStateOf(server.command) }
    var args by remember(server) { mutableStateOf(server.args.joinToString(" ")) }
    var protocol by remember(server) { mutableStateOf(server.type.ifEmpty { "stdio" }.lowercase()) }
    var url by remember(server) { mutableStateOf(server.url) }
    var environment by remember(server) { mutableStateOf(server.env.toEditableText()) }
    var bearerTokenEnvVar by remember(server) { mutableStateOf(server.bearerTokenEnvVar) }
    var headers by remember(server) { mutableStateOf(server.headers.toEditableText()) }
    var description by remember(server) { mutableStateOf(server.description) }
    var disabled by remember(server) { mutableStateOf(server.disabled) }
    val enabledAgents = remember(server) { mutableStateMapOf<String, Boolean>().apply { putAll(server.enabledAgents) } }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .modalInputBarrier()
            .overlayBackdrop(OverlayDepth.SECONDARY)
            .padding(horizontal = 28.dp, vertical = 22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.82f)
                .widthIn(max = 920.dp)
                .layeredSurface(
                    depth = OverlayDepth.SECONDARY,
                    bg = Bg1.copy(alpha = 0.985f),
                    border = Line2,
                    shape = AppShapes.xl,
                )
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp, vertical = 20.dp),
        ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(44.dp).clip(AppShapes.md).background(Bg0.withAlpha(0.6f))
                                .border(1.dp, Line2, AppShapes.md),
                            contentAlignment = Alignment.Center
                        ) { Text("MCP", color = Ac, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(name, color = Tx, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Text("$protocol · 工具服务配置", color = Tx3, fontSize = 12.sp, fontFamily = CodeFont)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(
                            Modifier.clip(RoundedCornerShape(R6)).background((if (disabled) Warn else Ok).withAlpha(0.12f))
                                .border(1.dp, (if (disabled) Warn else Ok).withAlpha(0.3f), RoundedCornerShape(R6))
                                .clickable { disabled = !disabled }.padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(if (disabled) WarnLight else OkLight))
                            Spacer(Modifier.width(4.dp))
                            Text(if (disabled) "已停用" else "已启用", color = if (disabled) WarnLight else OkLight, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.size(30.dp).fluidClickable(onClick = onDismiss).clip(AppShapes.sm).background(Bg2), contentAlignment = Alignment.Center) {
                            Icon(imageVector = Feather.X, contentDescription = "关闭", tint = Tx3, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))
                SectionLabel("基础配置")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    FormField("名称", name, { name = it }, Modifier.weight(1f))
                    FormField("说明", description, { description = it }, Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Text("传输协议", color = Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("stdio", "http").forEach { option ->
                        val active = protocol == option
                        Text(
                            option, color = if (active) OnAccent else Tx2, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                                .background(if (active) Ac else Bg2)
                                .border(1.dp, if (active) Ac else Line, RoundedCornerShape(8.dp))
                                .clickable { protocol = option }.padding(vertical = 8.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                if (protocol == "http") {
                    FormField("服务 URL", url, { url = it }, Modifier.fillMaxWidth())
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FormField("Bearer Token 环境变量", bearerTokenEnvVar, { bearerTokenEnvVar = it }, Modifier.weight(1f))
                        FormField("请求头（KEY=value; ...）", headers, { headers = it }, Modifier.weight(1f))
                    }
                } else {
                    FormField("启动命令", command, { command = it }, Modifier.fillMaxWidth())
                    Spacer(Modifier.height(10.dp))
                    FormField("参数（空格分隔）", args, { args = it }, Modifier.fillMaxWidth())
                }

                Spacer(Modifier.height(14.dp))
                SectionLabel("环境变量")
                Spacer(Modifier.height(8.dp))
                FormField("KEY=value; KEY2=value2", environment, { environment = it }, Modifier.fillMaxWidth())

                if (server.tools.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    SectionLabel("可用工具 (${server.tools.size})")
                    Spacer(Modifier.height(8.dp))
                    FlowTools(server.tools.map { it.name })
                }

                Spacer(Modifier.height(14.dp))
                SectionLabel("授权主智能体")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    agents.forEach { agent ->
                        val allowed = enabledAgents.isEmpty() || enabledAgents[agent.id] == true
                        Text(
                            agent.name,
                            color = if (allowed) AcLight else Tx3,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp))
                                .background(if (allowed) Ac.withAlpha(0.12f) else Color.Transparent)
                                .border(1.dp, if (allowed) Ac else Line, RoundedCornerShape(8.dp))
                                .clickable {
                                    val updated = enabledAgents.toMap().updatedAgentAccess(
                                        agentIds = agents.map { it.id },
                                        agentId = agent.id,
                                        enabled = !allowed
                                    )
                                    enabledAgents.clear()
                                    enabledAgents.putAll(updated)
                                }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (existingServer != null) {
                        GhostButton("删除", danger = true, onClick = { onDelete(server.id); onDismiss() })
                    }
                    Spacer(Modifier.weight(1f))
                    GhostButton("取消", onClick = onDismiss)
                    Spacer(Modifier.width(8.dp))
                    GlowButton(
                        "保存配置",
                        active = name.isNotBlank() && if (protocol == "http") url.isNotBlank() else command.isNotBlank(),
                        onClick = {
                            onSave(
                                server.copy(
                                    name = name.trim(),
                                    type = protocol,
                                    command = if (protocol == "stdio") command.trim() else "",
                                    args = if (protocol == "stdio") args.split(Regex("\\s+")).filter { it.isNotBlank() } else emptyList(),
                                    env = parseKeyValueList(environment),
                                    url = if (protocol == "http") url.trim() else "",
                                    enabledAgents = enabledAgents.toMap(),
                                    description = description.trim(),
                                    bearerTokenEnvVar = if (protocol == "http") bearerTokenEnvVar.trim() else "",
                                    headers = if (protocol == "http") parseKeyValueList(headers) else emptyMap(),
                                    disabled = disabled
                                )
                            )
                            onDismiss()
                        }
                    )
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
        tools.forEach { tool ->
            Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(5.dp).clip(CircleShape).background(OkLight))
                Spacer(Modifier.width(6.dp))
                Text(tool, color = Tx2, fontSize = 11.sp, fontFamily = CodeFont)
            }
        }
    }
}
