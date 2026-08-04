package com.swarmeditor.backend.agent

import com.swarmeditor.common.model.AgentConfig
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentRegistryTest {
    @Test
    fun `empty registry creates and persists default pi profile`() = runTest {
        val directory = createTempDirectory("agent-registry-").toFile()
        val configFile = File(directory, "agents.json")
        val registry = AgentRegistry(configFile)

        registry.load()

        assertNotNull(registry.getConfig(AgentRegistry.DEFAULT_AGENT_ID))
        assertEquals(1, registry.getAllConfigs().size)
        assertNotNull(configFile.takeIf { it.isFile })
        directory.deleteRecursively()
    }

    @Test
    fun `primary model selection survives reload`() = runTest {
        val directory = createTempDirectory("agent-registry-").toFile()
        val configFile = File(directory, "agents.json")
        AgentRegistry(configFile).apply {
            load()
            upsert(
                AgentConfig(
                    id = AgentRegistry.DEFAULT_AGENT_ID,
                    name = "Custom name",
                    systemPrompt = "Review carefully",
                    modelConfigId = "review-model",
                )
            )
        }

        val reloaded = AgentRegistry(configFile).apply { load() }

        val config = reloaded.getConfig(AgentRegistry.DEFAULT_AGENT_ID)
        assertEquals("review-model", config?.modelConfigId)
        assertEquals("Pi 主智能体", config?.name)
        assertEquals("", config?.systemPrompt)
        assertTrue("primaryModelConfigId" in configFile.readText())
        assertTrue("Custom name" !in configFile.readText())
        assertTrue("\"agents\"" !in configFile.readText())
        directory.deleteRecursively()
    }

    @Test
    fun `static subagent profiles are rejected`() = runTest {
        val directory = createTempDirectory("agent-delete-").toFile()
        val configFile = File(directory, "agents.json")
        val registry = AgentRegistry(configFile)
        registry.load()

        assertFailsWith<IllegalArgumentException> {
            registry.upsert(AgentConfig(id = "pi-reviewer", name = "Reviewer"))
        }
        assertEquals(listOf(AgentRegistry.DEFAULT_AGENT_ID), registry.getAllConfigs().map { it.id })
        directory.deleteRecursively()
    }

    @Test
    fun `invalid profile ids are rejected`() = runTest {
        val directory = createTempDirectory("agent-invalid-").toFile()
        val registry = AgentRegistry(File(directory, "agents.json")).apply { load() }

        assertFailsWith<IllegalArgumentException> {
            registry.upsert(AgentConfig("profile with spaces", "Invalid"))
        }

        directory.deleteRecursively()
    }

    @Test
    fun `legacy cli agents are replaced by the single pi profile`() = runTest {
        val directory = createTempDirectory("agent-legacy-").toFile()
        val configFile = File(directory, "agents.json").apply {
            writeText(
                """
                {
                  "agents": [
                    {"id":"claude-code","name":"Claude Code","command":"claude"},
                    {"id":"qwen-code","name":"Qwen Code","command":"qwen"}
                  ]
                }
                """.trimIndent()
            )
        }

        val registry = AgentRegistry(configFile).apply { load() }

        assertEquals(listOf(AgentRegistry.DEFAULT_AGENT_ID), registry.getAllConfigs().map { it.id })
        assertEquals("Pi 主智能体", registry.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.name)
        assertTrue("claude-code" !in configFile.readText())
        assertTrue("primaryModelConfigId" in configFile.readText())
        directory.deleteRecursively()
    }

    @Test
    fun `malformed profile file is quarantined and replaced with the default profile`() = runTest {
        val directory = createTempDirectory("agent-malformed-").toFile()
        val configFile = File(directory, "agents.json").apply { writeText("not json") }
        val registry = AgentRegistry(configFile)

        registry.load()

        assertEquals(listOf(AgentRegistry.DEFAULT_AGENT_ID), registry.getAllConfigs().map { it.id })
        assertTrue(configFile.isFile)
        assertTrue("primaryModelConfigId" in configFile.readText())
        val quarantined = directory.listFiles().orEmpty().single { it.name.startsWith("agents.json.corrupt-") }
        assertEquals("not json", quarantined.readText())
        directory.deleteRecursively()
    }

    @Test
    fun `future profile schema is rejected without quarantine or overwrite`() = runTest {
        val directory = createTempDirectory("agent-future-schema-").toFile()
        try {
            val content = """{"schemaVersion":999,"agents":[]}"""
            val configFile = File(directory, "agents.json").apply { writeText(content) }
            val registry = AgentRegistry(configFile)

            assertFailsWith<IllegalArgumentException> { registry.load() }

            assertEquals(content, configFile.readText())
            assertFalse(directory.listFiles().orEmpty().any { it.name.startsWith("agents.json.corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `oversized profile update rolls back memory and disk`() = runTest {
        val directory = createTempDirectory("agent-size-").toFile()
        try {
            val configFile = File(directory, "agents.json")
            val registry = AgentRegistry(configFile, maxFileBytes = 2_048).apply { load() }
            val before = configFile.readText()

            assertFailsWith<IllegalArgumentException> {
                registry.upsert(AgentConfig("reviewer", "Reviewer", description = "x".repeat(5_000)))
            }

            assertEquals(listOf(AgentRegistry.DEFAULT_AGENT_ID), registry.getAllConfigs().map { it.id })
            assertEquals(before, configFile.readText())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `failed profile write cannot roll back a concurrent successful update`() = runTest {
        val directory = createTempDirectory("agent-concurrent-").toFile()
        try {
            val firstWriteStarted = CompletableDeferred<Unit>()
            val releaseFirstWrite = CompletableDeferred<Unit>()
            var writeCount = 0
            val registry = AgentRegistry(File(directory, "agents.json")) {
                writeCount++
                when (writeCount) {
                    1 -> Unit
                    2 -> {
                        firstWriteStarted.complete(Unit)
                        releaseFirstWrite.await()
                        error("disk full")
                    }
                }
            }
            registry.load()
            val failedUpdate = backgroundScope.async {
                try {
                    registry.upsert(AgentRegistry.defaultConfig().copy(modelConfigId = "first"))
                    false
                } catch (_: IllegalStateException) {
                    true
                }
            }
            firstWriteStarted.await()
            val successfulUpdate = backgroundScope.async {
                registry.upsert(AgentRegistry.defaultConfig().copy(modelConfigId = "second"))
            }
            yield()
            assertEquals(2, writeCount)

            releaseFirstWrite.complete(Unit)
            assertTrue(failedUpdate.await())
            successfulUpdate.await()

            assertEquals("second", registry.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
        } finally {
            directory.deleteRecursively()
        }
    }
}
