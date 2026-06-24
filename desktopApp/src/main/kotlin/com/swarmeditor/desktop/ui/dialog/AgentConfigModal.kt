package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.X
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*

// 各 Agent 的演示元信息（AgentInfo 未携带，按 id 补全，对齐 old 稿）
private fun descOf(id: String) = when (id) {
    "claude-code" -> "官方 Anthropic 命令行 Agent。擅长代码重构、系统设计与深度分析。"
    "qwen-code" -> "阿里通义千问。中文理解强，适合文档/测试生成。"
    "gemini-cli" -> "Google Gemini 命令行 Agent。多模态能力强。"
    "kimi-code" -> "Moonshot Kimi。超长上下文处理能力。"
    "opencode" -> "OpenCode 开源 Agent。可定制性高。"
    else -> ""
}
private fun cmdOf(id: String) = when (id) {
    "claude-code" -> "claude acp"; "qwen-code" -> "qwen --acp"; "gemini-cli" -> "gemini --acp"
    "kimi-code" -> "kimi acp"; "opencode" -> "opencode acp"; else -> "$id acp"
}
private fun cfgOf(id: String) = when (id) {
    "claude-code" -> "~/.claude/settings.json"; "qwen-code" -> "~/.qwen/settings.json"
    "gemini-cli" -> "~/.gemini/settings.json"; "kimi-code" -> "~/.kimi/config.toml"
    "opencode" -> "~/.config/opencode/opencode.json"; else -> ""
}
private fun modelOf(id: String) = when (id) {
    "claude-code" -> "claude-opus-4"; "qwen-code" -> "qwen-max"; "gemini-cli" -> "gemini-pro"
    "kimi-code" -> "kimi-k2"; "opencode" -> "claude-sonnet-4"; else -> ""
}
private fun statsOf(id: String) = when (id) {
    "claude-code" -> Triple("47", "98%", "24ms")
    "qwen-code" -> Triple("12", "89%", "—")
    else -> Triple("—", "—", "—")
}

@Composable
fun AgentConfigModal(
    agentId: String?,
    agents: List<AgentInfo> = emptyList(),
    onDismiss: () -> Unit
) {
    if (agentId == null) return

    val agent = agents.find { it.id == agentId } ?: remember {
        AgentInfo(agentId, "Agent $agentId", "🤖", AgentClaude, false, "", false, "A")
    }
    val isInstalled = agent.version.isNotEmpty() || agent.isConnected
    val (tasks, success, latency) = statsOf(agentId)

    var cmd by remember { mutableStateOf(cmdOf(agentId)) }
    var configFile by remember { mutableStateOf(cfgOf(agentId)) }
    var apiKey by remember { mutableStateOf("sk-xxxx-xxxx") }
    val baseUrl = "https://api.${agentId.substringBefore("-")}.com"
    val model = modelOf(agentId)
    val desc = descOf(agentId)

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier.fillMaxSize().background(Bg0.copy(alpha = 0.72f)).clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.width(620.dp).shadow(24.dp, RoundedCornerShape(R16), ambientColor = Ac.withAlpha(0.08f), spotColor = Ac.withAlpha(0.12f)).modalEnter().clip(RoundedCornerShape(R16))
                    .background(Brush.linearGradient(listOf(Color(0xFF0f1220), Color(0xFF0a0c14))))
                    .border(1.dp, Line2, RoundedCornerShape(R16))
                    .clickable(enabled = false) {}
                    .padding(20.dp, 24.dp)
            ) {
                // 头部
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(52.dp).clip(RoundedCornerShape(12.dp))
                                .background(Brush.linearGradient(listOf(agent.color, agent.color.withAlpha(0.7f)))),
                            contentAlignment = Alignment.Center
                        ) { Text(agent.letter, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(agent.name, color = Tx, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Text("$cmd · ${agent.version.ifEmpty { "—" }}", color = Tx3, fontSize = 12.sp, fontFamily = CodeFont)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusChip(agent.isConnected, isInstalled)
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
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

                // 安装指引（未安装时）
                if (!isInstalled) {
                    Spacer(Modifier.height(14.dp))
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Warn.withAlpha(0.08f))
                            .border(1.dp, Warn.withAlpha(0.2f), RoundedCornerShape(8.dp)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("💡 安装指南", color = WarnLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(6.dp))
                            Text("npm install -g @anthropic-ai/${agentId}", color = Tx2, fontSize = 12.sp, fontFamily = CodeFont,
                                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Bg0.copy(alpha = 0.4f)).padding(8.dp, 6.dp))
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Brush.linearGradient(listOf(Ac, Ac2))).clickable(onClick = onDismiss).padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                        Text("开始安装", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                } else {
                    // 连接配置
                    Spacer(Modifier.height(16.dp))
                    SectionLabel("连接配置")
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FormField("ACP 命令", cmd, { cmd = it }, Modifier.weight(1f))
                        FormField("配置文件", configFile, { configFile = it }, Modifier.weight(1f))
                    }

                    // 原生配置
                    Spacer(Modifier.height(14.dp))
                    SectionLabel("原生配置")
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FormField("API Key", apiKey, { apiKey = it }, Modifier.weight(1f), isPassword = true)
                        FormField("Base URL", baseUrl, {}, Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(10.dp))
                    ModelSelect("Model", model)

                    // 运行时信息
                    Spacer(Modifier.height(14.dp))
                    SectionLabel("运行时信息")
                    Spacer(Modifier.height(8.dp))
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg2.withAlpha(0.4f))
                            .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        RuntimeStat("任务数", tasks, agent.color, Modifier.weight(1f))
                        RuntimeStat("成功率", success, Tx, Modifier.weight(1f))
                        RuntimeStat("平均延迟", latency, Tx, Modifier.weight(1f))
                    }
                }

                // 底部按钮
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (agent.isConnected) {
                        Text("断开连接", color = ErrLight, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp))
                                .clickable(onClick = onDismiss).padding(horizontal = 14.dp, vertical = 7.dp))
                    } else if (isInstalled) {
                        Text("重新连接", color = Tx2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp))
                                .clickable(onClick = onDismiss).padding(horizontal = 14.dp, vertical = 7.dp))
                    }
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
private fun StatusChip(isConnected: Boolean, isInstalled: Boolean) {
    val (color, label) = when {
        isConnected -> Ok to "已连接"
        isInstalled -> Err to "未连接"
        else -> Warn to "未安装"
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

@Composable
private fun ModelSelect(label: String, value: String) {
    Column {
        Text(label, color = Tx3, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 6.dp))
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg3.withAlpha(0.6f))
                .border(1.dp, Line, RoundedCornerShape(8.dp)).padding(horizontal = 11.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(value, color = Tx, fontSize = 13.sp, fontFamily = CodeFont, modifier = Modifier.weight(1f))
            Icon(imageVector = Feather.ChevronDown, contentDescription = null, tint = Tx3, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun RuntimeStat(label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = valueColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, fontFamily = CodeFont)
        Spacer(Modifier.height(2.dp))
        Text(label, color = Tx3, fontSize = 10.sp)
    }
}
