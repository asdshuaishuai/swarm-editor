package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTaskHandoffStatus
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SwarmTaskHandoffParserTest {
    @Test
    fun `parses complete markdown handoff without treating fenced code as headings`() {
        val handoff = parseSwarmTaskHandoff(
            """
            ## Outcome
            Implemented the persistence fix.

            ## Evidence
            ```text
            Changes
            is data inside the evidence block.
            ```

            ## Changes
            Updated service and store.

            ## Verification
            ./gradlew :backend:test passed.

            ## Residual Risk
            Platform-specific behavior remains untested.

            ## Downstream Handoff
            Review the service-to-store transaction boundary.
            """.trimIndent()
        )

        assertEquals(SwarmTaskHandoffStatus.COMPLETE, handoff.status)
        assertTrue(handoff.missingSections.isEmpty())
        assertContains(handoff.evidence, "Changes")
        assertEquals("Updated service and store.", handoff.changes)
        assertEquals("Review the service-to-store transaction boundary.", handoff.downstreamHandoff)
    }

    @Test
    fun `parses localized partial handoff and records missing sections`() {
        val handoff = parseSwarmTaskHandoff(
            """
            结果：
            已定位问题。
            证据：
            状态未写入持久层。
            验证：
            尚未执行。
            """.trimIndent()
        )

        assertEquals(SwarmTaskHandoffStatus.PARTIAL, handoff.status)
        assertEquals("已定位问题。", handoff.outcome)
        assertEquals("状态未写入持久层。", handoff.evidence)
        assertEquals("尚未执行。", handoff.verification)
        assertContains(handoff.missingSections, "Changes")
        assertContains(handoff.missingSections, "Downstream Handoff")
    }

    @Test
    fun `preserves unstructured output as fallback outcome`() {
        val handoff = parseSwarmTaskHandoff("Completed without structured headings.")

        assertEquals(SwarmTaskHandoffStatus.UNSTRUCTURED, handoff.status)
        assertEquals("Completed without structured headings.", handoff.outcome)
        assertEquals(6, handoff.missingSections.size)
    }
}
