package com.swarmeditor.desktop.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
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

@androidx.compose.runtime.Immutable
data class TimelineEvent(
    val id: String,
    val type: String,       // "tool" | "skill" | "mcp" | "file" | "cmd" | "message"
    val timestamp: String,
    val actor: String,
    val action: String,
    val detail: String = ""
)

@androidx.compose.runtime.Immutable
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
            "工具" -> ev.type == "tool"
            "Skill" -> ev.type == "skill"
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
                    .background(Bg2)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatChip(label = "耗时", value = stats.duration)
                StatChip(label = "事件", value = stats.eventCount.toString())
                StatChip(label = "Token", value = stats.tokenCount)
                StatChip(label = "执行核心", value = stats.agentName)
            }
        }

        // Timeline
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp)
        ) {
            items(filtered, key = { it.id }) { event ->
                Box(Modifier.animateItem()) { TimelineEntry(event = event) }
            }

            if (filtered.isEmpty()) {
                item(key = "empty") {
                    Box(
                        modifier = Modifier.fillParentMaxSize().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            modifier = Modifier
                                .widthIn(max = 460.dp)
                                .clip(AppShapes.lg)
                                .background(Bg2)
                                .border(1.dp, Line2, AppShapes.lg)
                                .padding(22.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(AppShapes.pill)
                                    .background(ControlPurple.withAlpha(0.12f))
                                    .padding(horizontal = 9.dp, vertical = 4.dp),
                            ) {
                                Text(
                                    if (filter == "全部") "等待活动" else "$filter 筛选",
                                    color = ControlPurple,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            Text(
                                if (events.isEmpty()) "此会话暂无 Agent 操作" else "当前筛选没有匹配事件",
                                color = Tx,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                if (filter == "全部") {
                                    "主智能体调用工具、修改文件或执行命令后，事件会按时间顺序显示在这里。"
                                } else {
                                    "切换到“全部”查看该会话的完整 Agent 操作历史。"
                                },
                                color = Tx3,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatChip(label: String, value: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, color = Tx3, fontSize = 10.sp)
        Spacer(Modifier.width(3.dp))
        Text(text = value, color = Tx, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun TimelineEntry(event: TimelineEvent) {
    val dotColor = when (event.type) {
        "tool" -> AgentGemini
        "skill" -> ControlPurple
        "mcp" -> AgentQwen
        "file" -> AgentClaude
        "cmd" -> Ac
        else -> Tx2
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
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
                    .background(Line)
            )
        }

        Spacer(Modifier.width(8.dp))

        // Content
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(8.dp))
                .background(Bg2)
                .padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
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
                color = Tx,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
            // Detail
            if (event.detail.isNotBlank()) {
                Text(
                    text = event.detail,
                    color = Tx3,
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontFamily = CodeFont
                )
            }
        }
    }
}
