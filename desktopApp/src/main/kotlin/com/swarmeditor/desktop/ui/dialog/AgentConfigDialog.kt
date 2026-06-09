package com.swarmeditor.desktop.ui.dialog

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.swarmeditor.desktop.theme.*

private data class AgentPreset(
    val id: String, val name: String, val emoji: String, val color: Color,
    val acpCommand: String, val configPath: String, val version: String
)

private val AGENT_PRESETS = mapOf(
    "claude-code" to AgentPreset("claude-code", "Claude Code", "🟣", Pr, "claude acp", "~/.claude/settings.json", "1.0.0"),
    "qwen-code" to AgentPreset("qwen-code", "QwenCode", "🔵", Ac, "qwen --acp", "~/.qwen/settings.json", ""),
    "gemini-cli" to AgentPreset("gemini-cli", "Gemini CLI", "🟢", Gn, "gemini --acp", "~/.gemini/settings.json", ""),
    "kimi-code" to AgentPreset("kimi-code", "Kimi Code", "🟡", Gd, "kimi acp", "~/.kimi/config.toml", ""),
    "opencode" to AgentPreset("opencode", "OpenCode", "🟠", Or, "opencode acp", "~/.config/opencode/opencode.json", "")
)

@Composable
fun AgentConfigDialog(agentId: String?, onDismiss: () -> Unit) {
    val preset = AGENT_PRESETS[agentId] ?: AGENT_PRESETS.values.first()
    var acpCommand by remember { mutableStateOf(preset.acpCommand) }
    var configPath by remember { mutableStateOf(preset.configPath) }
    var apiKey by remember { mutableStateOf("") }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
        Column(modifier = Modifier.width(480.dp).clip(RoundedCornerShape(12.dp)).background(Bg2).border(1.dp, Bd2, RoundedCornerShape(12.dp)).clickable(enabled = false) {}) {
            Row(modifier = Modifier.fillMaxWidth().background(Bg).padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(32.dp).clip(CircleShape).background(preset.color.copy(alpha = 0.15f)).border(1.dp, preset.color.copy(alpha = 0.4f), CircleShape), contentAlignment = Alignment.Center) {
                    Text(preset.emoji, fontSize = 14.sp)
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(preset.name, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
                        if (preset.version.isNotEmpty()) {
                            Spacer(Modifier.width(6.dp))
                            Text("v${preset.version}", color = Tx3, fontSize = 9.sp, fontFamily = MonoFont,
                                modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(Bg3).padding(horizontal = 5.dp, vertical = 1.dp))
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Text("未连接", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Bd2, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 3.dp))
                Spacer(Modifier.width(8.dp))
                Box(modifier = Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Text("✕", color = Tx3, fontSize = 14.sp)
                }
            }

            Column(modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp)) {
                ConfigFieldRow("ACP 命令", acpCommand) { acpCommand = it }
                Spacer(Modifier.height(12.dp))
                ConfigFieldRow("配置文件", configPath) { configPath = it }
                Spacer(Modifier.height(12.dp))
                ConfigFieldRow("API Key", if (apiKey.isNotEmpty()) "••••••••" else "", placeholder = "sk-...") { apiKey = it }
            }

            Row(modifier = Modifier.fillMaxWidth().background(Bg).border(1.dp, Bd).padding(12.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                Text("取消", color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp)).clickable(onClick = onDismiss).padding(horizontal = 16.dp, vertical = 7.dp))
                Spacer(Modifier.width(8.dp))
                Text("保存", color = Bg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ac).clickable(onClick = onDismiss).padding(horizontal = 16.dp, vertical = 7.dp))
            }
        }
    }
}

@Composable
private fun ConfigFieldRow(label: String, value: String, placeholder: String = "未配置", onChange: (String) -> Unit) {
    Column {
        Text(label, color = Tx3, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont)
        Spacer(Modifier.height(6.dp))
        Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Bg).border(1.dp, Bd2, RoundedCornerShape(6.dp)).clickable { /* TODO: inline edit */ }.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Text(value.ifEmpty { placeholder }, color = if (value.isEmpty()) Tx4 else Tx, fontSize = 12.sp, fontFamily = MonoFont)
        }
    }
}
