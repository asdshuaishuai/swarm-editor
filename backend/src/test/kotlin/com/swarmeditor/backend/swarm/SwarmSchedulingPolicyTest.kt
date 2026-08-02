package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskAttemptRecord
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds

class SwarmSchedulingPolicyTest {
    private val policy = CriticalPathSwarmSchedulingPolicy()

    @Test
    fun `critical path root outranks an earlier shallow task`() {
        val shallow = task("shallow")
        val criticalRoot = task("critical-root", role = SwarmAgentRole.IMPLEMENTER)
        val criticalReview = task("critical-review", dependsOn = listOf("critical-root"), role = SwarmAgentRole.REVIEWER)
        val criticalIntegrate = task("critical-integrate", dependsOn = listOf("critical-review"), role = SwarmAgentRole.INTEGRATOR)
        val run = run(listOf(shallow, criticalRoot, criticalReview, criticalIntegrate))

        val selection = policy.select(
            run = run,
            readyCandidates = listOf(shallow, criticalRoot),
            activeTaskIds = emptySet(),
            capacity = 1,
        )

        assertEquals(listOf("critical-root", "shallow"), selection.rankedCandidates.map(SwarmTask::id))
        assertEquals(setOf("critical-root"), selection.selectedTaskIds)
        assertTrue(
            selection.scores.getValue("critical-root").remainingCriticalPath >
                selection.scores.getValue("shallow").remainingCriticalPath,
        )
    }

    @Test
    fun `wide fanout root gains structural leverage over isolated work`() {
        val isolated = task("isolated")
        val sharedRoot = task("shared-root")
        val first = task("first", dependsOn = listOf("shared-root"))
        val second = task("second", dependsOn = listOf("shared-root"))
        val third = task("third", dependsOn = listOf("shared-root"))
        val run = run(listOf(isolated, sharedRoot, first, second, third))

        val selection = policy.select(run, listOf(isolated, sharedRoot), emptySet(), capacity = 1)

        assertEquals("shared-root", selection.rankedCandidates.first().id)
        assertEquals(3, selection.scores.getValue("shared-root").downstreamReach)
        assertTrue(
            selection.scores.getValue("shared-root").utility >
                selection.scores.getValue("isolated").utility
        )
    }

    @Test
    fun `active agent contention defers duplicate profile when utilities are otherwise equal`() {
        val active = task("active", agentId = "pi-a").copy(status = com.swarmeditor.common.model.SwarmTaskStatus.RUNNING)
        val sameAgent = task("same-agent", agentId = "pi-a")
        val freeAgent = task("free-agent", agentId = "pi-b")
        val run = run(listOf(active, sameAgent, freeAgent))

        val selection = policy.select(
            run = run,
            readyCandidates = listOf(sameAgent, freeAgent),
            activeTaskIds = setOf("active"),
            capacity = 1,
        )

        assertEquals("free-agent", selection.rankedCandidates.first().id)
        assertEquals(0.75, selection.scores.getValue("same-agent").activeAgentPenalty)
    }

    @Test
    fun `observed duration contributes to remaining critical path estimate`() {
        val startedAt = Clock.System.now()
        val slow = task("slow").copy(
            attemptRecords = listOf(
                SwarmTaskAttemptRecord(
                    id = "slow-attempt-1",
                    schedulingDecisionId = "schedule-0001",
                    attempt = 1,
                    outcome = SwarmTaskAttemptOutcome.SUCCEEDED,
                    startedAt = startedAt,
                    completedAt = startedAt + 180.seconds,
                    durationMillis = 180_000,
                ),
            ),
        )
        val unknown = task("unknown")
        val run = run(listOf(unknown, slow))

        val selection = policy.select(run, listOf(unknown, slow), emptySet(), capacity = 1)

        assertEquals("slow", selection.rankedCandidates.first().id)
        assertTrue(selection.scores.getValue("slow").utility > selection.scores.getValue("unknown").utility)
    }

    @Test
    fun `ownership gate defers a ready task that conflicts with active writes`() {
        val active = task("active").copy(
            status = com.swarmeditor.common.model.SwarmTaskStatus.RUNNING,
            writePaths = listOf("backend/**"),
        )
        val conflicting = task("conflicting").copy(writePaths = listOf("backend/src/**"))
        val independent = task("independent").copy(writePaths = listOf("desktopApp/**"))
        val run = run(listOf(active, conflicting, independent))

        val selection = policy.select(
            run = run,
            readyCandidates = listOf(conflicting, independent),
            activeTaskIds = setOf("active"),
            capacity = 2,
        )

        assertEquals(setOf("independent"), selection.selectedTaskIds)
        assertTrue(selection.deferredOwnershipReasons.getValue("conflicting").contains("write/write"))
        assertTrue(selection.deferredOwnershipReasons.getValue("conflicting").contains("active"))
    }

    @Test
    fun `ownership gate chooses only one conflicting task in the same wave`() {
        val first = task("first").copy(writePaths = listOf("backend/service/*.kt"))
        val second = task("second").copy(readPaths = listOf("backend/**"))
        val run = run(listOf(first, second))

        val selection = policy.select(run, listOf(first, second), emptySet(), capacity = 2)

        assertEquals(1, selection.selectedTaskIds.size)
        val deferredId = setOf("first", "second").single { it !in selection.selectedTaskIds }
        assertTrue(selection.deferredOwnershipReasons.getValue(deferredId).contains("read"))
    }

    private fun task(
        id: String,
        dependsOn: List<String> = emptyList(),
        role: SwarmAgentRole = SwarmAgentRole.GENERAL,
        agentId: String? = null,
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = "Complete $id",
        role = role,
        agentId = agentId,
        dependsOn = dependsOn,
    )

    private fun run(tasks: List<SwarmTask>) = SwarmRun(
        id = "run-policy",
        title = "Policy test",
        objective = "Exercise dynamic scheduling",
        createdAt = Clock.System.now(),
        updatedAt = Clock.System.now(),
        policy = SwarmExecutionPolicy(maxParallelism = 2),
        tasks = tasks,
    )
}
