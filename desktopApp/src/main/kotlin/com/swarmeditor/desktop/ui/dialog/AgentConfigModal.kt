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
import com.swarmeditor.common.model.ModelConfig

private fun descOf(id: String) = if (id.isNotBlank()) {
    "编辑器内置主智能体。它负责规划任务，并从独立模型池按需创建临时子智能体。"
} else {
    ""
}
@Composable
fun AgentConfigModal(
    agentId: String?,
    agents: List<AgentInfo> = emptyList(),
    models: List<ModelConfig> = emptyList(),
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
        modifier = Modifier
            .fillMaxSize()
            .modalInputBarrier()
            .overlayBackdrop(OverlayDepth.SECONDARY)
            .padding(horizontal = 28.dp, vertical = 22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.9f)
                .widthIn(max = 880.dp)
                .layeredSurface(
                    depth = OverlayDepth.SECONDARY,
                    bg = Bg1.copy(alpha = 0.985f),
                    border = Line2,
                    shape = AppShapes.xl,
                )
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
                                agent.name,
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
                SectionLabel("主模型")
                Spacer(Modifier.height(8.dp))
                if (configFields.isEmpty()) {
                    InlineLoadingState(
                        text = "正在加载配置字段…",
                        modifier = Modifier.fillMaxWidth(),
                        minHeight = 48.dp,
                    )
                } else if (models.isEmpty()) {
                    Text("模型池为空，请先在设置中心添加模型。", color = WarnLight, fontSize = 12.sp)
                } else {
                    Text(
                        "主智能体只需要指定主模型；身份、工作目录和系统策略由编辑器统一管理。",
                        color = Tx3,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    val selectedModelId = editedFields["Primary Model"].orEmpty()
                    models.forEach { model ->
                        ModalPrimaryModelOption(
                            model = model,
                            selected = model.id == selectedModelId,
                            onSelect = { editedFields["Primary Model"] = model.id },
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "子智能体仍会根据任务职责、模型能力与并发余量动态分配，不固定使用主模型。",
                        color = Tx3,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
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
private fun ModalPrimaryModelOption(
    model: ModelConfig,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.md)
            .background(if (selected) Ac.withAlpha(0.1f) else Bg2)
            .border(1.dp, if (selected) Ac.withAlpha(0.42f) else Line2, AppShapes.md)
            .clickable(enabled = model.enabled && !selected, onClick = onSelect)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(9.dp).clip(androidx.compose.foundation.shape.CircleShape)
                .background(if (selected) Ac else if (model.enabled) Ok else Tx3)
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(model.name, color = if (model.enabled) Tx else Tx3, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(
                listOf(model.provider, model.model).filter(String::isNotBlank).joinToString(" / ").ifBlank { model.id },
                color = Tx3,
                fontSize = 11.sp,
                fontFamily = CodeFont,
            )
        }
        Text(
            when {
                selected -> "主模型"
                !model.enabled -> "已停用"
                else -> "选择"
            },
            color = if (selected) AcLight else Tx3,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
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
