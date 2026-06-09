package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.UiSession
import java.time.LocalDate
import java.time.ZoneId

private data class DateGroup(val label: String, val sessions: List<UiSession>)

private fun groupByDate(sessions: List<UiSession>): List<DateGroup> {
    val today = LocalDate.now()
    val yesterday = today.minusDays(1)
    val weekStart = today.minusDays(today.dayOfWeek.value.toLong() - 1)

    val todaySessions = mutableListOf<UiSession>()
    val yesterdaySessions = mutableListOf<UiSession>()
    val weekSessions = mutableListOf<UiSession>()
    val olderSessions = mutableListOf<UiSession>()

    for (s in sessions) {
        val date = LocalDate.ofInstant(
            java.time.Instant.ofEpochMilli(s.createdAt),
            ZoneId.systemDefault()
        )
        when {
            date == today -> todaySessions += s
            date == yesterday -> yesterdaySessions += s
            date >= weekStart -> weekSessions += s
            else -> olderSessions += s
        }
    }

    return buildList {
        if (todaySessions.isNotEmpty()) add(DateGroup("今天", todaySessions))
        if (yesterdaySessions.isNotEmpty()) add(DateGroup("昨天", yesterdaySessions))
        if (weekSessions.isNotEmpty()) add(DateGroup("本周", weekSessions))
        if (olderSessions.isNotEmpty()) add(DateGroup("更早", olderSessions))
    }
}

private fun relativeTime(createdAt: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - createdAt
    return when {
        diff < 60_000L -> "刚刚"
        diff < 3_600_000L -> "${diff / 60_000L}分钟前"
        diff < 86_400_000L -> "${diff / 3_600_000L}小时前"
        diff < 172_800_000L -> "昨天"
        diff < 604_800_000L -> "${diff / 86_400_000L}天前"
        else -> "${diff / 604_800_000L}周前"
    }
}

@Composable
fun SessionPanel(
    selectedAgent: AgentInfo,
    sessions: List<UiSession>,
    currentSessionId: String?,
    onSelectSession: (String) -> Unit,
    onCreateSession: () -> Unit,
    modifier: Modifier = Modifier,
    agents: List<AgentInfo> = emptyList()
) {
    var searchQuery by remember { mutableStateOf("") }
    val allAgents = if (agents.isEmpty()) listOf(selectedAgent) else agents

    Column(modifier = modifier.width(260.dp).background(Glass).border(1.dp, Bd)) {
        // 上半部：会话
        Column(modifier = Modifier.weight(1f).fillMaxWidth().border(1.dp, Bd)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("会话", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier.size(26.dp).clip(RoundedCornerShape(5.dp))
                        .clickable(onClick = onCreateSession),
                    contentAlignment = Alignment.Center
                ) {
                    Text("＋", color = Tx3, fontSize = 15.sp)
                }
            }

            // Search box — functional BasicTextField
            Box(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                    .border(1.dp, Bd, RoundedCornerShape(8.dp)).background(Surface2)
                    .padding(horizontal = 10.dp, vertical = 7.dp)
            ) {
                if (searchQuery.isEmpty()) {
                    Text("搜索会话...", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
                }
                BasicTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = MonoFont),
                    cursorBrush = SolidColor(Ac),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Session list with date grouping
            Column(
                modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)
            ) {
                val filtered = if (searchQuery.isBlank()) sessions
                    else sessions.filter { it.title.contains(searchQuery, ignoreCase = true) }

                if (filtered.isEmpty()) {
                    Text(
                        if (searchQuery.isNotBlank()) "无匹配会话" else "暂无会话",
                        color = Tx3, fontSize = 11.sp, fontFamily = MonoFont,
                        modifier = Modifier.padding(12.dp)
                    )
                } else {
                    val groups = groupByDate(filtered)
                    groups.forEach { group ->
                        // Date group label
                        Text(
                            group.label.uppercase(),
                            color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                            fontFamily = MonoFont, letterSpacing = 0.8.sp,
                            modifier = Modifier.padding(10.dp, 10.dp, 10.dp, 4.dp)
                        )
                        // Sessions in this group
                        group.sessions.forEach { session ->
                            SessionCard(
                                session = session,
                                isActive = session.id == currentSessionId,
                                agents = allAgents,
                                onSelect = { onSelectSession(session.id) }
                            )
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
                Box(modifier = Modifier.size(26.dp).clip(RoundedCornerShape(5.dp)), contentAlignment = Alignment.Center) {
                    Text("📂", color = Tx3, fontSize = 15.sp)
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Surface2)
                    .border(1.dp, Bd, RoundedCornerShape(8.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("📁", fontSize = 18.sp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("swarm-editor", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("~/code/swarm-editor", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row {
                Row(
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(Surface)
                        .border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("●", color = Gn, fontSize = 11.sp, fontFamily = MonoFont)
                    Spacer(Modifier.width(5.dp))
                    Text("main", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
                Spacer(Modifier.width(5.dp))
                Row(
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(6.dp)).background(Surface)
                        .border(1.dp, Bd, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("⇄", color = Ac, fontSize = 11.sp, fontFamily = MonoFont)
                    Spacer(Modifier.width(5.dp))
                    Text("0 worktrees", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
                }
            }
        }
    }
}

@Composable
private fun SessionCard(
    session: UiSession,
    isActive: Boolean,
    agents: List<AgentInfo>,
    onSelect: () -> Unit
) {
    val agent = agents.find { it.id == session.agentId }
    val agentName = agent?.name ?: session.agentId
    val agentEmoji = agent?.emoji ?: "⚪"
    val agentColor = agent?.color ?: Tx3
    val bg = if (isActive) Surface else Color.Transparent
    var hovered by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(bg)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onSelect
            )
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            // Agent avatar: 18dp circle
            Box(
                modifier = Modifier.size(18.dp).clip(CircleShape)
                    .background(agentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Text(agentEmoji, fontSize = 8.sp)
            }
            Spacer(Modifier.width(8.dp))
            // Content
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        session.title,
                        color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        modifier = Modifier.weight(1f)
                    )
                    // Task count badge
                    if (session.messageCount > 0) {
                        Box(
                            modifier = Modifier.size(16.dp).clip(CircleShape).background(Ac.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (session.messageCount < 10) "${session.messageCount}" else "9+",
                                color = Ac, fontSize = 8.sp, fontWeight = FontWeight.Bold,
                                fontFamily = MonoFont
                            )
                        }
                    }
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    "$agentName · ${relativeTime(session.createdAt)}",
                    color = Tx3, fontSize = 10.sp, fontFamily = MonoFont
                )
            }
        }

        // Hover actions: delete + archive
        if (hovered || isActive) {
            Row(
                modifier = Modifier.align(Alignment.CenterEnd).padding(start = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier.size(22.dp).clip(RoundedCornerShape(4.dp))
                        .clickable { /* TODO: delete session */ },
                    contentAlignment = Alignment.Center
                ) {
                    Text("🗑", fontSize = 10.sp)
                }
                Spacer(Modifier.width(2.dp))
                Box(
                    modifier = Modifier.size(22.dp).clip(RoundedCornerShape(4.dp))
                        .clickable { /* TODO: archive session */ },
                    contentAlignment = Alignment.Center
                ) {
                    Text("📦", fontSize = 10.sp)
                }
            }
        }
    }
}
