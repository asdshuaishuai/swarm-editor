package com.swarmeditor.backend.skill

import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SkillScannerTest {
    @Test
    fun `scans nested user roots and keeps the highest priority duplicate`() = runTest {
        val directory = createTempDirectory("skill-roots-").toFile()
        try {
            val swarmRoot = File(directory, "swarm").apply { mkdirs() }
            val agentsRoot = File(directory, "agents").apply { mkdirs() }
            createSkill(swarmRoot, "review", "Swarm review")
            createSkill(File(agentsRoot, "nested"), "review", "Other review")
            createSkill(File(agentsRoot, "nested"), "release", "Release skill")

            val scanner = SkillScanner(
                listOf(
                    UserSkillRoot("swarm", swarmRoot),
                    UserSkillRoot("agents", agentsRoot)
                ).map(UserSkillRoot::directory)
            )
            val skills = scanner.scanGlobal()

            assertEquals(listOf("review", "release"), skills.map { it.name })
            assertEquals("Swarm review", skills.first().description)
            assertTrue(skills.all { "discovered:user" in it.tags })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `invalid and oversized skill definitions do not block valid skills`() = runTest {
        val directory = createTempDirectory("skill-invalid-").toFile()
        try {
            val root = File(directory, "skills").apply { mkdirs() }
            createSkill(root, "valid", "Valid skill")
            File(root, "invalid").apply {
                mkdirs()
                resolve("SKILL.md").writeBytes(
                    byteArrayOf('{'.code.toByte(), '"'.code.toByte(), 0xC3.toByte(), 0x28)
                )
            }
            File(root, "oversized").apply {
                mkdirs()
                resolve("SKILL.md").writeText("x".repeat(1_000))
            }
            val scanner = SkillScanner(
                globalPaths = listOf(root),
                maxMetadataBytes = 256,
            )

            val skills = scanner.scanGlobal()

            assertEquals(listOf("valid"), skills.map { it.name })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `root symlinks are supported while child symlinks cannot escape the root`() = runTest {
        val directory = createTempDirectory("skill-links-").toFile()
        try {
            val realRoot = File(directory, "real-root").apply { mkdirs() }
            val local = createSkill(realRoot, "local", "Local skill")
            val outsideRoot = File(directory, "outside").apply { mkdirs() }
            createSkill(outsideRoot, "external", "External skill")
            File(outsideRoot, "secret.txt").writeText("secret")
            val rootLink = File(directory, "skills-link")
            try {
                Files.createSymbolicLink(rootLink.toPath(), realRoot.toPath())
                Files.createSymbolicLink(File(realRoot, "external-link").toPath(), outsideRoot.toPath())
                Files.createSymbolicLink(File(local, "escape").toPath(), outsideRoot.toPath())
            } catch (_: IOException) {
                return@runTest
            } catch (_: UnsupportedOperationException) {
                return@runTest
            } catch (_: SecurityException) {
                return@runTest
            }

            val skills = SkillScanner(listOf(rootLink)).scanGlobal()

            assertEquals(listOf("local"), skills.map { it.name })
            val files = skills.single().files
            assertTrue("escape/" in files)
            assertFalse(files.any { it.endsWith("secret.txt") })
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun createSkill(root: File, name: String, description: String): File = File(root, name).apply {
        mkdirs()
        resolve("SKILL.md").writeText(
            """
            ---
            name: $name
            description: $description
            ---
            Instructions for $name.
            """.trimIndent()
        )
    }
}
