package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Plus
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.Code
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
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

    Column(modifier = modifier.background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        // Top: Sessions
        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 12.dp, 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("会话", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                val createInteraction = remember { MutableInteractionSource() }
                val createFocused by createInteraction.collectIsFocusedAsState()
                val createHovered by createInteraction.collectIsHoveredAsState()
                val createBackground by androidx.compose.animation.animateColorAsState(
                    when {
                        createFocused -> ControlBlue.withAlpha(0.16f)
                        createHovered -> ControlBlue.withAlpha(0.1f)
                        else -> Color.Transparent
                    },
                    Motion.colorDefault,
                    label = "createSessionBackground",
                )
                val createTint by androidx.compose.animation.animateColorAsState(
                    if (createFocused || createHovered) ControlBlue else Tx3,
                    Motion.colorDefault,
                    label = "createSessionTint",
                )
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(AppShapes.xs)
                        .background(createBackground)
                        .border(if (createFocused) 1.dp else 0.dp, if (createFocused) ControlBlue.withAlpha(0.72f) else Color.Transparent, AppShapes.xs)
                        .semantics {
                            role = Role.Button
                            contentDescription = "新建会话"
                        }
                        .fluidClickable(interactionSource = createInteraction, onClick = onCreateSession),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Feather.Plus,
                        contentDescription = null,
                        tint = createTint,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Search box
            var searchFocused by remember { mutableStateOf(false) }
            val searchBorder by androidx.compose.animation.animateColorAsState(
                if (searchFocused) ControlBlue.withAlpha(0.7f) else Line,
                Motion.colorDefault,
                label = "sessionSearchBorder",
            )
            val searchSurface by androidx.compose.animation.animateColorAsState(
                if (searchFocused) ControlBlue.withAlpha(0.065f) else Bg3.copy(alpha = 0.5f),
                Motion.colorDefault,
                label = "sessionSearchSurface",
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                    .border(1.dp, searchBorder, AppShapes.sm)
                    .background(searchSurface)
                    .semantics { contentDescription = "搜索会话" }
                    .padding(horizontal = 9.dp, vertical = 6.dp)
            ) {
                if (searchQuery.isEmpty()) {
                    Text("搜索会话…", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
                }
                BasicTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = SansFont),
                    cursorBrush = SolidColor(ControlBlue),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { searchFocused = it.isFocused }
                )
            }

            // Session list
            val filtered = if (searchQuery.isBlank()) sessions
                else sessions.filter { it.title.contains(searchQuery, ignoreCase = true) }
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (filtered.isEmpty()) {
                    item(key = "empty") {
                        Text(
                            if (searchQuery.isNotBlank()) "无匹配结果" else "暂无会话",
                            color = Tx3, fontSize = 11.sp, fontFamily = SansFont,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                } else {
                    groupByDate(filtered).forEach { group ->
                        item(key = "group-${group.label}") {
                            Text(
                                group.label,
                                color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                                fontFamily = SansFont, letterSpacing = 0.6.sp,
                                modifier = Modifier.padding(start = 10.dp, top = 8.dp, bottom = 2.dp)
                            )
                        }
                        items(group.sessions, key = UiSession::id) { session ->
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
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    val isFocused by interactionSource.collectIsFocusedAsState()
    val background by androidx.compose.animation.animateColorAsState(
        targetValue = when {
            isActive -> Ac.withAlpha(0.08f)
            isHovered -> Bg3.copy(alpha = 0.6f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "sessionCardBackground"
    )
    val borderColor by androidx.compose.animation.animateColorAsState(
        targetValue = when {
            isFocused -> AcLight
            isActive -> Ac.withAlpha(0.2f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "sessionCardBorder"
    )
    val indicatorColor by androidx.compose.animation.animateColorAsState(
        if (isActive) ControlBlue else Color.Transparent,
        Motion.colorDefault,
        label = "sessionCardIndicator",
    )

    Box(
        modifier = Modifier.fillMaxWidth().clip(AppShapes.md).background(background)
            .border(1.dp, borderColor, AppShapes.md)
            .semantics { role = Role.Button; selected = isActive; contentDescription = "会话：${session.title}" }
            .fluidClickable(interactionSource = interactionSource, onClick = onSelect)
            .padding(horizontal = Spacing.md, vertical = 8.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(32.dp)
                    .clip(AppShapes.pill)
                    .background(indicatorColor)
            )
            Spacer(Modifier.width(Spacing.sm))
            Box(modifier = Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(28.dp).clip(AppShapes.sm).background(agentColor.withAlpha(0.16f)), contentAlignment = Alignment.Center) {
                    Text(agentLetter, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = agentColor)
                }
                Box(Modifier.align(Alignment.BottomEnd).offset(x = 2.dp, y = 2.dp).size(9.dp).clip(CircleShape)
                    .background(if (agent?.isConnected == true) OkLight else ErrLight).border(2.dp, Bg1, CircleShape))
            }
            Spacer(Modifier.width(Spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(session.title, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                Spacer(Modifier.height(3.dp))
                Text("$agentName · ${relativeTime(session.createdAt)}", color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
            }
        }
    }
}
