package com.swarmeditor.desktop.ui.session

import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal enum class AgentLogFilter(val label: String) {
    ALL("全部"),
    TOOL("工具"),
    SKILL("Skill"),
    MCP("MCP"),
}

internal data class AgentActivityDateGroup(
    val dateKey: String,
    val entries: List<ActivityEvent>,
)

internal fun isAgentOperationActivity(event: ActivityEvent): Boolean =
    event.type in AGENT_OPERATION_TYPES

internal fun filterAgentActivities(
    activities: List<ActivityEvent>,
    filter: AgentLogFilter,
): List<ActivityEvent> = activities.asSequence()
    .filter { event ->
        when (filter) {
            AgentLogFilter.ALL -> isAgentOperationActivity(event)
            AgentLogFilter.TOOL -> event.type in TOOL_ACTIVITY_TYPES
            AgentLogFilter.SKILL -> event.type == ActivityType.SKILL
            AgentLogFilter.MCP -> event.type == ActivityType.MCP
        }
    }
    .sortedByDescending(ActivityEvent::timestamp)
    .toList()

internal fun groupAgentActivitiesByDate(activities: List<ActivityEvent>): List<AgentActivityDateGroup> =
    activities.groupByTo(linkedMapOf(), ::activityDateKey)
        .map { (dateKey, entries) -> AgentActivityDateGroup(dateKey, entries) }

internal fun activityDateKey(event: ActivityEvent): String =
    event.timestamp.toString().toLocalDateTime(DATE_FORMATTER)

internal fun activityTimeLabel(event: ActivityEvent): String =
    event.timestamp.toString().toLocalDateTime(TIME_FORMATTER)

private fun String.toLocalDateTime(formatter: DateTimeFormatter): String = runCatching {
    java.time.Instant.parse(this).atZone(ZoneId.systemDefault()).format(formatter)
}.getOrElse { take(8) }

private val AGENT_OPERATION_TYPES = setOf(
    ActivityType.TOOL,
    ActivityType.SKILL,
    ActivityType.MCP,
    ActivityType.FILE,
    ActivityType.COMMAND,
)

private val TOOL_ACTIVITY_TYPES = setOf(
    ActivityType.TOOL,
    ActivityType.FILE,
    ActivityType.COMMAND,
)

private val DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd")
private val TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss")
