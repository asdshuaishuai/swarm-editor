package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.AgentConfigField

private fun descOf(id: String) = if (id.isNotBlank()) {
    "编辑器内置主智能体。它负责规划任务，并从独立模型池按需创建临时子智能体。"
} else {
    ""
}
@Composable
fun AgentConfigModal(
    agentId: String?,
    visible: Boolean = true,
    agents: List<AgentInfo> = emptyList(),
    configFields: List<AgentConfigField> = emptyList(),
    configPath: String = "",
    onSave: (Map<String, String>) -> Unit = {},
    onConnect: (String) -> Unit = {},
    onDisconnect: (String) -> Unit = {},
    onDismiss: () -> Unit
) {
    if (agentId == null) return

    val agent = agents.find { it.id == agentId } ?: return
    val isInstalled = agents.any { it.version.isNotEmpty() || it.isConnected }
    val desc = descOf(agentId)
    val editedFields = remember(agentId) { mutableStateMapOf<String, String>() }
    LaunchedEffect(agentId, configFields) {
        editedFields.clear()
        configFields.forEach { editedFields[it.label] = it.value }
    }

    Box(
        modifier = Modifier.fillMaxSize().background(Scrim.copy(alpha = 0.58f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.9f)
                .widthIn(max = 880.dp)
                .modalSurfaceMotion(visible)
                .surfaceCard(bg = Bg1.copy(alpha = 0.98f), border = Line2, elevation = Elevation.modal, shape = AppShapes.xl)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp, vertical = 20.dp),
        ) {
                // 头部
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(42.dp).clip(AppShapes.md)
                                .background(agent.color),
                            contentAlignment = Alignment.Center
                        ) { Text(agent.letter, color = OnAccent, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(
                                editedFields["Name"].orEmpty().ifBlank { agent.name },
                                color = Tx,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text("主智能体配置 · ${agent.version.ifEmpty { "就绪" }}", color = Tx3, fontSize = 12.sp, fontFamily = CodeFont)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusChip(agent.isConnected, isInstalled)
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.size(30.dp).fluidClickable(onClick = onDismiss).clip(AppShapes.sm).background(Bg2), contentAlignment = Alignment.Center) {
                            Icon(imageVector = Feather.X, contentDescription = "关闭", tint = Tx3, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                if (desc.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg2.withAlpha(0.5f))
                            .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(10.dp, 12.dp)
                    ) { Text(desc, color = Tx2, fontSize = 13.sp, lineHeight = 18.sp) }
                }

                // 内置 runtime 状态
                if (!isInstalled) {
                    Spacer(Modifier.height(14.dp))
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Warn.withAlpha(0.08f))
                            .border(1.dp, Warn.withAlpha(0.2f), RoundedCornerShape(8.dp)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("执行环境尚不可用", color = WarnLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(6.dp))
                            Text("请重新构建内置执行环境后再连接。", color = Tx2, fontSize = 12.sp)
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                SectionLabel("执行配置文件")
                Spacer(Modifier.height(8.dp))
                Text(
                    configPath.ifEmpty { "保存后写入主智能体配置" },
                    color = if (configPath.isEmpty()) Tx3 else Tx2,
                    fontSize = 12.sp,
                    fontFamily = CodeFont,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg2.withAlpha(0.4f))
                        .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(11.dp)
                )

                Spacer(Modifier.height(14.dp))
                SectionLabel("智能体策略")
                Spacer(Modifier.height(8.dp))
                if (configFields.isEmpty()) {
                    InlineLoadingState(
                        text = "正在加载配置字段…",
                        modifier = Modifier.fillMaxWidth(),
                        minHeight = 48.dp,
                    )
                } else {
                    configFields.forEachIndexed { index, field ->
                        FormField(
                            label = field.label,
                            value = editedFields[field.label].orEmpty(),
                            onChange = { editedFields[field.label] = it },
                            modifier = Modifier.fillMaxWidth(),
                            isPassword = field.isPassword
                        )
                        if (index != configFields.lastIndex) Spacer(Modifier.height(10.dp))
                    }
                }

                // 底部按钮
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    run {
                        if (agent.isConnected) {
                            GhostButton("断开连接", danger = true, onClick = { onDisconnect(agentId); onDismiss() })
                        } else if (isInstalled) {
                            ActionButton(
                                text = "重新连接",
                                tone = ActionTone.SECONDARY,
                                prominent = false,
                                onClick = { onConnect(agentId); onDismiss() },
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        GhostButton("取消", onClick = onDismiss)
                        Spacer(Modifier.width(8.dp))
                        GlowButton(
                            "保存配置",
                            active = configFields.isNotEmpty(),
                            onClick = {
                                onSave(editedFields.toMap())
                                onDismiss()
                            }
                        )
                    }
                }
        }
    }
}

@Composable
private fun StatusChip(isConnected: Boolean, isInstalled: Boolean) {
    val (color, label) = when {
        isConnected -> Ok to "已连接"
        isInstalled -> Err to "未连接"
        else -> Warn to "执行环境不可用"
    }
    Row(
        Modifier.clip(RoundedCornerShape(R6)).background(color.withAlpha(0.12f))
            .border(1.dp, color.withAlpha(0.3f), RoundedCornerShape(R6)).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(if (isConnected) OkLight else color))
        Spacer(Modifier.width(4.dp))
        Text(label, color = if (isConnected) OkLight else color, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}
