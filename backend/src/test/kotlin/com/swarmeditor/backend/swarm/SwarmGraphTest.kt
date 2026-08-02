package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRevisionContract
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmTask
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Clock

class SwarmGraphTest {
    @Test
    fun `analyzes topological depth and transitive graph reach`() {
        val analysis = SwarmGraph.analyze(
            listOf(
                task("inspect"),
                task("backend", dependsOn = listOf("inspect")),
                task("desktop", dependsOn = listOf("inspect")),
                task("integrate", dependsOn = listOf("backend", "desktop")),
            )
        )

        assertEquals(listOf("inspect", "backend", "desktop", "integrate"), analysis.topologicalOrder)
        assertEquals(3, analysis.metrics.getValue("inspect").downstreamReach)
        assertEquals(2, analysis.metrics.getValue("inspect").directDependents)
        assertEquals(2, analysis.metrics.getValue("integrate").depth)
        assertEquals(3, analysis.metrics.getValue("integrate").upstreamReach)
        assertTrue(
            analysis.metrics.getValue("backend").bridgeCentrality >
                analysis.metrics.getValue("inspect").bridgeCentrality
        )
    }

    @Test
    fun `rejects cyclic task dependencies`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(
                listOf(
                    task("a", dependsOn = listOf("b")),
                    task("b", dependsOn = listOf("a")),
                )
            )
        }
    }

    @Test
    fun `rejects missing dependency`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(listOf(task("a", dependsOn = listOf("missing"))))
        }
    }

    @Test
    fun `rejects empty verification command`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(listOf(task("a", verificationCommands = listOf(emptyList()))))
        }
    }

    @Test
    fun `rejects verification argument containing control characters`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(listOf(task("a", verificationCommands = listOf(listOf("check\nall")))))
        }
    }

    @Test
    fun `requires revision task to depend on its bound source task`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(
                listOf(
                    task("source"),
                    task(
                        id = "revision",
                        revisionContract = revisionContract(sourceTaskId = "source"),
                    ),
                )
            )
        }
    }

    @Test
    fun `accepts revision contract bound to dependency artifact`() {
        SwarmGraph.validate(
            listOf(
                task("source"),
                    task(
                        id = "revision",
                        dependsOn = listOf("source"),
                        writePaths = listOf("backend/**"),
                        revisionContract = revisionContract(sourceTaskId = "source"),
                ),
            )
        )
    }

    @Test
    fun `rejects revision write scope that exceeds target contract`() {
        assertFailsWith<IllegalArgumentException> {
            SwarmGraph.validate(
                listOf(
                    task("source"),
                    task(
                        id = "revision",
                        dependsOn = listOf("source"),
                        writePaths = listOf("**"),
                        revisionContract = revisionContract(sourceTaskId = "source"),
                    ),
                )
            )
        }
    }

    @Test
    fun `accepts source write scope when contract explicitly requests it`() {
        val contract = revisionContract(sourceTaskId = "source").copy(
            scopeMode = SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE,
        )
        SwarmGraph.validate(
            listOf(
                task("source"),
                task(
                    id = "revision",
                    dependsOn = listOf("source"),
                    writePaths = contract.sourceWritePaths,
                    revisionContract = contract,
                ),
            )
        )
    }

    private fun task(
        id: String,
        dependsOn: List<String> = emptyList(),
        verificationCommands: List<List<String>> = emptyList(),
        writePaths: List<String> = emptyList(),
        revisionContract: SwarmArtifactRevisionContract? = null,
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = "Execute $id",
        dependsOn = dependsOn,
        writePaths = writePaths,
        verificationCommands = verificationCommands,
        revisionContract = revisionContract,
    )

    private fun revisionContract(sourceTaskId: String) = SwarmArtifactRevisionContract(
        id = "revision-contract-test",
        sourcePlanId = "integration-test",
        sourceTaskId = sourceTaskId,
        sourceAttempt = 1,
        sourceArtifactRevision = "1".repeat(40),
        sourceArtifactTree = "2".repeat(40),
        rejectionReason = SwarmArtifactRejectionReason.ROOT_CAUSE_NOT_FIXED,
        sourceWritePaths = listOf("backend/**"),
        targetHunkIds = listOf("hunk-${"a".repeat(20)}"),
        targetPaths = listOf("backend/**"),
        createdAt = Clock.System.now(),
    )
}
