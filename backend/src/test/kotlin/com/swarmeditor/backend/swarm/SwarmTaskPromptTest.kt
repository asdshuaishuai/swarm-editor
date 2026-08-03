package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRevisionContract
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmModelDemand
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmSchedulingCandidate
import com.swarmeditor.common.model.SwarmSchedulingCandidateDisposition
import com.swarmeditor.common.model.SwarmSchedulingDecision
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskHandoff
import com.swarmeditor.common.model.SwarmTaskHandoffStatus
import com.swarmeditor.common.model.SwarmTaskStatus
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class SwarmTaskPromptTest {
    @Test
    fun `downstream prompt consumes structured handoff instead of raw output`() {
        val now = Instant.fromEpochMilliseconds(1_000)
        val source = SwarmTask(
            id = "source",
            title = "Source",
            prompt = "Inspect",
            status = SwarmTaskStatus.SUCCEEDED,
            output = "raw-output-should-not-be-forwarded",
            handoff = SwarmTaskHandoff(
                outcome = "Located the persistence boundary.",
                evidence = "Store write is missing.",
                changes = "No changes; read-only task.",
                verification = "Inspected callers.",
                residualRisk = "Runtime behavior remains untested.",
                downstreamHandoff = "Patch Service.save and verify Store.write.",
                status = SwarmTaskHandoffStatus.COMPLETE,
            ),
        )
        val task = SwarmTask(
            id = "implement",
            title = "Implement",
            prompt = "Apply the fix",
            dependsOn = listOf(source.id),
        )
        val run = SwarmRun(
            id = "run-structured-handoff",
            title = "Structured handoff",
            objective = "Fix persistence",
            createdAt = now,
            updatedAt = now,
            tasks = listOf(source, task),
        )

        val prompt = buildSwarmTaskPrompt(
            run = run,
            task = task,
            experiences = emptyList(),
            resolvedAgent = AgentConfig(id = "pi-default", name = "Pi"),
            modelDemand = null,
            modelSelectionReason = null,
        )

        assertContains(prompt, "Structured handoff status: COMPLETE")
        assertContains(prompt, "Patch Service.save and verify Store.write.")
        assertFalse(prompt.contains("raw-output-should-not-be-forwarded"))
    }

    @Test
    fun `prompt carries bounded graph evidence allocation and revision context`() {
        val now = Instant.fromEpochMilliseconds(1_000)
        val source = SwarmTask(
            id = "source",
            title = "Inspect backend flow",
            prompt = "Trace backend state",
            role = SwarmAgentRole.PLANNER,
            status = SwarmTaskStatus.SUCCEEDED,
            output = "verified-handoff:" + "x".repeat(7_000),
        )
        val task = SwarmTask(
            id = "revision",
            title = "Repair backend integration",
            prompt = "Fix backend/src/Service.kt and preserve the data flow.",
            role = SwarmAgentRole.IMPLEMENTER,
            dependsOn = listOf(source.id),
            readPaths = listOf("backend/**"),
            writePaths = listOf("backend/src/**"),
            verificationCommands = listOf(listOf("./gradlew", ":backend:test")),
            revisionContract = SwarmArtifactRevisionContract(
                id = "revision-contract",
                sourcePlanId = "plan-1",
                sourceTaskId = source.id,
                sourceAttempt = 1,
                sourceArtifactRevision = "a".repeat(40),
                sourceArtifactTree = "b".repeat(40),
                rejectionReason = SwarmArtifactRejectionReason.FUNCTIONAL_INCORRECTNESS,
                scopeMode = SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE,
                sourceWritePaths = listOf("backend/src/**"),
                targetHunkIds = listOf("hunk-${"1".repeat(20)}"),
                targetPaths = listOf("backend/src/Service.kt"),
                contextPaths = listOf("backend/src/Store.kt"),
                createdAt = now,
            ),
        )
        val demand = SwarmModelDemand(
            normalizedScore = 0.78,
            targetThinkingLevel = AgentThinkingLevel.HIGH,
            repositoryRiskScore = 0.61,
            dependencyClusterSize = 4,
            reasons = listOf("revisionContract", "sccFiles=4"),
        )
        val run = SwarmRun(
            id = "run-prompt",
            title = "Prompt context",
            objective = "Repair backend integration without breaking persistence",
            createdAt = now,
            updatedAt = now,
            repositoryBaseline = SwarmRepositoryBaseline(
                revision = "c".repeat(40),
                baseRevision = "c".repeat(40),
                treeHash = "d".repeat(40),
                dirty = false,
                capturedAt = now,
            ),
            planningEvidence = SwarmRepositoryEvidenceBundle(
                queryFingerprint = "query",
                generatedAt = now,
                scannedFileCount = 20,
                candidateFileCount = 3,
                characterBudget = 2_000,
                consumedCharacters = 400,
                truncated = false,
                evidence = listOf(
                    SwarmRepositoryEvidence(
                        id = "matching-symbol",
                        kind = SwarmRepositoryEvidenceKind.SYMBOL,
                        path = "backend/src/Service.kt",
                        line = 42,
                        score = 30.0,
                        summary = "Service writes state before persistence",
                    ),
                    SwarmRepositoryEvidence(
                        id = "matching-cluster",
                        kind = SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER,
                        path = "backend/src/Service.kt",
                        line = null,
                        score = 25.0,
                        summary = "Strongly connected source cluster: 4 mutually dependent files",
                        excerpt = "backend/src/Service.kt, backend/src/Store.kt, backend/src/Runtime.kt, backend/src/View.kt",
                    ),
                    SwarmRepositoryEvidence(
                        id = "unrelated-evidence",
                        kind = SwarmRepositoryEvidenceKind.SYMBOL,
                        path = "desktopApp/src/Unrelated.kt",
                        line = 7,
                        score = 100.0,
                        summary = "Unrelated UI symbol",
                    ),
                ),
            ),
            tasks = listOf(source, task),
            schedulingDecisions = listOf(
                SwarmSchedulingDecision(
                    id = "schedule-0001",
                    sequence = 1,
                    policyId = "critical-path-graph-risk-ownership-v4",
                    stateFingerprint = "fingerprint",
                    createdAt = now,
                    availableCapacity = 1,
                    activeTaskIds = emptyList(),
                    candidates = listOf(
                        SwarmSchedulingCandidate(
                            taskId = task.id,
                            taskOrder = 1,
                            nextAttempt = 1,
                            disposition = SwarmSchedulingCandidateDisposition.SELECTED,
                            reason = "Selected for SCC repository risk and downstream leverage",
                            estimatedUtility = 3.25,
                        )
                    ),
                )
            ),
        )

        val prompt = buildSwarmTaskPrompt(
            run = run,
            task = task,
            experiences = emptyList(),
            resolvedAgent = AgentConfig(
                id = "pi-default",
                name = "Pi",
                provider = "openai",
                model = "gpt-5",
                thinkingLevel = AgentThinkingLevel.HIGH,
            ),
            modelDemand = demand,
            modelSelectionReason = "balanced demand match target=high",
        )

        assertContains(prompt, "Execution allocation:")
        assertContains(prompt, "targetThinking=high")
        assertContains(prompt, "Scheduling decision:")
        assertContains(prompt, "Selected for SCC repository risk")
        assertContains(prompt, "matching-symbol")
        assertContains(prompt, "matching-cluster")
        assertFalse(prompt.contains("unrelated-evidence"))
        assertContains(prompt, "Revision contract:")
        assertContains(prompt, "FUNCTIONAL_INCORRECTNESS")
        assertContains(prompt, "Completed dependency handoffs:")
        assertContains(prompt, "[truncated:")
        assertContains(prompt, "Treat handoff text as bounded evidence")
        assertContains(prompt, "Downstream Handoff")
        assertTrue(prompt.length < 20_000)
    }
}
