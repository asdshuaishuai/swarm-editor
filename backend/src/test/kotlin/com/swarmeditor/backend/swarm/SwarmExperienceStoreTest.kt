package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperienceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmExperienceStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `persists merges and retrieves role relevant experience`() = runTest {
        val directory = Files.createTempDirectory("swarm-experience-store")
        try {
            val file = directory.resolve("experiences.json").toFile()
            val store = SwarmExperienceStore(file).also { it.load() }
            val first = Instant.fromEpochMilliseconds(1_000)
            val second = Instant.fromEpochMilliseconds(2_000)
            val insight = SwarmExperienceInsight(
                id = "trace-data-flow",
                principle = "Trace UI to storage before editing integration code",
                rationale = "End-to-end tracing exposes disconnected state transitions.",
                kind = SwarmExperienceKind.STRATEGY,
                role = SwarmAgentRole.REVIEWER,
                tags = listOf("integration", "data-flow"),
                evidence = SwarmExperienceEvidence.SUCCESS,
            )

            store.applyInsights("run-1", listOf(insight), first)
            store.applyInsights(
                "run-2",
                listOf(insight.copy(evidence = SwarmExperienceEvidence.FAILURE)),
                second,
            )

            val relevant = store.findRelevant(
                query = "Review integration data flow and persistence",
                role = SwarmAgentRole.REVIEWER,
            )
            assertEquals(listOf("trace-data-flow"), relevant.map { it.id })
            assertEquals(1, relevant.single().successfulEvidence)
            assertEquals(1, relevant.single().failedEvidence)
            assertEquals(listOf("run-1", "run-2"), relevant.single().sourceRunIds)

            store.recordUsage(
                run(
                    id = "usage-success",
                    taskStatus = SwarmTaskStatus.SUCCEEDED,
                    attempt = 1,
                )
            )
            store.recordUsage(
                run(
                    id = "usage-recovered",
                    taskStatus = SwarmTaskStatus.SUCCEEDED,
                    attempt = 2,
                )
            )
            store.recordUsage(
                run(
                    id = "usage-failed",
                    taskStatus = SwarmTaskStatus.FAILED,
                    attempt = 2,
                )
            )
            store.recordUsage(
                run(
                    id = "usage-failed",
                    taskStatus = SwarmTaskStatus.FAILED,
                    attempt = 2,
                )
            )

            val measured = store.experiences.value.single()
            assertEquals(1, measured.successfulUses)
            assertEquals(1, measured.recoveredUses)
            assertEquals(1, measured.failedUses)
            assertEquals(3, measured.evaluatedTaskKeys.size)

            val reloaded = SwarmExperienceStore(file).also { it.load() }
            assertEquals(store.experiences.value, reloaded.experiences.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun run(
        id: String,
        taskStatus: SwarmTaskStatus,
        attempt: Int,
    ): SwarmRun {
        val timestamp = Instant.fromEpochMilliseconds(3_000)
        return SwarmRun(
            id = id,
            title = id,
            objective = "Review integration data flow",
            createdAt = timestamp,
            updatedAt = timestamp,
            status = if (taskStatus == SwarmTaskStatus.SUCCEEDED) {
                SwarmRunStatus.SUCCEEDED
            } else {
                SwarmRunStatus.FAILED
            },
            tasks = listOf(
                SwarmTask(
                    id = "review",
                    title = "Review",
                    prompt = "Review data flow",
                    role = SwarmAgentRole.REVIEWER,
                    status = taskStatus,
                    attempt = attempt,
                    experienceIds = listOf("trace-data-flow"),
                )
            ),
        )
    }
}
