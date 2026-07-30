package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmEvaluationMetrics
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import java.io.File
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlin.time.Clock

data class SwarmCounterfactualReplayRequest(
    val experienceId: String,
    val repositoryRevision: String,
    val taskFingerprint: String,
    val controlPatch: String,
    val treatmentPatch: String,
    val verifierCommand: List<String>,
)

fun interface SwarmCounterfactualReplayer {
    suspend fun replay(request: SwarmCounterfactualReplayRequest): SwarmExperienceEvaluation
}

class DefaultSwarmCounterfactualReplayer(
    private val experienceStore: SwarmExperienceStore,
    private val evolutionStore: SwarmEvolutionStore,
    private val workspaceManager: SwarmEvaluationWorkspaceManager,
    private val verifier: SwarmEvaluationVerifier,
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) : SwarmCounterfactualReplayer {
    override suspend fun replay(request: SwarmCounterfactualReplayRequest): SwarmExperienceEvaluation = coroutineScope {
        checkNotNull(experienceStore.get(request.experienceId)) {
            "Swarm experience not found: ${request.experienceId}"
        }
        require(request.repositoryRevision.matches(commitPattern)) { "Replay revision must be a commit hash" }
        require(request.taskFingerprint.isNotBlank()) { "Replay task fingerprint cannot be blank" }
        require(request.verifierCommand.isNotEmpty() && request.verifierCommand.none(String::isBlank)) {
            "Replay verifier command cannot be empty"
        }
        require(request.controlPatch != request.treatmentPatch) {
            "Control and treatment patches must differ"
        }
        val control = async { evaluate(request.repositoryRevision, request.controlPatch, request.verifierCommand) }
        val treatment = async { evaluate(request.repositoryRevision, request.treatmentPatch, request.verifierCommand) }
        val environmentFingerprint = verifier.environmentFingerprint(
            request.repositoryRevision,
            request.verifierCommand,
        )
        evolutionStore.recordEvaluation(
            SwarmExperienceEvaluation(
                id = "eval-${UUID.randomUUID().toString().take(12)}",
                experienceId = request.experienceId,
                taskFingerprint = request.taskFingerprint.trim(),
                environmentFingerprint = environmentFingerprint,
                control = control.await().toMetrics(),
                treatment = treatment.await().toMetrics(),
                createdAt = now(),
            )
        )
    }

    private suspend fun evaluate(
        revision: String,
        patch: String,
        verifierCommand: List<String>,
    ): SwarmVerificationResult = workspaceManager.withWorkspace(revision, patch) { workspace ->
        verifier.verify(workspace, verifierCommand)
    }
}

object SwarmCounterfactualReplayFactory {
    fun fromEnvironment(
        repositoryRoot: File,
        worktreeRoot: File,
        experienceStore: SwarmExperienceStore,
        evolutionStore: SwarmEvolutionStore,
    ): SwarmCounterfactualReplayer {
        val image = System.getenv("SWARM_EVAL_IMAGE")?.trim().orEmpty()
        if (image.isBlank()) return unavailable("SWARM_EVAL_IMAGE is not configured")
        val runtime = System.getenv("SWARM_EVAL_RUNTIME")?.trim()?.takeIf(String::isNotBlank)
            ?: findExecutable("podman")
            ?: return unavailable("No rootless Podman executable is available")
        return DefaultSwarmCounterfactualReplayer(
            experienceStore = experienceStore,
            evolutionStore = evolutionStore,
            workspaceManager = GitWorktreeEvaluationWorkspaceManager(repositoryRoot, worktreeRoot),
            verifier = RootlessContainerSwarmVerifier(runtime, image),
        )
    }

    private fun unavailable(reason: String): SwarmCounterfactualReplayer = SwarmCounterfactualReplayer {
        error("Counterfactual replay is unavailable: $reason")
    }

    private fun findExecutable(vararg names: String): String? {
        val pathEntries = System.getenv("PATH").orEmpty().split(File.pathSeparatorChar)
        return names.firstNotNullOfOrNull { name ->
            pathEntries.asSequence()
                .map { directory -> File(directory, name) }
                .firstOrNull { it.isFile && it.canExecute() }
                ?.absolutePath
        }
    }
}

private fun SwarmVerificationResult.toMetrics(): SwarmEvaluationMetrics = SwarmEvaluationMetrics(
    passed = passed,
    qualityScore = if (passed) 1.0 else 0.0,
    durationMillis = durationMillis,
)

private val commitPattern = Regex("[0-9a-fA-F]{7,40}")
