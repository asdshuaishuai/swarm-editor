package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.Session
import com.swarmeditor.desktop.PRIMARY_AGENT_ID
import com.swarmeditor.desktop.agentDisplayName
import com.swarmeditor.desktop.theme.*

@Composable
fun ActivityLogView(
    sessions: List<Session>,
    activities: List<ActivityEvent>,
    modifier: Modifier = Modifier
) {
    var selectedSession by remember { mutableStateOf<ArchiveSessionItem?>(null) }
    var filter by remember { mutableStateOf("全部") }

    val archiveYears = remember(sessions) {
        buildArchiveTree(sessions)
    }

    // 默认选中最近一个会话，使时间线有内容
    LaunchedEffect(archiveYears) {
        val selectedStillExists = selectedSession?.let { selected ->
            sessions.any { it.id == selected.id }
        } == true
        if (!selectedStillExists) {
            selectedSession = archiveYears.firstOrNull()
                ?.months?.firstOrNull()?.days?.firstOrNull()?.sessions?.firstOrNull()
        }
    }

    val timelineEvents = remember(selectedSession, activities) {
        val sessionId = selectedSession?.id
        activities.asSequence()
            .filter { it.sessionId == sessionId }
            .map(ActivityEvent::toTimelineEvent)
            .toList()
    }

    // Stats from selected session
    val stats = selectedSession?.let { sel ->
        val session = sessions.find { it.id == sel.id }
        session?.let {
            SessionStats(
                duration = calcDuration(it.createdAt.toString(), it.updatedAt.toString()),
                eventCount = timelineEvents.size,
                tokenCount = "—",
                agentName = agentDisplayName(it.agentId)
            )
        }
    }

    Column(modifier = modifier.fillMaxSize().background(Bg2)) {
        // Top bar
        ActivityTopBar(
            filter = filter,
            onFilterChange = { filter = it }
        )

        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(12.dp)) {
            val wideLayout = maxWidth >= 780.dp
            if (wideLayout) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ArchivePanel(
                        years = archiveYears,
                        selectedSessionId = selectedSession?.id,
                        onSelectSession = { selectedSession = it },
                        modifier = Modifier.width(244.dp).fillMaxHeight(),
                    )
                    TimelinePanel(
                        selectedSession = selectedSession,
                        events = timelineEvents,
                        stats = stats,
                        filter = filter,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ArchivePanel(
                        years = archiveYears,
                        selectedSessionId = selectedSession?.id,
                        onSelectSession = { selectedSession = it },
                        modifier = Modifier.fillMaxWidth().height(220.dp),
                    )
                    TimelinePanel(
                        selectedSession = selectedSession,
                        events = timelineEvents,
                        stats = stats,
                        filter = filter,
                        modifier = Modifier.fillMaxWidth().weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun ArchivePanel(
    years: List<ArchiveYearNode>,
    selectedSessionId: String?,
    onSelectSession: (ArchiveSessionItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.surfaceCard(bg = Bg1, elevation = Elevation.none)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text("会话归档", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("按日期定位历史执行记录", color = Tx3, fontSize = 10.sp)
        }
        if (years.isNotEmpty()) {
            ArchiveTree(
                years = years,
                selectedSessionId = selectedSessionId,
                onSelectSession = onSelectSession,
                modifier = Modifier.fillMaxSize().padding(8.dp),
            )
        } else {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("暂无历史记录", color = Tx3, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun TimelinePanel(
    selectedSession: ArchiveSessionItem?,
    events: List<TimelineEvent>,
    stats: SessionStats?,
    filter: String,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.surfaceCard(bg = Bg1, elevation = Elevation.none)) {
        if (selectedSession != null) {
            EventTimeline(
                events = events,
                stats = stats,
                filter = filter,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("选择会话以查看事件时间线", color = Tx3, fontSize = 13.sp)
            }
        }
    }
}

private fun ActivityEvent.toTimelineEvent() = TimelineEvent(
    id = id,
    type = when (type) {
        ActivityType.MCP -> "mcp"
        ActivityType.FILE -> "file"
        ActivityType.COMMAND -> "cmd"
        ActivityType.ERROR -> "error"
        ActivityType.TOOL -> "tool"
        ActivityType.MESSAGE -> "message"
        ActivityType.SESSION -> "session"
    },
    timestamp = formatEventTime(timestamp.toString()),
    actor = if (actor == PRIMARY_AGENT_ID) agentDisplayName(actor) else actor,
    action = action,
    detail = detail,
)

@Composable
private fun ActivityTopBar(
    filter: String,
    onFilterChange: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(Bg1)
            .border(1.dp, Line)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "活动日志",
            color = Tx,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "执行历史、工具调用与数据变更",
            color = Tx3,
            fontSize = 11.sp
        )

        Spacer(Modifier.weight(1f))

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("全部", "MCP", "文件", "命令").forEach { chip ->
                val isActive = filter == chip
                val interaction = remember { MutableInteractionSource() }
                val hovered by interaction.collectIsHoveredAsState()
                val chipBg by animateColorAsState(
                    when {
                        isActive -> ControlPurple.withAlpha(0.14f)
                        hovered -> ControlPurple.withAlpha(0.08f)
                        else -> Color.Transparent
                    },
                    Motion.colorDefault,
                    label = "filterChipBg",
                )
                val chipFg by animateColorAsState(
                    if (isActive || hovered) ControlPurple else Tx3,
                    Motion.colorDefault,
                    label = "filterChipFg",
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(chipBg)
                        .fluidClickable(interactionSource = interaction) { onFilterChange(chip) }
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = chip,
                        color = chipFg,
                        fontSize = 10.sp,
                        fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

private fun buildArchiveTree(sessions: List<Session>): List<ArchiveYearNode> {
    val grouped = mutableMapOf<String, MutableMap<String, MutableMap<String, MutableList<ArchiveSessionItem>>>>()

    for (s in sessions) {
        val isoStr = s.createdAt.toString()
        val instant = try { java.time.Instant.parse(isoStr) } catch (_: Exception) { continue }
        val local = instant.atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        val year = local.year.toString()
        val month = local.monthValue.toString().padStart(2, '0')
        val day = local.dayOfMonth.toString().padStart(2, '0')
        val title = s.title.ifBlank {
            s.messages.firstOrNull()?.content?.firstOrNull()?.text?.take(30) ?: "会话 ${s.id}"
        }

        val item = ArchiveSessionItem(
            id = s.id,
            title = title,
            agentId = s.agentId,
            createdAt = isoStr
        )

        grouped.getOrPut(year) { mutableMapOf() }
            .getOrPut(month) { mutableMapOf() }
            .getOrPut(day) { mutableListOf() }
            .add(item)
    }

    return grouped.keys.sortedDescending().map { year ->
        ArchiveYearNode(
            year = year,
            months = grouped[year]!!.keys.sortedDescending().map { month ->
                ArchiveMonthNode(
                    month = month,
                    days = grouped[year]!![month]!!.keys.sortedDescending().map { day ->
                        ArchiveDayNode(
                            day = day,
                            dateStr = "$year-$month-$day",
                            sessions = grouped[year]!![month]!![day]!!
                        )
                    }
                )
            }
        )
    }
}

private fun formatEventTime(isoString: String): String {
    return try {
        val instant = java.time.Instant.parse(isoString)
        val local = instant.atZone(java.time.ZoneId.systemDefault()).toLocalTime()
        "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
    } catch (_: Exception) {
        isoString.take(5)
    }
}

private fun calcDuration(createdAt: String, updatedAt: String): String {
    return try {
        val start = java.time.Instant.parse(createdAt)
        val end = java.time.Instant.parse(updatedAt)
        val diff = java.time.Duration.between(start, end)
        when {
            diff.toMinutes() < 1 -> "${diff.seconds}s"
            diff.toHours() < 1 -> "${diff.toMinutes()}m"
            else -> "${diff.toHours()}h ${diff.toMinutes() % 60}m"
        }
    } catch (_: Exception) {
        "—"
    }
}
