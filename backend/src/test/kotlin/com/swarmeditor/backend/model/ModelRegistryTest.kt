package com.swarmeditor.backend.model

import com.swarmeditor.backend.service.ModelService
import com.swarmeditor.common.model.AgentModelSelectionStrategy
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmModelDemand
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield

@OptIn(ExperimentalPathApi::class)
class ModelRegistryTest {
    @Test
    fun `migrates legacy primary agent model fields into the independent model pool`() = runTest {
        val directory = Files.createTempDirectory("model-migration")
        try {
            val agents = directory.resolve("agents.json")
            Files.writeString(
                agents,
                """
                {
                  "schemaVersion": 3,
                  "agents": [{
                    "id": "pi-default",
                    "name": "Pi",
                    "provider": "openai",
                    "model": "gpt-5",
                    "thinkingLevel": "HIGH",
                    "env": {"OPENAI_API_KEY": "secret"}
                  }]
                }
                """.trimIndent()
            )
            val modelsPath = directory.resolve("models.json")
            val registry = ModelRegistry(modelsPath.toFile(), agents.toFile())

            registry.load()

            val migrated = registry.getAll().single()
            assertEquals(ModelRegistry.DEFAULT_MODEL_ID, migrated.id)
            assertEquals("openai", migrated.provider)
            assertEquals("gpt-5", migrated.model)
            assertEquals(AgentThinkingLevel.HIGH, migrated.thinkingLevel)
            assertEquals("secret", migrated.env["OPENAI_API_KEY"])
            assertTrue(Files.readString(modelsPath).contains("gpt-5"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `selection excludes disabled models and is stable for the same task`() = runTest {
        val directory = Files.createTempDirectory("model-selection")
        try {
            val service = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            service.init()
            service.upsert(ModelRegistry.defaultConfig().copy(enabled = false)).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "review-a",
                    name = "Review A",
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    priority = 200,
                    maxConcurrentAgents = 1,
                )
            ).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "review-b",
                    name = "Review B",
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    priority = 200,
                    maxConcurrentAgents = 3,
                )
            ).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "disabled-best",
                    name = "Disabled",
                    enabled = false,
                    thinkingLevel = AgentThinkingLevel.XHIGH,
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    priority = 1000,
                )
            ).getOrThrow()

            val first = service.select(SwarmAgentRole.REVIEWER, AgentModelSelectionStrategy.BALANCED, "task-42")
            val second = service.select(SwarmAgentRole.REVIEWER, AgentModelSelectionStrategy.BALANCED, "task-42")

            assertEquals(first.id, second.id)
            assertTrue(first.id in setOf("review-a", "review-b"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `model allocations wait for capacity and release exactly once`() = runTest {
        val directory = Files.createTempDirectory("model-allocation")
        try {
            val service = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            service.init()
            service.upsert(ModelRegistry.defaultConfig().copy(enabled = false)).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "review-only",
                    name = "Review Only",
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    maxConcurrentAgents = 1,
                )
            ).getOrThrow()

            val first = service.acquire(SwarmAgentRole.REVIEWER, AgentModelSelectionStrategy.BALANCED, "first")
            val waiting = backgroundScope.async {
                service.acquire(SwarmAgentRole.REVIEWER, AgentModelSelectionStrategy.BALANCED, "second")
            }
            yield()

            assertFalse(waiting.isCompleted)
            assertEquals(mapOf("review-only" to 1), service.activeAllocations.value)

            first.release()
            val second = withTimeout(1_000) { waiting.await() }
            assertEquals("review-only", second.config.id)
            assertEquals(mapOf("review-only" to 1), service.activeAllocations.value)

            second.release()
            second.release()
            assertTrue(service.activeAllocations.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `balanced allocation matches task demand and falls back when preferred capacity is full`() = runTest {
        val directory = Files.createTempDirectory("model-demand-allocation")
        try {
            val service = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            service.init()
            service.upsert(ModelRegistry.defaultConfig().copy(enabled = false)).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "fast-low",
                    name = "Fast Low",
                    thinkingLevel = AgentThinkingLevel.LOW,
                    priority = 100,
                    maxConcurrentAgents = 1,
                )
            ).getOrThrow()
            service.upsert(
                ModelConfig(
                    id = "deep-high",
                    name = "Deep High",
                    thinkingLevel = AgentThinkingLevel.HIGH,
                    priority = 100,
                    roles = listOf(SwarmAgentRole.REVIEWER),
                    maxConcurrentAgents = 1,
                )
            ).getOrThrow()
            val highDemand = SwarmModelDemand(
                normalizedScore = 0.74,
                targetThinkingLevel = AgentThinkingLevel.HIGH,
                repositoryRiskScore = 0.6,
                reasons = listOf("sccFiles=5"),
            )
            val lowDemand = SwarmModelDemand(
                normalizedScore = 0.28,
                targetThinkingLevel = AgentThinkingLevel.LOW,
                repositoryRiskScore = 0.0,
            )

            val preferred = service.acquire(
                SwarmAgentRole.REVIEWER,
                AgentModelSelectionStrategy.BALANCED,
                "risky-task",
                highDemand,
            )
            val fallback = service.acquire(
                SwarmAgentRole.REVIEWER,
                AgentModelSelectionStrategy.BALANCED,
                "risky-task-2",
                highDemand,
            )
            val lowSelection = service.select(
                SwarmAgentRole.GENERAL,
                AgentModelSelectionStrategy.BALANCED,
                "small-task",
                lowDemand,
            )

            assertEquals("deep-high", preferred.config.id)
            assertEquals("fast-low", fallback.config.id)
            assertEquals("fast-low", lowSelection.id)
            assertTrue(preferred.selectionReason.orEmpty().contains("target=high"))

            fallback.release()
            preferred.release()
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `canceling a saturated demand allocation does not leak capacity`() = runTest {
        val directory = Files.createTempDirectory("model-demand-cancellation")
        try {
            val service = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            service.init()
            service.upsert(
                ModelRegistry.defaultConfig().copy(
                    maxConcurrentAgents = 1,
                    thinkingLevel = AgentThinkingLevel.HIGH,
                )
            ).getOrThrow()
            val demand = SwarmModelDemand(
                normalizedScore = 0.7,
                targetThinkingLevel = AgentThinkingLevel.HIGH,
                repositoryRiskScore = 0.5,
            )

            val active = service.acquire(
                SwarmAgentRole.GENERAL,
                AgentModelSelectionStrategy.BALANCED,
                "active",
                demand,
            )
            val waiting = backgroundScope.async {
                service.acquire(
                    SwarmAgentRole.GENERAL,
                    AgentModelSelectionStrategy.BALANCED,
                    "waiting",
                    demand,
                )
            }
            yield()

            waiting.cancelAndJoin()
            assertEquals(mapOf(active.config.id to 1), service.activeAllocations.value)

            active.release()
            assertTrue(service.activeAllocations.value.isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed runtime invalidation rolls back a model update`() = runTest {
        val directory = Files.createTempDirectory("model-rollback")
        try {
            var failInvalidation = false
            val service = ModelService(
                registry = ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                ),
                invalidateRuntimes = {
                    if (failInvalidation) error("runtime close failed")
                },
            )
            service.init()
            val original = service.get(ModelRegistry.DEFAULT_MODEL_ID)!!
            failInvalidation = true

            val result = service.upsert(original.copy(name = "Changed"))

            assertFalse(result.isSuccess)
            assertEquals(original, service.get(ModelRegistry.DEFAULT_MODEL_ID))
        } finally {
            directory.deleteRecursively()
        }
    }
}
