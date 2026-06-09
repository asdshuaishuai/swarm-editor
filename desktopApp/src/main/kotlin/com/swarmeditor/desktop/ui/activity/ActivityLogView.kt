package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.api.SessionDto
import com.swarmeditor.desktop.theme.*

@Composable
fun ActivityLogView(
    modifier: Modifier = Modifier
) {
    var sessions by remember { mutableStateOf<List<SessionDto>>(emptyList()) }
    var selectedSession by remember { mutableStateOf<ArchiveSessionItem?>(null) }
    var filter by remember { mutableStateOf("全部") }
    var timelineEvents by remember { mutableStateOf<List<TimelineEvent>>(emptyList()) }

    // Load sessions from API
    LaunchedEffect(Unit) {
        sessions = ApiClient.getSessions()
    }

    // Convert SessionDto list to archive tree data
    val archiveYears = remember(sessions) {
        buildArchiveTree(sessions)
    }

    // When session selected, build timeline events from its messages
    LaunchedEffect(selectedSession) {
        val s = selectedSession ?: return@LaunchedEffect
        val session = sessions.find { it.id == s.id }
        timelineEvents = session?.messages?.mapIndexed { idx, msg ->
            val contentText = msg.content.joinToString(" ") { it.text }
            val type = when {
                contentText.contains("mcp", ignoreCase = true) ||
                    contentText.contains("tool_call", ignoreCase = true) -> "mcp"
                contentText.contains("write", ignoreCase = true) ||
                    contentText.contains("写入", ignoreCase = true) ||
                    contentText.contains(".kt", ignoreCase = true) ||
                    contentText.contains(".json", ignoreCase = true) -> "file"
                contentText.contains("gradlew", ignoreCase = true) ||
                    contentText.contains("command", ignoreCase = true) ||
                    contentText.contains("运行", ignoreCase = true) ||
                    contentText.contains("验证", ignoreCase = true) -> "cmd"
                else -> "message"
            }
            val action = when (msg.role) {
                "user" -> "提问"
                "assistant" -> "回复"
                else -> "系统"
            }
            TimelineEvent(
                id = "${s.id}-$idx",
                type = type,
                timestamp = formatEventTime(msg.createdAt),
                actor = s.agentId.take(10),
                action = action,
                detail = contentText.take(80).replace('\n', ' ')
            )
        } ?: emptyList()
    }

    // Stats from selected session
    val stats = selectedSession?.let { sel ->
        val session = sessions.find { it.id == sel.id }
        session?.let {
            SessionStats(
                duration = calcDuration(it.createdAt, it.updatedAt),
                eventCount = it.messages.size,
                tokenCount = "—",
                agentName = it.agentId
            )
        }
    }

    Column(modifier = modifier.fillMaxSize().background(Glass)) {
        // Top bar
        ActivityTopBar(
            filter = filter,
            onFilterChange = { filter = it }
        )

        // Main content: ArchiveTree (left) + EventTimeline (right)
        Row(Modifier.weight(1f).fillMaxWidth()) {
            // Left sidebar: Archive tree
            Box(
                modifier = Modifier
                    .width(240.dp)
                    .fillMaxHeight()
                    .background(Glass2)
            ) {
                if (archiveYears.isNotEmpty()) {
                    ArchiveTree(
                        years = archiveYears,
                        selectedSessionId = selectedSession?.id,
                        onSelectSession = { selectedSession = it },
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("暂无历史记录", color = Tx3, fontSize = 12.sp)
                    }
                }
            }

            // Right: EventTimeline + session details
            if (selectedSession != null) {
                EventTimeline(
                    events = timelineEvents,
                    stats = stats,
                    filter = filter,
                    modifier = Modifier.weight(1f).fillMaxHeight()
                )
            } else {
                Box(
                    Modifier.weight(1f).fillMaxHeight().background(Glass),
                    contentAlignment = Alignment.Center
                ) {
                    Text("选择一个会话查看详情", color = Tx3, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun ActivityTopBar(
    filter: String,
    onFilterChange: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(Glass2)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "活动日志",
            color = Ac,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "会话历史与事件追踪",
            color = Tx3,
            fontSize = 11.sp
        )

        Spacer(Modifier.weight(1f))

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("全部", "MCP", "文件", "命令").forEach { chip ->
                val isActive = filter == chip
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(5.dp))
                        .background(if (isActive) AcD else Bg.copy(alpha = 0f))
                        .clickable { onFilterChange(chip) }
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = chip,
                        color = if (isActive) Ac else Tx3,
                        fontSize = 10.sp,
                        fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

private fun buildArchiveTree(sessions: List<SessionDto>): List<ArchiveYearNode> {
    val grouped = mutableMapOf<String, MutableMap<String, MutableMap<String, MutableList<ArchiveSessionItem>>>>()

    for (s in sessions) {
        val isoStr = s.createdAt.ifBlank { s.updatedAt }
        val instant = try { java.time.Instant.parse(isoStr) } catch (_: Exception) { continue }
        val local = instant.atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        val year = local.year.toString()
        val month = local.monthValue.toString().padStart(2, '0')
        val day = local.dayOfMonth.toString().padStart(2, '0')
        val title = s.messages.firstOrNull()?.content?.firstOrNull()?.text?.take(30) ?: "会话 ${s.id}"

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
