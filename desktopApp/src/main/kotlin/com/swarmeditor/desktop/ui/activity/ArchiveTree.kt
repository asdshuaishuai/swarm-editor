package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
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
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.agentDisplayName
import com.swarmeditor.desktop.theme.*
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronRight

@androidx.compose.runtime.Immutable
data class ArchiveDateNode(
    val dateKey: String,
    val sessions: List<ArchiveSessionItem>,
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
    dates: List<ArchiveDateNode>,
    selectedSessionId: String?,
    onSelectSession: (ArchiveSessionItem) -> Unit,
    modifier: Modifier = Modifier
) {
    val expandState = remember { mutableStateMapOf<String, Boolean>() }
    val todayKey = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)

    LaunchedEffect(dates.firstOrNull()?.dateKey) {
        val newestDate = dates.firstOrNull()?.dateKey ?: return@LaunchedEffect
        expandState.keys.retainAll(dates.map(ArchiveDateNode::dateKey).toSet())
        if (expandState.none { it.value }) expandState[newestDate] = true
    }

    LazyColumn(modifier = modifier
        .clip(RoundedCornerShape(R8))
        .background(Bg3)
        .border(1.dp, Line, RoundedCornerShape(R8))
    ) {
        dates.forEach { date ->
            val expanded = expandState[date.dateKey] ?: false
            item(key = "date-${date.dateKey}") {
                TreeNodeRow(
                    label = date.dateKey,
                    expanded = expanded,
                    count = date.sessions.size,
                    badge = if (date.dateKey == todayKey) "今天" else null,
                    onClick = { expandState[date.dateKey] = !expanded },
                )
            }
            if (expanded) {
                items(date.sessions, key = { "session-${it.id}" }) { session ->
                    val isSelected = session.id == selectedSessionId
                    Box(Modifier.animateItem()) {
                        SessionRow(
                            session = session,
                            isSelected = isSelected,
                            onClick = { onSelectSession(session) },
                        )
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
    badge: String? = null,
    onClick: () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = if (hovered) Bg2.copy(alpha = 0.72f) else Color.Transparent,
        animationSpec = Motion.colorDefault,
        label = "archiveTreeNodeBackground",
    )
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 90f else 0f,
        animationSpec = Motion.floatState,
        label = "archiveTreeChevronRotation",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .clip(AppShapes.xs)
            .background(background)
            .height(30.dp)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Expand arrow
        Icon(
            imageVector = Feather.ChevronRight,
            contentDescription = if (expanded) "收起" else "展开",
            tint = Tx3,
            modifier = Modifier.size(13.dp).rotate(chevronRotation),
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
            .fluidClickable(onClick = onClick)
            .padding(start = 24.dp, top = 2.dp, bottom = 2.dp, end = 8.dp)
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
                text = "主",
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
                text = "${agentDisplayName(session.agentId)} · ${session.relativeTime.ifBlank { formatRelativeTime(session.createdAt) }}",
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
