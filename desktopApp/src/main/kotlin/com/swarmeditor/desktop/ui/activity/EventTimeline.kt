package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

data class TimelineEvent(
    val id: String,
    val type: String,       // "mcp" | "file" | "cmd" | "message"
    val timestamp: String,
    val actor: String,
    val action: String,
    val detail: String = ""
)

data class SessionStats(
    val duration: String = "—",
    val eventCount: Int = 0,
    val tokenCount: String = "—",
    val agentName: String = "—"
)

@Composable
fun EventTimeline(
    events: List<TimelineEvent>,
    stats: SessionStats?,
    filter: String,
    modifier: Modifier = Modifier
) {
    val filtered = if (filter == "全部") events else events.filter { ev ->
        when (filter) {
            "MCP" -> ev.type == "mcp"
            "文件" -> ev.type == "file"
            "命令" -> ev.type == "cmd"
            else -> true
        }
    }

    Column(modifier = modifier) {
        // Session stats bar
        if (stats != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatChip(icon = "⏱", label = "耗时", value = stats.duration)
                StatChip(icon = "📋", label = "事件", value = stats.eventCount.toString())
                StatChip(icon = "🔢", label = "Token", value = stats.tokenCount)
                StatChip(icon = "🤖", label = "Agent", value = stats.agentName)
            }
        }

        // Timeline
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp)
        ) {
            items(filtered, key = { it.id }) { event ->
                TimelineEntry(event = event)
            }

            if (filtered.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("暂无事件", color = Tx3, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatChip(icon: String, label: String, value: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Surface2)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = icon, fontSize = 10.sp)
        Spacer(Modifier.width(4.dp))
        Text(text = label, color = Tx3, fontSize = 10.sp)
        Spacer(Modifier.width(3.dp))
        Text(text = value, color = Tx, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun TimelineEntry(event: TimelineEvent) {
    val dotColor = when (event.type) {
        "mcp" -> Gn
        "file" -> Pr
        "cmd" -> Ac
        else -> Tx2
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Timeline column: dot + line
        Column(
            modifier = Modifier.width(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Dot
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(dotColor)
            )
            // Vertical line
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight()
                    .height(20.dp)
                    .background(Bd)
            )
        }

        Spacer(Modifier.width(8.dp))

        // Content
        Column(modifier = Modifier.weight(1f).padding(bottom = 6.dp)) {
            // Time + Actor row
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = event.timestamp,
                    color = Tx3,
                    fontSize = 10.sp,
                    fontFamily = CodeFont
                )
                Spacer(Modifier.width(6.dp))
                // Actor chip
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(dotColor.copy(0.12f))
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = event.actor.take(10),
                        color = dotColor,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            // Action
            Text(
                text = event.action,
                color = Tx2,
                fontSize = 11.sp
            )
            // Detail
            if (event.detail.isNotBlank()) {
                Text(
                    text = event.detail,
                    color = Tx3,
                    fontSize = 10.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontFamily = CodeFont
                )
            }
        }
    }
}
