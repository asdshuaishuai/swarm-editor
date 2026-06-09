package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.UiSession

@Composable
fun SessionPanel(
    selectedAgent: AgentInfo,
    sessions: List<UiSession>,
    currentSessionId: String?,
    onSelectSession: (String) -> Unit,
    onCreateSession: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.background(Bg2)) {
        // 上半部：会话
        Column(modifier = Modifier.weight(1f).fillMaxWidth().border(1.dp, Bd)) {
            Row(modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("会话", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Box(modifier = Modifier.size(26.dp).clip(RoundedCornerShape(5.dp)).clickable(onClick = onCreateSession), contentAlignment = Alignment.Center) {
                    Text("＋", color = Tx3, fontSize = 15.sp)
                }
            }

            Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).border(1.dp, Bd, RoundedCornerShape(8.dp)).background(Surface2).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text("搜索会话...", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
            }

            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)) {
                if (sessions.isEmpty()) {
                    Text("暂无会话", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont, modifier = Modifier.padding(12.dp))
                } else {
                    Text("会话列表", color = Tx3, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.7.sp, modifier = Modifier.padding(10.dp, 10.dp, 10.dp, 4.dp))
                    sessions.forEach { session ->
                        val isActive = session.id == currentSessionId
                        val bg = if (isActive) Surface else Color.Transparent
                        Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(bg).clickable { onSelectSession(session.id) }.padding(horizontal = 12.dp, vertical = 10.dp)) {
                            Text(session.title, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                            Spacer(Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(modifier = Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(selectedAgent.color.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                                    Text(selectedAgent.emoji, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                                }
                                Spacer(Modifier.width(6.dp))
                                Text(selectedAgent.name, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                            }
                        }
                    }
                }
            }
        }

        // 下半部：项目
        Column(modifier = Modifier.fillMaxWidth().border(1.dp, Bd).padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("项目", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Box(modifier = Modifier.size(26.dp).clip(RoundedCornerShape(5.dp)), contentAlignment = Alignment.Center) { Text("📂", color = Tx3, fontSize = 15.sp) }
            }
            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Surface2).border(1.dp, Bd, RoundedCornerShape(8.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("📁", fontSize = 18.sp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("swarm-editor", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("~/code/swarm-editor", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row {
                Row(modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(Surface).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("●", color = Gn, fontSize = 11.sp, fontFamily = MonoFont); Spacer(Modifier.width(5.dp)); Text("main", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
                Spacer(Modifier.width(5.dp))
                Row(modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(Surface).border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("⇄", color = Ac, fontSize = 11.sp, fontFamily = MonoFont); Spacer(Modifier.width(5.dp)); Text("0 worktrees", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
            }
        }
    }
}
