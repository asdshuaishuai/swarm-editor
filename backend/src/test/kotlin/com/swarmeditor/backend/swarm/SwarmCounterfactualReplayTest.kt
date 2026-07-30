package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmExperienceKind
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runTest

class SwarmCounterfactualReplayTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `replays control and treatment in detached worktrees and records matched evidence`() = runTest {
        val directory = Files.createTempDirectory("swarm-counterfactual-replay")
        try {
            val repository = directory.resolve("repository").toFile().apply { mkdirs() }
            git(repository, "init")
            git(repository, "config", "user.email", "tests@swarm.local")
            git(repository, "config", "user.name", "Swarm Tests")
            File(repository, "result.txt").writeText("base\n")
            git(repository, "add", "result.txt")
            git(repository, "commit", "-m", "baseline")
            val revision = git(repository, "rev-parse", "HEAD").trim()
            val worktreeRoot = directory.resolve("worktrees").toFile()
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            experienceStore.applyInsights(
                runId = "source-run",
                insights = listOf(
                    SwarmExperienceInsight(
                        id = "treatment-strategy",
                        principle = "Produce the treatment result",
                        rationale = "The verifier expects the treatment behavior.",
                        kind = SwarmExperienceKind.STRATEGY,
                        role = null,
                        tags = emptyList(),
                        evidence = SwarmExperienceEvidence.SUCCESS,
                    )
                ),
                timestamp = Instant.fromEpochMilliseconds(1_000),
            )
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            val verifier = object : SwarmEvaluationVerifier {
                override fun environmentFingerprint(revision: String, command: List<String>): String =
                    "test-environment:$revision:${command.joinToString(",")}"

                override suspend fun verify(workspace: File, command: List<String>): SwarmVerificationResult {
                    val passed = File(workspace, "result.txt").readText().trim() == "treatment"
                    return SwarmVerificationResult(passed, "verified", 25, timedOut = false)
                }
            }
            val replayer = DefaultSwarmCounterfactualReplayer(
                experienceStore = experienceStore,
                evolutionStore = evolutionStore,
                workspaceManager = GitWorktreeEvaluationWorkspaceManager(repository, worktreeRoot),
                verifier = verifier,
                now = { Instant.fromEpochMilliseconds(2_000) },
            )

            val evaluation = replayer.replay(
                SwarmCounterfactualReplayRequest(
                    experienceId = "treatment-strategy",
                    repositoryRevision = revision,
                    taskFingerprint = "result-verifier-v1",
                    controlPatch = patch("control"),
                    treatmentPatch = patch("treatment"),
                    verifierCommand = listOf("./verify"),
                )
            )

            assertFalse(evaluation.control.passed)
            assertTrue(evaluation.treatment.passed)
            assertEquals(1.0, evaluation.treatment.qualityScore)
            assertEquals(listOf(evaluation), evolutionStore.evaluations.value)
            assertTrue(worktreeRoot.listFiles().orEmpty().isEmpty())
            assertFalse(git(repository, "worktree", "list", "--porcelain").contains("eval-"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `cleans both worktrees and records nothing when one parallel variant fails`() = runTest {
        val directory = Files.createTempDirectory("swarm-counterfactual-failure")
        try {
            val repository = directory.resolve("repository").toFile().apply { mkdirs() }
            git(repository, "init")
            git(repository, "config", "user.email", "tests@swarm.local")
            git(repository, "config", "user.name", "Swarm Tests")
            File(repository, "result.txt").writeText("base\n")
            git(repository, "add", "result.txt")
            git(repository, "commit", "-m", "baseline")
            val revision = git(repository, "rev-parse", "HEAD").trim()
            val worktreeRoot = directory.resolve("worktrees").toFile()
            val experienceStore = SwarmExperienceStore(directory.resolve("experiences.json").toFile()).also { it.load() }
            experienceStore.applyInsights(
                runId = "source-run",
                insights = listOf(
                    SwarmExperienceInsight(
                        id = "failing-strategy",
                        principle = "Exercise failure cleanup",
                        rationale = "Both variants must be removed after a verifier failure.",
                        kind = SwarmExperienceKind.STRATEGY,
                        role = null,
                        tags = emptyList(),
                        evidence = SwarmExperienceEvidence.SUCCESS,
                    )
                ),
                timestamp = Instant.fromEpochMilliseconds(1_000),
            )
            val evolutionStore = SwarmEvolutionStore(directory.resolve("evolution.json").toFile()).also { it.load() }
            val treatmentStarted = CompletableDeferred<Unit>()
            val verifier = object : SwarmEvaluationVerifier {
                override fun environmentFingerprint(revision: String, command: List<String>): String = "unused"

                override suspend fun verify(workspace: File, command: List<String>): SwarmVerificationResult {
                    return when (File(workspace, "result.txt").readText().trim()) {
                        "control" -> {
                            treatmentStarted.await()
                            error("control verifier infrastructure failed")
                        }
                        "treatment" -> {
                            treatmentStarted.complete(Unit)
                            awaitCancellation()
                        }
                        else -> error("unexpected workspace state")
                    }
                }
            }
            val replayer = DefaultSwarmCounterfactualReplayer(
                experienceStore = experienceStore,
                evolutionStore = evolutionStore,
                workspaceManager = GitWorktreeEvaluationWorkspaceManager(repository, worktreeRoot),
                verifier = verifier,
            )

            val failure = runCatching {
                replayer.replay(
                    SwarmCounterfactualReplayRequest(
                        experienceId = "failing-strategy",
                        repositoryRevision = revision,
                        taskFingerprint = "failure-cleanup-v1",
                        controlPatch = patch("control"),
                        treatmentPatch = patch("treatment"),
                        verifierCommand = listOf("./verify"),
                    )
                )
            }.exceptionOrNull()

            assertIs<IllegalStateException>(failure)
            assertEquals("control verifier infrastructure failed", failure.message)
            assertTrue(evolutionStore.evaluations.value.isEmpty())
            assertTrue(worktreeRoot.listFiles().orEmpty().isEmpty())
            assertFalse(git(repository, "worktree", "list", "--porcelain").contains("eval-"))
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun patch(value: String): String = """
        diff --git a/result.txt b/result.txt
        index df967b9..0000000 100644
        --- a/result.txt
        +++ b/result.txt
        @@ -1 +1 @@
        -base
        +$value
    """.trimIndent() + "\n"

    private fun git(directory: File, vararg arguments: String): String {
        val process = ProcessBuilder(listOf("git") + arguments)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        check(process.waitFor() == 0) { "git ${arguments.joinToString(" ")} failed: $output" }
        return output
    }
}
