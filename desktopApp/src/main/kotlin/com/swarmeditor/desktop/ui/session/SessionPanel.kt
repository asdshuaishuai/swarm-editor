package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import com.woowla.compose.icon.collections.feather.feather.Search
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
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.ui.common.IdeContextMenuArea
import com.swarmeditor.desktop.ui.common.IdeContextMenuItem
import com.swarmeditor.desktop.ui.common.IdeListRow
import com.swarmeditor.desktop.ui.common.IdeToolWindowHeader
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
    agents: List<AgentInfo> = emptyList(),
    onRenameSession: (String, String) -> Unit = { _, _ -> },
    onArchiveSession: (String) -> Unit = {},
    onUnarchiveSession: (String) -> Unit = {},
    onDeleteSession: (String) -> Unit = {},
) {
    var searchQuery by remember { mutableStateOf("") }
    var showArchivedOnly by remember { mutableStateOf(false) }
    val allAgents = if (agents.isEmpty()) listOf(selectedAgent) else agents

    Column(modifier = modifier.background(Bg1).border(1.dp, Line)) {
        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            IdeToolWindowHeader(
                title = "会话",
                detail = sessions.count { !it.isArchived }.takeIf { it > 0 }?.toString(),
            ) {
                IdeActionButton(Feather.Plus, "新建会话", onCreateSession)
            }

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
                    .padding(horizontal = 6.dp, vertical = 5.dp)
                    .height(28.dp)
                    .clip(AppShapes.xs)
                    .border(1.dp, searchBorder, AppShapes.xs)
                    .background(searchSurface)
                    .semantics { contentDescription = "搜索会话" }
                    .padding(horizontal = 7.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.weight(1f)) {
                        if (searchQuery.isEmpty()) {
                            Text("搜索会话", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
                        }
                        BasicTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = SansFont),
                            cursorBrush = SolidColor(ControlBlue),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().onFocusChanged { searchFocused = it.isFocused },
                        )
                    }
                }
            }

            // Session list
            val filtered = if (searchQuery.isBlank()) sessions
                else sessions.filter { it.title.contains(searchQuery, ignoreCase = true) }
            val activeSessions = filtered.filterNot { it.isArchived }
            val archivedSessions = filtered.filter { it.isArchived }
            val archivedCount = archivedSessions.size
            SessionFilterToggle(
                showArchivedOnly = showArchivedOnly,
                activeCount = activeSessions.size,
                archivedCount = archivedCount,
                onToggle = { showArchivedOnly = !showArchivedOnly },
            )
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 3.dp, vertical = 2.dp),
            ) {
                if (filtered.isEmpty() || (showArchivedOnly && archivedSessions.isEmpty()) || (!showArchivedOnly && activeSessions.isEmpty())) {
                    item(key = "empty") {
                        Text(
                            when {
                                filtered.isEmpty() && searchQuery.isNotBlank() -> "无匹配结果"
                                showArchivedOnly -> "暂无已归档会话"
                                else -> "暂无会话"
                            },
                            color = Tx3, fontSize = 11.sp, fontFamily = SansFont,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                } else if (showArchivedOnly) {
                    items(archivedSessions, key = UiSession::id) { session ->
                        SessionCard(
                            session = session,
                            isActive = session.id == currentSessionId,
                            agents = allAgents,
                            onSelect = { onSelectSession(session.id) },
                            onRename = { title -> onRenameSession(session.id, title) },
                            onArchive = { onArchiveSession(session.id) },
                            onUnarchive = { onUnarchiveSession(session.id) },
                            onDelete = { onDeleteSession(session.id) },
                        )
                    }
                } else {
                    groupByDate(activeSessions).forEach { group ->
                        item(key = "group-${group.label}") {
                            Text(
                                group.label,
                                color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                                fontFamily = SansFont, letterSpacing = 0.6.sp,
                                modifier = Modifier.padding(start = 9.dp, top = 8.dp, bottom = 3.dp)
                            )
                        }
                        items(group.sessions, key = UiSession::id) { session ->
                            SessionCard(
                                session = session,
                                isActive = session.id == currentSessionId,
                                agents = allAgents,
                                onSelect = { onSelectSession(session.id) },
                                onRename = { title -> onRenameSession(session.id, title) },
                                onArchive = { onArchiveSession(session.id) },
                                onDelete = { onDeleteSession(session.id) },
                            )
                        }
                    }
                    if (archivedSessions.isNotEmpty()) {
                        item(key = "archived-header") {
                            Text(
                                "已归档 · ${archivedSessions.size}",
                                color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                                fontFamily = SansFont, letterSpacing = 0.6.sp,
                                modifier = Modifier.padding(start = 9.dp, top = 10.dp, bottom = 3.dp)
                            )
                        }
                        items(archivedSessions, key = UiSession::id) { session ->
                            SessionCard(
                                session = session,
                                isActive = session.id == currentSessionId,
                                agents = allAgents,
                                onSelect = { onSelectSession(session.id) },
                                onRename = { title -> onRenameSession(session.id, title) },
                                onArchive = { onArchiveSession(session.id) },
                                onUnarchive = { onUnarchiveSession(session.id) },
                                onDelete = { onDeleteSession(session.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SessionFilterToggle(
    showArchivedOnly: Boolean,
    activeCount: Int,
    archivedCount: Int,
    onToggle: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val options = listOf(
            "活动" to !showArchivedOnly,
            "已归档" to showArchivedOnly,
        )
        options.forEach { (label, selected) ->
            Text(
                text = if (label == "活动") "$label $activeCount" else "$label $archivedCount",
                color = if (selected) ControlBlue else Tx3,
                style = AppType.micro.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                modifier = Modifier
                    .clip(AppShapes.xs)
                    .background(if (selected) ControlBlue.withAlpha(0.12f) else Bg3.copy(alpha = 0.5f))
                    .padding(horizontal = 7.dp, vertical = 3.dp)
                    .clickable { if (!selected) onToggle() },
            )
        }
    }
}

@Composable
private fun SessionCard(
    session: UiSession,
    isActive: Boolean,
    agents: List<AgentInfo>,
    onSelect: () -> Unit,
    onRename: (String) -> Unit = {},
    onArchive: () -> Unit = {},
    onUnarchive: () -> Unit = {},
    onDelete: () -> Unit = {},
) {
    val agent = agents.find { it.id == session.agentId }
    val agentName = agent?.name ?: session.agentId
    var renaming by remember { mutableStateOf(false) }
    var draftTitle by remember { mutableStateOf(session.title) }
    var confirmDelete by remember { mutableStateOf(false) }

    IdeContextMenuArea(
        items = {
            if (confirmDelete) {
                buildList {
                    add(IdeContextMenuItem("确认删除此会话？") { onDelete() })
                    add(IdeContextMenuItem("取消") { confirmDelete = false })
                }
            } else {
                buildList {
                    add(IdeContextMenuItem("重命名") { renaming = true; draftTitle = session.title })
                    if (session.isArchived) {
                        add(IdeContextMenuItem("恢复") { onUnarchive() })
                    } else {
                        add(IdeContextMenuItem("归档") { onArchive() })
                    }
                    add(IdeContextMenuItem("删除") { confirmDelete = true })
                }
            }
        },
        modifier = Modifier.fillMaxWidth(),
    ) {
        IdeListRow(
            onClick = onSelect,
            selected = isActive,
            rowHeight = 38.dp,
            modifier = Modifier.semantics { role = Role.Button; contentDescription = "会话：${session.title}" },
            leading = {
                Box(Modifier.width(2.dp).height(26.dp).background(if (isActive) ControlBlue else Color.Transparent))
                Spacer(Modifier.width(6.dp))
                Icon(Feather.Code, null, tint = if (isActive) Tx2 else Tx3, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(7.dp))
            },
            content = {
                if (renaming) {
                    BasicTextField(
                        value = draftTitle,
                        onValueChange = { draftTitle = it },
                        singleLine = true,
                        textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold),
                        cursorBrush = SolidColor(ControlBlue),
                        modifier = Modifier
                            .weight(1f)
                            .onFocusChanged { state ->
                                if (!state.isFocused) {
                                    renaming = false
                                    val trimmed = draftTitle.trim()
                                    if (trimmed.isNotEmpty() && trimmed != session.title) onRename(trimmed)
                                }
                            },
                    )
                } else {
                    Column(Modifier.weight(1f)) {
                        Text(session.title, color = if (isActive) Tx else Tx2, fontSize = 12.sp, fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
                        Text("$agentName · ${relativeTime(session.createdAt)}", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, maxLines = 1)
                    }
                }
            },
            trailing = {
                Box(Modifier.size(6.dp).clip(CircleShape).background(if (agent?.isConnected == true) OkLight else Tx3))
                Spacer(Modifier.width(3.dp))
            },
        )
    }
}
