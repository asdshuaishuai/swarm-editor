package com.swarmeditor.backend.model

import com.swarmeditor.backend.service.ModelService
import com.swarmeditor.common.model.AgentModelSelectionStrategy
import com.swarmeditor.common.model.AgentThinkingLevel
import com.swarmeditor.common.model.ModelConfig
import com.swarmeditor.common.model.SwarmAgentRole
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

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
