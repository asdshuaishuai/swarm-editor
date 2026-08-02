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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
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
import com.swarmeditor.desktop.ui.common.semanticAgentIcon
import com.swarmeditor.desktop.ui.session.isAgentOperationActivity

@Composable
fun ActivityLogView(
    sessions: List<Session>,
    activities: List<ActivityEvent>,
    modifier: Modifier = Modifier
) {
    var selectedSession by remember { mutableStateOf<ArchiveSessionItem?>(null) }
    var filter by remember { mutableStateOf("全部") }

    val agentOperationSessionIds = remember(activities) {
        activities.asSequence()
            .filter(::isAgentOperationActivity)
            .map(ActivityEvent::sessionId)
            .toSet()
    }
    val archiveDates = remember(sessions, agentOperationSessionIds) {
        buildArchiveDates(sessions.filter { it.id in agentOperationSessionIds })
    }

    // 默认选中最近一个会话，使时间线有内容
    LaunchedEffect(archiveDates) {
        val selectedStillExists = selectedSession?.let { selected ->
            sessions.any { it.id == selected.id }
        } == true
        if (!selectedStillExists) {
            selectedSession = archiveDates.firstOrNull()?.sessions?.firstOrNull()
        }
    }

    val timelineEvents = remember(selectedSession, activities) {
        val sessionId = selectedSession?.id
        activities.asSequence()
            .filter { it.sessionId == sessionId }
            .filter(::isAgentOperationActivity)
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
            if (archiveDates.isEmpty()) {
                ActivityWorkspaceEmpty(Modifier.fillMaxSize())
            } else if (wideLayout) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ArchivePanel(
                        dates = archiveDates,
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
                        dates = archiveDates,
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
    dates: List<ArchiveDateNode>,
    selectedSessionId: String?,
    onSelectSession: (ArchiveSessionItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.surfaceCard(bg = Bg1, elevation = Elevation.none)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text("会话归档", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("按日期定位历史执行记录", color = Tx3, fontSize = 10.sp)
        }
        if (dates.isNotEmpty()) {
            ArchiveTree(
                dates = dates,
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

@Composable
private fun ActivityWorkspaceEmpty(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.surfaceCard(bg = Bg1, elevation = Elevation.none),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 460.dp)
                .clip(AppShapes.lg)
                .background(Bg2)
                .border(1.dp, Line2, AppShapes.lg)
                .padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(AppShapes.md)
                    .background(ControlPurple.withAlpha(0.12f))
                    .border(1.dp, ControlPurple.withAlpha(0.22f), AppShapes.md),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = semanticAgentIcon("Agent 操作日志", "review-agent"),
                    contentDescription = null,
                    tint = ControlPurple,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.height(13.dp))
            Text("等待 Agent 操作", color = Tx, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(
                "主智能体调用工具、Skill、MCP，或执行文件与命令操作后，将自动按日期归档到这里。",
                color = Tx3,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MicroPill("TOOLS", AgentGemini)
                MicroPill("SKILLS", ControlPurple)
                MicroPill("MCP", AgentQwen)
            }
        }
    }
}

private fun ActivityEvent.toTimelineEvent() = TimelineEvent(
    id = id,
    type = when (type) {
        ActivityType.MCP -> "mcp"
        ActivityType.SKILL -> "skill"
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
            text = "Agent 活动日志",
            color = Tx,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "仅记录 Agent 工具、Skill、MCP 与数据操作",
            color = Tx3,
            fontSize = 11.sp
        )

        Spacer(Modifier.weight(1f))

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("全部", "工具", "Skill", "MCP", "文件", "命令").forEach { chip ->
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

internal fun buildArchiveDates(sessions: List<Session>): List<ArchiveDateNode> {
    val grouped = linkedMapOf<String, MutableList<ArchiveSessionItem>>()

    for (s in sessions) {
        val isoStr = s.createdAt.toString()
        val instant = try { java.time.Instant.parse(isoStr) } catch (_: Exception) { continue }
        val local = instant.atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        val dateKey = local.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)
        val title = s.title.ifBlank {
            s.messages.firstOrNull()?.content?.firstOrNull()?.text?.take(30) ?: "会话 ${s.id}"
        }

        val item = ArchiveSessionItem(
            id = s.id,
            title = title,
            agentId = s.agentId,
            createdAt = isoStr
        )

        grouped.getOrPut(dateKey) { mutableListOf() }.add(item)
    }

    return grouped.keys.sortedDescending().map { dateKey ->
        ArchiveDateNode(
            dateKey = dateKey,
            sessions = grouped.getValue(dateKey).sortedByDescending(ArchiveSessionItem::createdAt),
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
