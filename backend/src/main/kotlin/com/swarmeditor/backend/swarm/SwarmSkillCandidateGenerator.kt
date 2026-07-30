package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmExperienceEvaluation
import com.swarmeditor.common.model.SwarmSkillCandidate
import com.swarmeditor.common.model.SwarmSkillCandidateStatus
import java.util.UUID
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock

fun interface SwarmSkillCandidateGenerator {
    suspend fun generate(experienceId: String): SwarmSkillCandidate
}

class PiSwarmSkillCandidateGenerator(
    private val sessions: PiSessionProvider,
    private val experienceStore: SwarmExperienceStore,
    private val evolutionStore: SwarmEvolutionStore,
    private val availableAgents: suspend () -> List<AgentConfig>,
    private val isConfigCurrent: suspend (AgentConfig) -> Boolean = { true },
    private val promotionPolicy: SwarmPromotionPolicy = SwarmPromotionPolicy(),
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) : SwarmSkillCandidateGenerator {
    override suspend fun generate(experienceId: String): SwarmSkillCandidate {
        val experience = checkNotNull(experienceStore.get(experienceId)) {
            "Swarm experience not found: $experienceId"
        }
        val assessment = evolutionStore.assessPromotion(experience, promotionPolicy)
        require(assessment.eligible) {
            "Swarm experience is not eligible for Skill generation: ${assessment.reasons.joinToString("; ")}"
        }
        evolutionStore.candidateForExperience(experienceId)?.let { existing ->
            if (existing.evaluationIds == assessment.evaluationIds && existing.status != SwarmSkillCandidateStatus.REJECTED) {
                return existing
            }
        }
        val agents = availableAgents()
        require(agents.isNotEmpty()) { "No connected Pi Agent Profile is available for Skill generation" }
        val baseConfig = selectCuratorConfig(agents)
        val config = buildSwarmTaskAgentConfig(baseConfig, SwarmAgentRole.INTEGRATOR)
        val evaluations = evolutionStore.evaluationsForExperience(experienceId)
        val sessionId = "swarm-skill:${experience.id}:${UUID.randomUUID().toString().take(8)}"
        val session = sessions.getOrCreateValidated(
            sessionId = sessionId,
            config = config,
            remoteSessionId = null,
            isConfigCurrent = { isConfigCurrent(baseConfig) },
        )
        var primaryFailure: Throwable? = null
        try {
            val document = parseSkillCandidateDocument(session.prompt(buildPrompt(experience, assessment, evaluations)))
            val timestamp = now()
            return evolutionStore.upsertCandidate(
                SwarmSkillCandidate(
                    id = "candidate-${experience.id}-${UUID.randomUUID().toString().take(8)}",
                    experienceId = experience.id,
                    name = document.name,
                    description = document.description,
                    markdown = buildSkillMarkdown(document),
                    status = SwarmSkillCandidateStatus.DRAFT,
                    evaluationIds = assessment.evaluationIds,
                    createdAt = timestamp,
                    updatedAt = timestamp,
                )
            )
        } catch (error: Throwable) {
            primaryFailure = error
            throw error
        } finally {
            try {
                withContext(NonCancellable) { sessions.close(sessionId) }
            } catch (closeError: Throwable) {
                val primary = primaryFailure
                if (primary != null) primary.addSuppressed(closeError) else throw closeError
            }
        }
    }

    private fun selectCuratorConfig(agents: List<AgentConfig>): AgentConfig =
        agents.firstOrNull { it.hasRoleTag(SwarmAgentRole.INTEGRATOR) }
            ?: agents.firstOrNull { it.hasRoleTag(SwarmAgentRole.REVIEWER) }
            ?: agents.firstOrNull { it.hasRoleTag(SwarmAgentRole.PLANNER) }
            ?: agents.first()

    private fun buildPrompt(
        experience: com.swarmeditor.common.model.SwarmExperience,
        assessment: SwarmPromotionAssessment,
        evaluations: List<SwarmExperienceEvaluation>,
    ): String = buildString {
        appendLine("Create a candidate Pi Agent Skill from a causally evaluated swarm experience.")
        appendLine("The candidate remains disabled until separate Skill-level validation; do not claim broader evidence.")
        appendLine()
        appendLine("Experience id: ${experience.id}")
        appendLine("Kind: ${experience.kind}")
        appendLine("Role: ${experience.role ?: "ALL"}")
        appendLine("Principle: ${experience.principle}")
        appendLine("Rationale: ${experience.rationale}")
        appendLine("Tags: ${experience.tags.joinToString(", ")}")
        appendLine(
            "Observed uses: success=${experience.successfulUses}, recovered=${experience.recoveredUses}, " +
                "failure=${experience.failedUses}"
        )
        appendLine(
            "Controlled evaluation: cases=${assessment.evaluationIds.size}, tasks=${assessment.distinctTasks}, " +
                "environments=${assessment.distinctEnvironments}, wins=${assessment.treatmentWins}, " +
                "regressions=${assessment.regressions}, " +
                "medianQualityDelta=${assessment.medianQualityDelta}"
        )
        appendLine()
        appendLine("Evaluation evidence:")
        evaluations.forEach { evaluation ->
            appendLine(
                "- ${evaluation.taskFingerprint} @ ${evaluation.environmentFingerprint}: " +
                    "control(pass=${evaluation.control.passed}, quality=${evaluation.control.qualityScore}) -> " +
                    "treatment(pass=${evaluation.treatment.passed}, quality=${evaluation.treatment.qualityScore})"
            )
        }
        appendLine()
        appendLine("Return JSON only:")
        appendLine(
            """{"name":"trace-data-flow","description":"Use when reviewing state propagation across UI, services, and persistence.","instructions":"# Trace Data Flow\n\n## Procedure\n..."}"""
        )
        appendLine("Rules:")
        appendLine("- name must be lowercase words separated by single hyphens.")
        appendLine("- description must state when to use the Skill in 1-2 sentences.")
        appendLine("- instructions must be actionable Markdown with scope, procedure, verification, and stop conditions.")
        appendLine("- Preserve repository instructions, cancellation, security, and human approval boundaries.")
        appendLine("- Do not include YAML frontmatter; it is added deterministically after validation.")
    }
}

@Serializable
internal data class SkillCandidateDocument(
    val name: String,
    val description: String,
    val instructions: String,
)

internal fun parseSkillCandidateDocument(response: String): SkillCandidateDocument {
    val document = skillCandidateJson.decodeFromString<SkillCandidateDocument>(extractJsonObject(response))
    val name = document.name.trim()
    val description = document.description.trim()
    val instructions = document.instructions.trim()
    require(name.matches(skillNamePattern)) { "Invalid Pi Skill name: $name" }
    require(name.length <= MAX_SKILL_NAME_LENGTH) { "Pi Skill name is too long" }
    require(description.isNotBlank() && description.length <= MAX_SKILL_DESCRIPTION_LENGTH) {
        "Invalid Pi Skill description"
    }
    require('\n' !in description && '\r' !in description) { "Pi Skill description must be a single line" }
    require(instructions.isNotBlank() && instructions.length <= MAX_SKILL_INSTRUCTIONS_LENGTH) {
        "Invalid Pi Skill instructions"
    }
    require(!instructions.startsWith("---")) { "Pi Skill instructions must not include YAML frontmatter" }
    return SkillCandidateDocument(name, description, instructions)
}

private fun buildSkillMarkdown(document: SkillCandidateDocument): String = buildString {
    appendLine("---")
    appendLine("name: ${document.name}")
    appendLine("description: \"${document.description.escapeYamlDoubleQuoted()}\"")
    appendLine("disable-model-invocation: true")
    appendLine("---")
    appendLine()
    appendLine(document.instructions)
}.trimEnd() + "\n"

private fun String.escapeYamlDoubleQuoted(): String = replace("\\", "\\\\").replace("\"", "\\\"")

private fun AgentConfig.hasRoleTag(role: SwarmAgentRole): Boolean =
    tags.any { it.trim().equals("role:${role.name.lowercase()}", ignoreCase = true) }

private val skillCandidateJson = Json { ignoreUnknownKeys = true }
private val skillNamePattern = Regex("[a-z0-9]+(?:-[a-z0-9]+)*")
private const val MAX_SKILL_NAME_LENGTH = 64
private const val MAX_SKILL_DESCRIPTION_LENGTH = 1_024
private const val MAX_SKILL_INSTRUCTIONS_LENGTH = 32_000
