package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.swarmeditor.backend.pi.PiCommandInfo
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.ControlGreen
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.fluidClickable
import com.swarmeditor.desktop.theme.withAlpha

internal fun callableMcpServers(servers: List<McpServerDto>, agentId: String): List<McpServerDto> =
    servers.filter { server ->
        !server.disabled &&
            server.runtimeStatus == McpRuntimeStatus.BRIDGED &&
            server.tools.any { it.active } &&
            (server.enabledAgents.isEmpty() || server.enabledAgents[agentId] == true)
    }.sortedBy { it.name.lowercase() }

internal fun callableSkillCommands(commands: List<PiCommandInfo>): List<PiCommandInfo> =
    commands.filter { it.source == "skill" && it.name.startsWith("skill:") }
        .distinctBy(PiCommandInfo::name)
        .sortedBy { it.name.lowercase() }

@Composable
internal fun ComposerChipButton(
    icon: ImageVector,
    label: String,
    tone: Color,
    onClick: () -> Unit,
    badge: Int? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val chipTop by animateColorAsState(
        if (hovered) tone.withAlpha(0.26f) else tone.withAlpha(0.17f),
        Motion.colorDefault,
        label = "composerChipTop",
    )
    val chipBottom by animateColorAsState(
        if (hovered) tone.withAlpha(0.15f) else tone.withAlpha(0.09f),
        Motion.colorDefault,
        label = "composerChipBottom",
    )
    val chipBorder by animateColorAsState(
        if (hovered) tone.withAlpha(0.62f) else tone.withAlpha(0.38f),
        Motion.colorDefault,
        label = "composerChipBorder",
    )
    val contentColor by animateColorAsState(
        if (hovered) tone else Tx2,
        Motion.colorDefault,
        label = "composerChipContent",
    )
    val shape = RoundedCornerShape(9.dp)

    Row(
        modifier = Modifier
            .shadow(2.dp, shape)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(chipTop, chipBottom)))
            .border(1.dp, chipBorder, shape)
            .fluidClickable(interactionSource = interaction, pressScale = 0.97f, onClick = onClick)
            .height(32.dp)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = contentColor, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, color = contentColor, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
        badge?.let {
            Spacer(Modifier.width(6.dp))
            Box(
                modifier = Modifier.clip(AppShapes.pill).background(tone.withAlpha(0.2f)).padding(horizontal = 6.dp, vertical = 1.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(it.toString(), color = tone, style = AppType.micro, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun McpCapabilityButton(
    servers: List<McpServerDto>,
    agentId: String,
    icon: ImageVector,
    tone: Color,
) {
    val callable = remember(servers, agentId) { callableMcpServers(servers, agentId) }
    var expanded by remember { mutableStateOf(false) }
    Box {
        ComposerChipButton(icon, "MCP", tone, onClick = { expanded = true }, badge = callable.size)
        CapabilityMenu(
            expanded = expanded,
            onDismiss = { expanded = false },
            title = "当前可调用的 MCP",
            summary = "${callable.sumOf { server -> server.tools.count { it.active } }} 个活动工具 · ${callable.size} 个服务",
        ) {
            if (callable.isEmpty()) {
                CapabilityEmptyState("当前 Pi 会话尚未桥接可用的 MCP 工具")
            } else {
                callable.forEach { server -> McpCapabilityRow(server) }
            }
        }
    }
}

@Composable
internal fun SkillCapabilityButton(
    commands: List<PiCommandInfo>,
    icon: ImageVector,
    tone: Color,
    onSelect: (PiCommandInfo) -> Unit,
) {
    val callable = remember(commands) { callableSkillCommands(commands) }
    var expanded by remember { mutableStateOf(false) }
    Box {
        ComposerChipButton(icon, "Skill", tone, onClick = { expanded = true }, badge = callable.size)
        CapabilityMenu(
            expanded = expanded,
            onDismiss = { expanded = false },
            title = "当前可调用的 Skills",
            summary = "来自当前 Pi 会话的 ${callable.size} 个命令",
        ) {
            if (callable.isEmpty()) {
                CapabilityEmptyState("当前 Pi 会话尚未注册 Skill 命令")
            } else {
                callable.forEach { command ->
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text("/${command.name}", color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
                                if (command.description.isNotBlank()) {
                                    Text(
                                        command.description,
                                        color = Tx3,
                                        style = AppType.micro,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        },
                        onClick = {
                            expanded = false
                            onSelect(command)
                        },
                        modifier = Modifier.fillMaxWidth().background(Color.Transparent),
                    )
                }
            }
        }
    }
}

@Composable
private fun CapabilityMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    title: String,
    summary: String,
    content: @Composable () -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        modifier = Modifier
            .widthIn(min = 360.dp, max = 440.dp)
            .heightIn(max = 420.dp)
            .background(Bg2)
            .border(1.dp, Line2, AppShapes.md),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
            Text(title, color = Tx, style = AppType.body, fontWeight = FontWeight.Bold)
            Text(summary, color = Tx3, style = AppType.micro)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        content()
    }
}

@Composable
private fun McpCapabilityRow(server: McpServerDto) {
    val activeTools = server.tools.filter { it.active }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .clip(AppShapes.sm)
            .background(Bg3.withAlpha(0.72f))
            .border(1.dp, ControlGreen.withAlpha(0.22f), AppShapes.sm)
            .padding(horizontal = 11.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(AppShapes.pill).background(ControlGreen))
            Spacer(Modifier.width(7.dp))
            Text(server.name, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("${activeTools.size} tools", color = ControlGreen, style = AppType.micro)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            activeTools.joinToString(" · ") { it.name },
            color = Tx2,
            style = AppType.micro,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (server.runtimeMessage.isNotBlank()) {
            Spacer(Modifier.height(3.dp))
            Text(server.runtimeMessage, color = Tx3, style = AppType.micro, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun CapabilityEmptyState(message: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(28.dp).clip(AppShapes.sm).background(Ac.withAlpha(0.12f)), contentAlignment = Alignment.Center) {
            Text("π", color = Ac, style = AppType.body, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
        Text(message, color = Tx3, style = AppType.bodySm)
    }
}
