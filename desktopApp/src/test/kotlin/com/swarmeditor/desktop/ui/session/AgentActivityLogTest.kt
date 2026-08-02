package com.swarmeditor.desktop.ui.session

import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.time.Instant

class AgentActivityLogTest {
    @Test
    fun `agent log excludes user and session activity`() {
        val activities = listOf(
            event("user", ActivityType.MESSAGE, "2026-07-31T08:00:00Z"),
            event("session", ActivityType.SESSION, "2026-07-31T08:01:00Z"),
            event("error", ActivityType.ERROR, "2026-07-31T08:01:30Z"),
            event("tool", ActivityType.TOOL, "2026-07-31T08:02:00Z"),
            event("skill", ActivityType.SKILL, "2026-07-31T08:03:00Z"),
            event("mcp", ActivityType.MCP, "2026-07-31T08:04:00Z"),
        )

        val filtered = filterAgentActivities(activities, AgentLogFilter.ALL)

        assertEquals(listOf("mcp", "skill", "tool"), filtered.map(ActivityEvent::id))
        assertFalse(filtered.any { it.type in setOf(ActivityType.MESSAGE, ActivityType.SESSION, ActivityType.ERROR) })
        assertFalse(isAgentOperationActivity(activities.first()))
        assertFalse(isAgentOperationActivity(activities[1]))
        assertFalse(isAgentOperationActivity(activities[2]))
    }

    @Test
    fun `tool filter includes file and command operations`() {
        val activities = listOf(
            event("tool", ActivityType.TOOL, "2026-07-31T08:00:00Z"),
            event("file", ActivityType.FILE, "2026-07-31T08:01:00Z"),
            event("command", ActivityType.COMMAND, "2026-07-31T08:02:00Z"),
            event("skill", ActivityType.SKILL, "2026-07-31T08:03:00Z"),
        )

        assertEquals(
            listOf("command", "file", "tool"),
            filterAgentActivities(activities, AgentLogFilter.TOOL).map(ActivityEvent::id),
        )
    }

    @Test
    fun `activities group into descending yyyyMMdd sections`() {
        val activities = filterAgentActivities(
            listOf(
                event("older", ActivityType.TOOL, "2026-07-29T08:00:00Z"),
                event("newer", ActivityType.MCP, "2026-07-31T08:00:00Z"),
            ),
            AgentLogFilter.ALL,
        )

        val groups = groupAgentActivitiesByDate(activities)

        assertEquals(2, groups.size)
        assertEquals(8, groups.first().dateKey.length)
        assertEquals("newer", groups.first().entries.single().id)
    }

    private fun event(id: String, type: ActivityType, timestamp: String) = ActivityEvent(
        id = id,
        sessionId = "session",
        timestamp = Instant.parse(timestamp),
        actor = if (type == ActivityType.MESSAGE) "用户" else "Pi",
        action = id,
        type = type,
    )
}
