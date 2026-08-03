package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmTask
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Clock

class SwarmModelDemandTest {
    @Test
    fun `low risk general task avoids unnecessary high thinking`() {
        val task = task("docs", role = SwarmAgentRole.GENERAL)
        val demand = SwarmModelDemandAssessor.assess(run(listOf(task)), task)

        assertEquals(AgentThinkingLevel.MINIMAL, demand.targetThinkingLevel)
        assertEquals(0.0, demand.repositoryRiskScore)
    }

    @Test
    fun `dependency cluster and integration scope raise model demand`() {
        val task = task(
            id = "backend-integration",
            role = SwarmAgentRole.IMPLEMENTER,
            writePaths = listOf("backend/**"),
            verificationCommands = listOf(listOf("./gradlew", ":backend:test")),
        ).copy(attempt = 1)
        val demand = SwarmModelDemandAssessor.assess(
            run(
                tasks = listOf(task),
                planningEvidence = evidenceBundle(
                    "backend/src/A.kt",
                    "backend/src/A.kt, backend/src/B.kt, backend/src/C.kt, backend/src/D.kt, backend/src/E.kt",
                ),
            ),
            task,
        )

        assertTrue(demand.targetThinkingLevel.qualityRank() >= AgentThinkingLevel.HIGH.qualityRank())
        assertEquals(5, demand.dependencyClusterSize)
        assertTrue(demand.repositoryRiskScore > 0.4)
        assertTrue("sccFiles=5" in demand.reasons)
    }

    private fun task(
        id: String,
        role: SwarmAgentRole,
        writePaths: List<String> = emptyList(),
        verificationCommands: List<List<String>> = emptyList(),
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = "Complete $id",
        role = role,
        writePaths = writePaths,
        verificationCommands = verificationCommands,
    )

    private fun run(
        tasks: List<SwarmTask>,
        planningEvidence: SwarmRepositoryEvidenceBundle? = null,
    ) = SwarmRun(
        id = "run-demand",
        title = "Demand",
        objective = "Assess model demand",
        createdAt = Clock.System.now(),
        updatedAt = Clock.System.now(),
        planningEvidence = planningEvidence,
        tasks = tasks,
    )

    private fun evidenceBundle(path: String, excerpt: String) = SwarmRepositoryEvidenceBundle(
        queryFingerprint = "query",
        generatedAt = Clock.System.now(),
        scannedFileCount = 5,
        candidateFileCount = 5,
        characterBudget = 1_000,
        consumedCharacters = 100,
        truncated = false,
        evidence = listOf(
            SwarmRepositoryEvidence(
                id = "scc",
                kind = SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER,
                path = path,
                line = null,
                score = 20.0,
                summary = "Strongly connected source cluster",
                excerpt = excerpt,
            )
        ),
    )
}

private fun AgentThinkingLevel.qualityRank(): Int = ordinal
