package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.MergeType
import androidx.compose.material.icons.filled.Source
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
        diff < 3_600_000L -> "${diff / 60_000L} 分钟前"
        diff < 86_400_000L -> "${diff / 3_600_000L} 小时前"
        diff < 172_800_000L -> "昨天"
        diff < 604_800_000L -> "${diff / 86_400_000L} 天前"
        else -> "${diff / 604_800_000L} 周前"
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

    Column(modifier = modifier.width(260.dp).background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        // Top: Sessions
        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("会话", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier.size(26.dp).clip(RoundedCornerShape(6.dp))
                        .clickable(onClick = onCreateSession),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = "New",
                        tint = Tx3,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Search box
            Box(
                modifier = Modifier.fillMaxWidth().padding(6.dp)
                    .border(1.dp, Line, RoundedCornerShape(8.dp))
                    .background(Bg3.copy(alpha = 0.5f))
                    .padding(horizontal = 9.dp, vertical = 6.dp)
            ) {
                if (searchQuery.isEmpty()) {
                    Text("搜索会话…", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
                }
                BasicTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = SansFont),
                    cursorBrush = SolidColor(Ac),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Session list
            Column(
                modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)
            ) {
                val filtered = if (searchQuery.isBlank()) sessions
                    else sessions.filter { it.title.contains(searchQuery, ignoreCase = true) }

                if (filtered.isEmpty()) {
                    Text(
                        if (searchQuery.isNotBlank()) "无匹配结果" else "暂无会话",
                        color = Tx3, fontSize = 11.sp, fontFamily = SansFont,
                        modifier = Modifier.padding(12.dp)
                    )
                } else {
                    val groups = groupByDate(filtered)
                    groups.forEach { group ->
                        Text(
                            group.label,
                            color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                            fontFamily = SansFont, letterSpacing = 0.6.sp,
                            modifier = Modifier.padding(8.dp, 10.dp, 10.dp, 4.dp)
                        )
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
    val agentLetter = agent?.letter ?: "?"
    val agentColor = agent?.color ?: Tx3
    val bg = if (isActive) Ac.withAlpha(0.08f) else Color.Transparent
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    val hoverBg = if (isHovered && !isActive) Bg3.copy(alpha = 0.6f) else Color.Transparent

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(hoverBg)
            .then(
                if (isActive) Modifier.border(1.dp, Ac.withAlpha(0.2f), RoundedCornerShape(8.dp))
                    .background(Ac.withAlpha(0.08f))
                else Modifier
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onSelect
            )
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            // Agent avatar with status dot
            Box(
                modifier = Modifier.size(26.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(agentColor.withAlpha(0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(agentLetter, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
                // Status dot (bottom-right, 9px, border 2px Bg1)
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 2.dp, y = 2.dp)
                        .size(9.dp)
                        .clip(CircleShape)
                        .background(if (agent?.isConnected == true) OkLight else ErrLight)
                        .border(2.dp, Bg1, CircleShape)
                )
            }
            Spacer(Modifier.width(10.dp))
            // Content
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        session.title,
                        color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        modifier = Modifier.weight(1f)
                    )
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    "$agentName · ${relativeTime(session.createdAt)}",
                    color = Tx3, fontSize = 11.sp, fontFamily = SansFont
                )
            }
        }

        // Hover actions: delete + archive
        if (isHovered || isActive) {
            Row(
                modifier = Modifier.align(Alignment.CenterEnd).padding(start = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier.size(22.dp).clip(RoundedCornerShape(4.dp))
                        .background(Bg1.copy(alpha = 0.95f))
                        .border(1.dp, Line, RoundedCornerShape(4.dp))
                        .clickable { /* TODO: delete session */ },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = "Delete",
                        tint = Tx3,
                        modifier = Modifier.size(12.dp)
                    )
                }
                Spacer(Modifier.width(2.dp))
                Box(
                    modifier = Modifier.size(22.dp).clip(RoundedCornerShape(4.dp))
                        .background(Bg1.copy(alpha = 0.95f))
                        .border(1.dp, Line, RoundedCornerShape(4.dp))
                        .clickable { /* TODO: archive session */ },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Archive,
                        contentDescription = "Archive",
                        tint = Tx3,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
        }
    }
}
