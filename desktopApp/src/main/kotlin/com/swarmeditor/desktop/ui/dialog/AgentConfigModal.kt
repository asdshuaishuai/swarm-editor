package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.IdeDialogShell
import com.swarmeditor.common.model.ModelConfig

private const val PRIMARY_AGENT_DESCRIPTION =
    "编辑器内置主智能体。它负责规划任务，并从独立模型池按需创建临时子智能体。"

@Composable
fun AgentConfigModal(
    agentId: String?,
    agents: List<AgentInfo> = emptyList(),
    models: List<ModelConfig> = emptyList(),
    primaryModelId: String = "",
    configPath: String = "",
    onSave: (String) -> Unit = {},
    onConnect: (String) -> Unit = {},
    onDisconnect: (String) -> Unit = {},
    onDismiss: () -> Unit
) {
    if (agentId == null) return

    val agent = agents.find { it.id == agentId } ?: return
    val isInstalled = agent.version.isNotEmpty() || agent.isConnected
    var selectedModelId by remember(agentId) { mutableStateOf(primaryModelId) }
    LaunchedEffect(agentId, primaryModelId) {
        selectedModelId = primaryModelId
    }

    IdeDialogShell(
        title = "主智能体",
        detail = "Pi Runtime · ${agent.version.ifEmpty { "就绪" }}",
        onClose = onDismiss,
        maxWidth = 760.dp,
        heightFraction = 0.78f,
        footer = {
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
                "保存主模型",
                active = selectedModelId.isNotBlank(),
                onClick = {
                    onSave(selectedModelId)
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
                    Text(agent.name, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(PRIMARY_AGENT_DESCRIPTION, color = Tx3, fontSize = 12.sp, lineHeight = 17.sp)
                }
                StatusChip(agent.isConnected, isInstalled)
            }

            if (!isInstalled) {
                Spacer(Modifier.height(12.dp))
                Text("执行环境尚不可用，请重新构建内置 Pi Runtime 后再连接。", color = WarnLight, fontSize = 12.sp)
            }

            Spacer(Modifier.height(18.dp))
            SectionLabel("运行时")
            Spacer(Modifier.height(7.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("配置文件", color = Tx3, fontSize = 12.sp, modifier = Modifier.width(88.dp))
                Text(
                    configPath.ifEmpty { "保存后写入主智能体配置" },
                    color = if (configPath.isEmpty()) Tx3 else Tx2,
                    fontSize = 11.sp,
                    fontFamily = CodeFont,
                    modifier = Modifier.weight(1f).height(30.dp).clip(AppShapes.xs).background(Bg2)
                        .border(1.dp, Line, AppShapes.xs).padding(horizontal = 8.dp, vertical = 7.dp),
                )
            }

            Spacer(Modifier.height(18.dp))
            SectionLabel("主模型")
            Spacer(Modifier.height(6.dp))
            Text("这里只指定主模型；子智能体按职责、模型能力与并发余量动态创建。", color = Tx3, fontSize = 12.sp)
            Spacer(Modifier.height(8.dp))
            if (primaryModelId.isBlank()) {
                InlineLoadingState(
                    text = "正在加载模型池…",
                    modifier = Modifier.fillMaxWidth(),
                    minHeight = 44.dp,
                )
            } else if (models.isEmpty()) {
                Text("模型池为空，请先在设置中心添加模型。", color = WarnLight, fontSize = 12.sp)
            } else {
                models.forEach { model ->
                    ModalPrimaryModelOption(
                        model = model,
                        selected = model.id == selectedModelId,
                        onSelect = { selectedModelId = model.id },
                    )
                }
                Spacer(Modifier.height(3.dp))
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
            .height(42.dp)
            .clip(AppShapes.xs)
            .background(if (selected) Ac.withAlpha(0.2f) else Color.Transparent)
            .clickable(enabled = model.enabled && !selected, onClick = onSelect)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(9.dp).clip(androidx.compose.foundation.shape.CircleShape)
                .background(if (selected) Ac else if (model.enabled) Ok else Tx3)
        )
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(model.name, color = if (model.enabled) Tx else Tx3, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text(
                listOf(model.provider, model.model).filter(String::isNotBlank).joinToString(" / ").ifBlank { model.id },
                color = Tx3,
                fontSize = 10.sp,
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
