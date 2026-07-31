package com.swarmeditor.desktop.ui.agents

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentOrchestrationLayoutTest {
    @Test
    fun `stacks orchestration panels below the split layout breakpoint`() {
        assertFalse(useSplitAgentLayout(859))
    }

    @Test
    fun `splits orchestration panels when enough width is available`() {
        assertTrue(useSplitAgentLayout(860))
    }
}
