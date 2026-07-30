package com.swarmeditor.desktop.ui.agents

import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.desktop.api.AgentConfigDto
import com.swarmeditor.desktop.api.AgentDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SwarmVisualizationTest {
    @Test
    fun `primary agent stays at the center instead of becoming a satellite`() {
        val primary = agent("primary", "主智能体")
        val reviewer = agent("reviewer", "审查 Profile")

        val nodes = buildSwarmVisualNodes(listOf(primary, reviewer), emptyList())

        assertEquals(1, nodes.size)
        assertEquals("profile:reviewer", nodes.single().id)
        assertEquals(reviewer, nodes.single().agent)
    }

    @Test
    fun `latest swarm tasks become dynamic non profile nodes`() {
        val task = SwarmTask(
            id = "task-1",
            title = "审查数据链",
            prompt = "trace",
            status = SwarmTaskStatus.RUNNING,
        )

        val nodes = buildSwarmVisualNodes(listOf(agent("primary", "主智能体")), listOf(task))

        assertEquals(1, nodes.size)
        assertEquals(SwarmVisualNodeKind.TASK, nodes.single().kind)
        assertEquals("running", nodes.single().status)
        assertNull(nodes.single().agent)
    }

    private fun agent(id: String, name: String) = AgentDto(
        config = AgentConfigDto(id = id, name = name),
        status = "connected",
    )
}
