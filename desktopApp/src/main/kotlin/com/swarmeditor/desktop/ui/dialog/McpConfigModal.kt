package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.IdeDialogShell
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

    val canSave = name.isNotBlank() && if (protocol == "http") url.isNotBlank() else command.isNotBlank()

    IdeDialogShell(
        title = if (existingServer == null) "添加 MCP 服务" else "编辑 MCP 服务",
        detail = server.id,
        onClose = onDismiss,
        maxWidth = 860.dp,
        heightFraction = 0.84f,
        footer = {
            if (existingServer != null) {
                GhostButton("删除", danger = true, onClick = { onDelete(server.id); onDismiss() })
            }
            Spacer(Modifier.weight(1f))
            GhostButton("取消", onClick = onDismiss)
            Spacer(Modifier.width(8.dp))
            GlowButton(
                "保存配置",
                active = canSave,
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
                            disabled = disabled,
                        )
                    )
                    onDismiss()
                },
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(name.ifBlank { "未命名 MCP 服务" }, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text("$protocol · ${server.tools.size} 个工具", color = Tx3, fontSize = 11.sp, fontFamily = CodeFont)
                }
                Row(
                    Modifier.height(28.dp).clip(AppShapes.xs).background(Bg2).border(1.dp, Line, AppShapes.xs)
                        .clickable { disabled = !disabled }.padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(if (disabled) WarnLight else OkLight))
                    Spacer(Modifier.width(5.dp))
                    Text(if (disabled) "已停用" else "已启用", color = if (disabled) WarnLight else Tx2, fontSize = 11.sp)
                }
            }

            Spacer(Modifier.height(18.dp))
            SectionLabel("基础配置")
            Spacer(Modifier.height(7.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FormField("名称", name, { name = it }, Modifier.weight(1f))
                FormField("说明", description, { description = it }, Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Text("传输协议", color = Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 5.dp))
            Row(
                Modifier.fillMaxWidth().height(30.dp).clip(AppShapes.xs).background(Bg2).border(1.dp, Line, AppShapes.xs),
            ) {
                    listOf("stdio", "http").forEach { option ->
                        val active = protocol == option
                        Box(
                            Modifier.weight(1f).fillMaxHeight().background(if (active) Ac.withAlpha(0.2f) else Color.Transparent)
                                .clickable { protocol = option },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(option, color = if (active) Tx else Tx3, fontSize = 11.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                        }
                    }
                }
            Spacer(Modifier.height(10.dp))
            if (protocol == "http") {
                FormField("服务 URL", url, { url = it }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FormField("Bearer Token 环境变量", bearerTokenEnvVar, { bearerTokenEnvVar = it }, Modifier.weight(1f))
                    FormField("请求头（KEY=value; ...）", headers, { headers = it }, Modifier.weight(1f))
                }
            } else {
                FormField("启动命令", command, { command = it }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                FormField("参数（空格分隔）", args, { args = it }, Modifier.fillMaxWidth())
            }

            Spacer(Modifier.height(16.dp))
            SectionLabel("环境变量")
            Spacer(Modifier.height(7.dp))
            FormField("KEY=value; KEY2=value2", environment, { environment = it }, Modifier.fillMaxWidth())

            if (server.tools.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                SectionLabel("可用工具 (${server.tools.size})")
                Spacer(Modifier.height(7.dp))
                FlowTools(server.tools.map { it.name })
            }

            Spacer(Modifier.height(16.dp))
            SectionLabel("授权主智能体")
            Spacer(Modifier.height(6.dp))
            agents.forEach { agent ->
                val allowed = enabledAgents.isEmpty() || enabledAgents[agent.id] == true
                Row(
                    Modifier.fillMaxWidth().height(30.dp).clip(AppShapes.xs)
                        .background(if (allowed) Ac.withAlpha(0.16f) else Color.Transparent)
                        .clickable {
                            val updated = enabledAgents.toMap().updatedAgentAccess(
                                agentIds = agents.map { it.id },
                                agentId = agent.id,
                                enabled = !allowed,
                            )
                            enabledAgents.clear()
                            enabledAgents.putAll(updated)
                        }
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(7.dp).clip(CircleShape).border(1.dp, if (allowed) Ac else Tx3, CircleShape).background(if (allowed) Ac else Color.Transparent))
                    Spacer(Modifier.width(7.dp))
                    Text(agent.name, color = if (allowed) Tx else Tx3, fontSize = 12.sp, fontWeight = if (allowed) FontWeight.SemiBold else FontWeight.Normal)
                    Spacer(Modifier.weight(1f))
                    Text(if (allowed) "允许" else "禁止", color = Tx3, fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun FlowTools(tools: List<String>) {
    Column(
        Modifier.fillMaxWidth().clip(AppShapes.xs).background(Bg2)
            .border(1.dp, Line, AppShapes.xs).padding(horizontal = 8.dp, vertical = 5.dp)
    ) {
        tools.forEach { tool ->
            Row(Modifier.height(24.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(5.dp).clip(CircleShape).background(OkLight))
                Spacer(Modifier.width(6.dp))
                Text(tool, color = Tx2, fontSize = 11.sp, fontFamily = CodeFont)
            }
        }
    }
}
