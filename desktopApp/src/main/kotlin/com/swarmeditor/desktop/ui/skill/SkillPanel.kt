package com.swarmeditor.desktop.ui.skill

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
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

/**
 * Skills 独立面板 — 可从右侧 Tab 或设置模态框中使用。
 * 展示 Skills 列表 + 来源标签 + per-Agent 开关。
 */
@Composable
fun SkillPanel(
    skills: List<SkillDto>,
    onScan: () -> Unit,
    onToggleAgent: (String, String, Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        // Header
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Skills", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("扫描", color = Tx2, fontSize = 11.sp, fontFamily = MonoFont,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp)).clickable(onClick = onScan).padding(horizontal = 12.dp, vertical = 5.dp))
        }

        // Skills 列表
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            if (skills.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    Text("暂无 Skills，点击扫描发现", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
                }
            }
            skills.forEach { skill ->
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Surface2)
                        .border(1.dp, Bd, RoundedCornerShape(8.dp)).padding(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(skill.name, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont)
                        Spacer(Modifier.weight(1f))
                        Text(skill.source, color = Tx3, fontSize = 10.sp, fontFamily = MonoFont,
                            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Surface).padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                    if (skill.description.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(skill.description, color = Tx3, fontSize = 11.sp)
                    }
                    if (skill.path.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(skill.path, color = Tx4, fontSize = 10.sp, fontFamily = MonoFont)
                    }
                    Spacer(Modifier.height(8.dp))
                    Row {
                        listOf("claude-code" to "Claude", "qwen-code" to "Qwen", "gemini-cli" to "Gemini", "kimi-code" to "Kimi", "opencode" to "OpenCode").forEach { (id, name) ->
                            val isOn = skill.enabledAgents[id] == true
                            Row(
                                modifier = Modifier.padding(end = 5.dp).clip(RoundedCornerShape(5.dp))
                                    .background(if (isOn) AcD else Surface).border(1.dp, if (isOn) Ac else Bd, RoundedCornerShape(5.dp))
                                    .clickable { onToggleAgent(skill.id, id, !isOn) }.padding(horizontal = 8.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Spacer(Modifier.width(5.dp).height(5.dp).clip(RoundedCornerShape(2.5.dp)).background(if (isOn) Ac else Tx3))
                                Spacer(Modifier.width(4.dp))
                                Text(name, color = if (isOn) Ac else Tx3, fontSize = 10.sp, fontWeight = FontWeight.Medium, fontFamily = MonoFont)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}
