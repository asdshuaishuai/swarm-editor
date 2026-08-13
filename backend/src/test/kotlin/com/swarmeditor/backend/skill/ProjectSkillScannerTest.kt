package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillSource
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class ProjectSkillScannerTest {
    @Test
    fun `scans project skills with project source metadata`() = runTest {
        val project = createTempDirectory("project-skills-").toFile()
        try {
            val skill = File(project, ".agents/skills/review").apply { mkdirs() }
            File(skill, "SKILL.md").writeText(
                """
                ---
                name: review
                description: Reviews repository changes.
                ---
                Review the change.
                """.trimIndent()
            )

            val scanned = ProjectSkillScanner().scan(project)

            assertEquals(listOf("review"), scanned.skills.map { it.name })
            assertEquals(SkillSource.PROJECT_FILESYSTEM, scanned.skills.single().source)
            assertTrue("discovered:project" in scanned.skills.single().tags)
            assertEquals("Reviews repository changes.", scanned.skills.single().description)
        } finally {
            project.deleteRecursively()
        }
    }

    @Test
    fun `skill content changes produce a different project fingerprint`() = runTest {
        val project = createTempDirectory("project-skill-fingerprint-").toFile()
        try {
            val skill = File(project, ".agents/skills/review").apply { mkdirs() }
            val definition = File(skill, "SKILL.md")
            definition.writeText("# Review\n\nFirst version")

            val scanner = ProjectSkillScanner()
            val first = scanner.scan(project).fingerprint
            definition.appendText("\nSecond version")
            val second = scanner.scan(project).fingerprint

            assertNotEquals(first, second)
        } finally {
            project.deleteRecursively()
        }
    }

    @Test
    fun `project skill symlinks cannot escape the project`() = runTest {
        val project = createTempDirectory("project-skill-links-").toFile()
        val outside = createTempDirectory("outside-project-skill-").toFile()
        try {
            val externalSkill = File(outside, "external").apply { mkdirs() }
            File(externalSkill, "SKILL.md").writeText("# External")
            val skillsRoot = File(project, ".agents/skills").apply { mkdirs() }
            try {
                Files.createSymbolicLink(
                    File(skillsRoot, "external").toPath(),
                    externalSkill.toPath(),
                )
            } catch (_: IOException) {
                return@runTest
            } catch (_: UnsupportedOperationException) {
                return@runTest
            }

            val scanned = ProjectSkillScanner().scan(project)

            assertFalse(scanned.skills.any { it.name == "external" })
        } finally {
            project.deleteRecursively()
            outside.deleteRecursively()
        }
    }
}
