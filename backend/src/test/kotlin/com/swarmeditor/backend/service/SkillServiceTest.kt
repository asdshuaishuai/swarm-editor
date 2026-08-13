package com.swarmeditor.backend.service

import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.skill.SyncMethod
import com.swarmeditor.backend.skill.ProjectSkillScanner
import com.swarmeditor.backend.skill.ProjectSkillTrustStore
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import kotlinx.coroutines.test.runTest
import java.io.File
import java.io.IOException
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SkillServiceTest {
    @Test
    fun `project skills require trust before synchronization and revoke removes them`() = runTest {
        val root = createTempDirectory("project-skill-service-").toFile()
        try {
            val projectSkill = createSkill(File(root, ".agents/skills"), "review")
            val piSkills = File(root, "agent/skills")
            val trustStore = ProjectSkillTrustStore(File(root, "project-skill-trust.json"))
            var invalidations = 0
            val service = SkillService(
                store = SkillStore(File(root, "skills.json")),
                scanner = SkillScanner(listOf(File(root, "global-skills"))),
                agentDirectoryProvider = { File(root, "agent") },
                invalidateAllRuntimes = { invalidations += 1 },
                projectRoot = root,
                projectScanner = ProjectSkillScanner(),
                projectTrustStore = trustStore,
            )

            service.scan().getOrThrow()
            assertEquals(SkillSource.PROJECT_FILESYSTEM, service.getAll().single().source)
            service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            assertFalse(File(piSkills, "review").exists())

            val trusted = service.trustProjectSkills().getOrThrow()
            assertTrue(trusted.trusted)
            service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            assertTrue(File(piSkills, "review/SKILL.md").isFile)

            service.revokeProjectSkillTrust().getOrThrow()
            service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            assertFalse(File(piSkills, "review").exists())
            assertEquals(3, invalidations)
            assertTrue(projectSkill.resolve("SKILL.md").isFile)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `scan synchronizes additions file structure and removals`() = runTest {
        val root = createTempDirectory("skills-scan-").toFile()
        try {
            val skillsDirectory = File(root, "skills").apply { mkdirs() }
            val review = File(skillsDirectory, "review").apply { mkdirs() }
            File(review, "SKILL.md").writeText("# Review\n\nReview repository changes.")
            File(review, "references/checklist.md").apply {
                parentFile.mkdirs()
                writeText("Checklist")
            }
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:stale",
                    name = "stale",
                    source = SkillSource.FILESYSTEM,
                    path = File(skillsDirectory, "stale").absolutePath
                )
            )
            val service = SkillService(
                store,
                SkillScanner(listOf(skillsDirectory)),
                root.absolutePath,
                File(root, "pi-skills").absolutePath
            )

            assertTrue(service.scan().isSuccess)

            val skills = service.getAll()
            assertEquals(listOf("fs:review"), skills.map { it.id })
            assertTrue("SKILL.md" in skills.single().files)
            assertTrue("references/checklist.md" in skills.single().files)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `scan preserves per-agent authorization for unchanged skills`() = runTest {
        val root = createTempDirectory("skills-preserve-").toFile()
        try {
            val skillsDirectory = File(root, "skills")
            val review = createSkill(skillsDirectory, "review")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = review.absolutePath,
                    enabledAgents = mapOf("pi-review" to true)
                )
            )
            val service = SkillService(store, SkillScanner(listOf(skillsDirectory)))

            service.scan().getOrThrow()

            assertEquals(mapOf("pi-review" to true), service.getAll().single().enabledAgents)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `copy synchronization writes selected skills into pi directory`() = runTest {
        val root = createTempDirectory("skills-root-").toFile()
        val piSkills = File(root, "pi-skills")
        val source = File(root, "skills/review").apply { mkdirs() }
        File(source, "SKILL.md").writeText("# Review")
        val service = SkillService(
            SkillStore(File(root, "skills.json")),
            SkillScanner(),
            root.absolutePath,
            piSkills.absolutePath
        )

        service.syncSkillsToPi(listOf("review"), SyncMethod.Copy)

        assertTrue(File(piSkills, "review/SKILL.md").isFile)
        assertEquals(listOf("review"), service.scanPiSkills())
        root.deleteRecursively()
    }

    @Test
    fun `agent synchronization installs only skills authorized for that profile`() = runTest {
        val root = createTempDirectory("skills-agent-").toFile()
        try {
            val sourceDirectory = File(root, "skills")
            val shared = createSkill(sourceDirectory, "shared")
            val reviewer = createSkill(sourceDirectory, "reviewer")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:shared",
                    name = "shared",
                    source = SkillSource.FILESYSTEM,
                    path = shared.absolutePath
                )
            )
            store.upsert(
                SkillConfig(
                    id = "fs:reviewer",
                    name = "reviewer",
                    source = SkillSource.FILESYSTEM,
                    path = reviewer.absolutePath,
                    enabledAgents = mapOf("pi-default" to false)
                )
            )
            val agentsRoot = File(root, "agents")
            val service = SkillService(
                store = store,
                scanner = SkillScanner(listOf(sourceDirectory)),
                agentDirectoryProvider = { id -> File(agentsRoot, id) }
            )

            service.syncSkillsToPi("pi-default", SyncMethod.Copy)

            assertTrue(File(agentsRoot, "pi-default/skills/shared/SKILL.md").isFile)
            assertFalse(File(agentsRoot, "pi-default/skills/reviewer").exists())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `dynamic profile synchronization uses its own authorization`() = runTest {
        val root = createTempDirectory("skills-dynamic-agent-").toFile()
        try {
            val sourceDirectory = File(root, "skills")
            val reviewer = createSkill(sourceDirectory, "reviewer")
            val defaultOnly = createSkill(sourceDirectory, "default-only")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:reviewer",
                    name = "reviewer",
                    source = SkillSource.FILESYSTEM,
                    path = reviewer.absolutePath,
                    enabledAgents = mapOf("pi-default" to false, "pi-review" to true),
                )
            )
            store.upsert(
                SkillConfig(
                    id = "fs:default-only",
                    name = "default-only",
                    source = SkillSource.FILESYSTEM,
                    path = defaultOnly.absolutePath,
                    enabledAgents = mapOf("pi-default" to true, "pi-review" to false),
                )
            )
            val agentsRoot = File(root, "agents")
            val service = SkillService(
                store = store,
                scanner = SkillScanner(listOf(sourceDirectory)),
                agentDirectoryProvider = { id -> File(agentsRoot, id) },
                agentIdsProvider = { listOf("pi-default", "pi-review") },
            )

            service.syncSkillsToPi("pi-review", SyncMethod.Copy)

            assertTrue(File(agentsRoot, "pi-review/skills/reviewer/SKILL.md").isFile)
            assertFalse(File(agentsRoot, "pi-review/skills/default-only").exists())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `disabling dynamic profile access invalidates only that runtime`() = runTest {
        val root = createTempDirectory("skills-access-").toFile()
        try {
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = createSkill(File(root, "skills"), "review").absolutePath
                )
            )
            val invalidated = mutableListOf<String>()
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentIdsProvider = { listOf("pi-default", "pi-review") },
                invalidateAgentRuntime = invalidated::add
            )

            service.toggleAgent("fs:review", "pi-review", false).getOrThrow()

            val access = service.getAll().single().enabledAgents
            assertEquals(mapOf("pi-default" to true, "pi-review" to false), access)
            assertEquals(listOf("pi-review"), invalidated)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `synchronization rejects skill names that escape the pi skills directory`() = runTest {
        val root = createTempDirectory("skills-path-").toFile()
        try {
            val outside = createSkill(root, "outside")
            val piSkills = createSkill(File(root, "agent/skills"), "existing")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:escape",
                    name = "../escape",
                    source = SkillSource.FILESYSTEM,
                    path = outside.absolutePath
                )
            )
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") }
            )

            assertFailsWith<IllegalArgumentException> {
                service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            }
            assertFalse(File(root, "escape").exists())
            assertTrue(File(piSkills, "SKILL.md").isFile)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `synchronization removes stale pi skill when its source disappears`() = runTest {
        val root = createTempDirectory("skills-stale-source-").toFile()
        try {
            val piSkills = File(root, "agent/skills")
            createSkill(piSkills, "stale")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:stale",
                    name = "stale",
                    source = SkillSource.FILESYSTEM,
                    path = File(root, "missing/stale").absolutePath,
                )
            )
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
            )

            service.syncSkillsToPi("pi-default", SyncMethod.Copy)

            assertFalse(File(piSkills, "stale").exists())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `synchronization rejects non portable and case colliding skill names before cleanup`() = runTest {
        val root = createTempDirectory("skills-portable-name-").toFile()
        try {
            val piSkills = File(root, "agent/skills")
            createSkill(piSkills, "existing")
            val sourceRoot = File(root, "sources")
            val review = createSkill(sourceRoot, "review")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:upper",
                    name = "Review",
                    source = SkillSource.FILESYSTEM,
                    path = review.absolutePath,
                )
            )
            store.upsert(
                SkillConfig(
                    id = "fs:lower",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = review.absolutePath,
                )
            )
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
            )

            assertFailsWith<IllegalArgumentException> {
                service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            }
            assertTrue(File(piSkills, "existing/SKILL.md").isFile)

            val invalidStore = SkillStore(File(root, "invalid-skills.json"))
            invalidStore.upsert(
                SkillConfig(
                    id = "fs:reserved",
                    name = "CON",
                    source = SkillSource.FILESYSTEM,
                    path = review.absolutePath,
                )
            )
            val invalidService = SkillService(
                store = invalidStore,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
            )
            assertFailsWith<IllegalArgumentException> {
                invalidService.syncSkillsToPi("pi-default", SyncMethod.Copy)
            }
            assertTrue(File(piSkills, "existing/SKILL.md").isFile)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `synchronization keeps the previous installation when staging fails`() = runTest {
        val root = createTempDirectory("skills-stage-failure-").toFile()
        try {
            val piSkills = File(root, "agent/skills")
            val existingReview = createSkill(piSkills, "review")
            val existingTest = createSkill(piSkills, "test")
            File(existingReview, "SKILL.md").writeText("old review")
            File(existingTest, "SKILL.md").writeText("old test")

            val sourceRoot = File(root, "sources")
            val review = createSkill(sourceRoot, "review")
            val test = createSkill(sourceRoot, "test")
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = review.absolutePath,
                )
            )
            store.upsert(
                SkillConfig(
                    id = "fs:test",
                    name = "test",
                    source = SkillSource.FILESYSTEM,
                    path = test.absolutePath,
                )
            )
            var installCount = 0
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
                skillInstaller = { _, destination, _ ->
                    installCount += 1
                    destination.mkdirs()
                    File(destination, "SKILL.md").writeText("new ${destination.name}")
                    if (installCount == 2) error("staging failed")
                },
            )

            assertFailsWith<IllegalStateException> {
                service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            }

            assertEquals("old review", File(existingReview, "SKILL.md").readText())
            assertEquals("old test", File(existingTest, "SKILL.md").readText())
            assertFalse(File(root, "agent").listFiles().orEmpty().any { it.name.startsWith(".skills.sync-") })
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `copy synchronization rejects symbolic links without replacing the installed skill`() = runTest {
        val root = createTempDirectory("skills-copy-symlink-").toFile()
        try {
            val piSkills = File(root, "agent/skills")
            val existing = createSkill(piSkills, "review")
            File(existing, "SKILL.md").writeText("old review")
            val source = createSkill(File(root, "sources"), "review")
            try {
                java.nio.file.Files.createSymbolicLink(
                    File(source, "outside-link").toPath(),
                    File(root, "outside").toPath(),
                )
            } catch (_: IOException) {
                return@runTest
            } catch (_: UnsupportedOperationException) {
                return@runTest
            } catch (_: SecurityException) {
                return@runTest
            }
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = source.absolutePath,
                )
            )
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
            )

            assertFailsWith<IllegalArgumentException> {
                service.syncSkillsToPi("pi-default", SyncMethod.Copy)
            }

            assertEquals("old review", File(existing, "SKILL.md").readText())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `failed symlink staging cleanup does not delete the source skill`() = runTest {
        val root = createTempDirectory("skills-symlink-cleanup-").toFile()
        try {
            val piSkills = File(root, "agent/skills")
            val existing = createSkill(piSkills, "review")
            File(existing, "SKILL.md").writeText("old review")
            val source = createSkill(File(root, "sources"), "review")
            val probe = File(root, "symlink-probe")
            try {
                java.nio.file.Files.createSymbolicLink(probe.toPath(), source.toPath())
                java.nio.file.Files.delete(probe.toPath())
            } catch (_: IOException) {
                return@runTest
            } catch (_: UnsupportedOperationException) {
                return@runTest
            } catch (_: SecurityException) {
                return@runTest
            }
            val store = SkillStore(File(root, "skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = source.absolutePath,
                )
            )
            val service = SkillService(
                store = store,
                scanner = SkillScanner(),
                agentDirectoryProvider = { File(root, "agent") },
                skillInstaller = { skillSource, destination, _ ->
                    java.nio.file.Files.createSymbolicLink(destination.toPath(), skillSource.toPath())
                    error("staging failed")
                },
            )

            assertFailsWith<IllegalStateException> {
                service.syncSkillsToPi("pi-default", SyncMethod.Symlink)
            }

            assertTrue(File(source, "SKILL.md").isFile)
            assertEquals("old review", File(existing, "SKILL.md").readText())
        } finally {
            root.deleteRecursively()
        }
    }
}

private fun createSkill(parent: File, name: String): File = File(parent, name).apply {
    mkdirs()
    resolve("SKILL.md").writeText(
        """
        ---
        name: $name
        description: $name skill
        ---
        Use this skill for $name tasks.
        """.trimIndent()
    )
}
