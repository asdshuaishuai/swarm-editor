package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

@androidx.compose.runtime.Immutable
data class ArchiveDayNode(
    val day: String,
    val dateStr: String,
    val sessions: List<ArchiveSessionItem>
)

@androidx.compose.runtime.Immutable
data class ArchiveMonthNode(
    val month: String,
    val days: List<ArchiveDayNode>
)

@androidx.compose.runtime.Immutable
data class ArchiveYearNode(
    val year: String,
    val months: List<ArchiveMonthNode>
)

@androidx.compose.runtime.Immutable
data class ArchiveSessionItem(
    val id: String,
    val title: String,
    val agentId: String,
    val createdAt: String,
    val relativeTime: String = ""
)

@Composable
fun ArchiveTree(
    years: List<ArchiveYearNode>,
    selectedSessionId: String?,
    onSelectSession: (ArchiveSessionItem) -> Unit,
    modifier: Modifier = Modifier
) {
    val expandState = remember { mutableStateMapOf<String, Boolean>() }

    // Auto-expand current year and month
    val today = java.time.LocalDate.now()
    val currentYear = today.year.toString()
    val currentMonth = today.monthValue.toString().padStart(2, '0')
    val todayStr = today.toString()

    if (expandState.isEmpty()) {
        expandState[currentYear] = true
        expandState["$currentYear-$currentMonth"] = true
    }

    LazyColumn(modifier = modifier
        .clip(RoundedCornerShape(R8))
        .background(Bg3)
        .border(1.dp, Line, RoundedCornerShape(R8))
    ) {
        years.forEach { year ->
            val yearKey = year.year
            val yearExpanded = expandState[yearKey] ?: false
            val yearCount = year.months.sumOf { m -> m.days.sumOf { d -> d.sessions.size } }

            item(key = "year-$yearKey") {
                TreeNodeRow(
                    label = year.year,
                    expanded = yearExpanded,
                    count = yearCount,
                    onClick = { expandState[yearKey] = !yearExpanded }
                )
            }

            if (yearExpanded) {
                year.months.forEach { month ->
                    val monthKey = "${year.year}-${month.month}"
                    val monthExpanded = expandState[monthKey] ?: false
                    val monthCount = month.days.sumOf { d -> d.sessions.size }
                    val monthNames = listOf("", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月")
                    val monthLabel = monthNames.getOrElse(month.month.toIntOrNull() ?: 1) { month.month }

                    item(key = "month-$monthKey") {
                        TreeNodeRow(
                            label = monthLabel,
                            expanded = monthExpanded,
                            count = monthCount,
                            depth = 1,
                            onClick = { expandState[monthKey] = !monthExpanded }
                        )
                    }

                    if (monthExpanded) {
                        month.days.forEach { day ->
                            val dayKey = "${year.year}-${month.month}-${day.day}"
                            val dayExpanded = expandState[dayKey] ?: false
                            val isToday = day.dateStr == todayStr

                            item(key = "day-$dayKey") {
                                TreeNodeRow(
                                    label = "${day.day}日",
                                    expanded = dayExpanded,
                                    count = day.sessions.size,
                                    depth = 2,
                                    badge = if (isToday) "今天" else null,
                                    onClick = { expandState[dayKey] = !dayExpanded }
                                )
                            }

                            if (dayExpanded) {
                                items(day.sessions, key = { "session-${it.id}" }) { session ->
                                    val isSelected = session.id == selectedSessionId
                                    SessionRow(
                                        session = session,
                                        isSelected = isSelected,
                                        onClick = { onSelectSession(session) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TreeNodeRow(
    label: String,
    expanded: Boolean,
    count: Int,
    depth: Int = 0,
    badge: String? = null,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = (8 + depth * 16).dp, top = 4.dp, bottom = 4.dp, end = 8.dp)
            .height(28.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Expand arrow
        Text(
            text = if (expanded) "▼" else "▶",
            color = Tx3,
            fontSize = 9.sp
        )
        Spacer(Modifier.width(6.dp))
        // Label
        Text(
            text = label,
            color = Tx,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.width(6.dp))
        // Count badge
        if (count > 0) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(AgentClaude.copy(0.15f))
                    .padding(horizontal = 5.dp, vertical = 1.dp)
            ) {
                Text(
                    text = count.toString(),
                    color = AgentClaude,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        // "今天" badge
        if (badge != null) {
            Spacer(Modifier.width(4.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(AgentClaude.copy(0.2f))
                    .padding(horizontal = 5.dp, vertical = 1.dp)
            ) {
                Text(
                    text = badge,
                    color = AgentClaude,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun SessionRow(
    session: ArchiveSessionItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 56.dp, top = 2.dp, bottom = 2.dp, end = 8.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (isSelected) Bg2 else Bg3)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Agent icon
        Box(
            modifier = Modifier
                .size(18.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(AgentClaude.withAlpha(0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = session.agentId.firstOrNull()?.uppercase() ?: "?",
                color = AgentClaude,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold
            )
        }
        Spacer(Modifier.width(6.dp))
        // Title + meta
        Column(Modifier.weight(1f)) {
            Text(
                text = session.title,
                color = if (isSelected) Ac else Tx,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${session.agentId} · ${session.relativeTime.ifBlank { formatRelativeTime(session.createdAt) }}",
                color = Tx3,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun formatRelativeTime(isoString: String): String {
    return try {
        val instant = java.time.Instant.parse(isoString)
        val now = java.time.Instant.now()
        val diff = java.time.Duration.between(instant, now)
        when {
            diff.toMinutes() < 1 -> "刚刚"
            diff.toMinutes() < 60 -> "${diff.toMinutes()}分钟前"
            diff.toHours() < 24 -> "${diff.toHours()}小时前"
            diff.toDays() < 7 -> "${diff.toDays()}天前"
            else -> "${diff.toDays() / 30}月前"
        }
    } catch (_: Exception) {
        isoString.take(10)
    }
}
