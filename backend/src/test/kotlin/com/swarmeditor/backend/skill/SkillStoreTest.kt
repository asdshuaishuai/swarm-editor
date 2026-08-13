package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlinx.coroutines.test.runTest

class SkillStoreTest {
    @Test
    fun `legacy agent associations migrate to pi`() = runTest {
        val directory = createTempDirectory("skill-agent-migration-").toFile()
        try {
            val store = SkillStore(File(directory, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    agentId = "claude-code",
                    enabledAgents = mapOf("claude-code" to true, "qwen-code" to false)
                )
            )

            val skill = store.getAll().single()

            assertEquals("pi-default", skill.agentId)
            assertEquals(mapOf("pi-default" to true), skill.enabledAgents)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `dynamic pi profile authorization survives persistence`() = runTest {
        val directory = createTempDirectory("skill-profile-access-").toFile()
        try {
            val file = File(directory, "skills.json")
            val expected = SkillConfig(
                id = "fs:review",
                name = "review",
                source = SkillSource.FILESYSTEM,
                enabledAgents = mapOf("pi-default" to true, "pi-review" to false),
            )

            SkillStore(file).upsert(expected)
            val reloaded = SkillStore(file).also { it.load() }.getAll().single()

            assertEquals(expected, reloaded)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `project filesystem source survives persistence`() = runTest {
        val directory = createTempDirectory("skill-project-source-").toFile()
        try {
            val expected = SkillConfig(
                id = "project:agents:review",
                name = "review",
                source = SkillSource.PROJECT_FILESYSTEM,
                scope = "project:${directory.absolutePath}",
                path = File(directory, ".agents/skills/review").absolutePath,
                tags = listOf("discovered:project"),
            )

            SkillStore(File(directory, "skills.json")).upsert(expected)
            val reloaded = SkillStore(File(directory, "skills.json")).also { it.load() }.getAll().single()

            assertEquals(expected, reloaded)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `malformed configuration is quarantined without discarding loaded skills`() = runTest {
        val directory = createTempDirectory("skill-malformed-").toFile()
        try {
            val file = File(directory, "skills.json")
            val store = SkillStore(file)
            val existing = SkillConfig(
                id = "fs:review",
                name = "review",
                source = SkillSource.FILESYSTEM,
                path = File(directory, "review").absolutePath
            )
            store.upsert(existing)
            file.writeText("not json")

            store.load()
            assertEquals(listOf(existing), store.getAll())
            assertFalse(file.exists())
            assertEquals(1, directory.listFiles().orEmpty().count { it.name.startsWith("skills.json.corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `missing configuration clears loaded skills`() = runTest {
        val directory = createTempDirectory("skill-missing-").toFile()
        try {
            val file = File(directory, "skills.json")
            val store = SkillStore(file)
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = File(directory, "review").absolutePath,
                )
            )
            file.delete()

            store.load()

            assertEquals(emptyList(), store.getAll())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `oversized skill update rolls back memory and disk`() = runTest {
        val directory = createTempDirectory("skill-size-").toFile()
        try {
            val file = File(directory, "skills.json")
            val store = SkillStore(file, maxFileBytes = 500)

            assertFailsWith<IllegalArgumentException> {
                store.upsert(
                    SkillConfig(
                        id = "fs:large",
                        name = "large",
                        description = "x".repeat(2_000),
                        source = SkillSource.FILESYSTEM,
                    )
                )
            }

            assertEquals(emptyList(), store.getAll())
            assertFalse(file.exists())
        } finally {
            directory.deleteRecursively()
        }
    }
}
