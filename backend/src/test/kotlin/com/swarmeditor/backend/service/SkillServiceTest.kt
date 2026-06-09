package com.swarmeditor.backend.service

import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.backend.agent.ProviderPreset
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.skill.SyncMethod
import com.swarmeditor.common.model.AgentType
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import java.io.File
import java.nio.file.Files
import org.junit.After
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SkillServiceTest {

    private val tempDirs = mutableListOf<File>()

    @After
    fun cleanup() {
        tempDirs.forEach { it.deleteRecursively() }
        tempDirs.clear()
    }

    private fun createService(adapter: AgentAdapter? = null, skillsRootPath: String? = null): SkillService {
        val store = mockk<SkillStore>(relaxed = true)
        val scanner = mockk<SkillScanner>(relaxed = true)
        return SkillService(store, scanner, { adapter }, skillsRootPath ?: ConfigPaths.SWARM_EDITOR_DIR)
    }

    private fun mockAdapter(skillsDir: String): AgentAdapter {
        return mockk<AgentAdapter>(relaxed = true).apply {
            every { skillsDirectory } returns skillsDir
            every { providerPresets } returns emptyList()
        }
    }

    private fun createTempDir(prefix: String = "skill-test"): File {
        val dir = Files.createTempDirectory(prefix).toFile()
        tempDirs.add(dir)
        return dir
    }

    // ── scanAgentSkills ──────────────────────────────────────────────

    @Test
    fun `scanAgentSkills returns directory names from adapter skillsDirectory`() = runTest {
        val tempDir = createTempDir("scan")
        File(tempDir, "skill-a").mkdirs()
        File(tempDir, "skill-b").mkdirs()
        // Place a regular file — should NOT be included
        File(tempDir, "not-a-dir.txt").createNewFile()

        val adapter = mockAdapter(tempDir.absolutePath)
        val service = createService(adapter)

        val result = service.scanAgentSkills(AgentType.CLAUDE_CODE)

        assertEquals(setOf("skill-a", "skill-b"), result.toSet())
    }

    @Test
    fun `scanAgentSkills returns empty list when adapter is null`() = runTest {
        val service = createService(null)

        val result = service.scanAgentSkills(AgentType.CLAUDE_CODE)

        assertTrue(result.isEmpty())
    }

    @Test
    fun `scanAgentSkills returns empty list when directory does not exist`() = runTest {
        val adapter = mockAdapter("/nonexistent/path/skills")
        val service = createService(adapter)

        val result = service.scanAgentSkills(AgentType.CLAUDE_CODE)

        assertTrue(result.isEmpty())
    }

    // ── syncSkillsToAgent (Copy) ─────────────────────────────────────

    @Test
    fun `syncSkillsToAgent with Copy creates physical copies`() = runTest {
        val fakeHome = createTempDir("fake-home")
        val skillsDir = File(fakeHome, "skills")
        val skillDir = File(skillsDir, "my-skill")
        skillDir.mkdirs()
        File(skillDir, "SKILL.md").writeText("# My Skill\nA great skill")

        val agentDir = createTempDir("agent-skills")

        val adapter = mockAdapter(agentDir.absolutePath)
        val service = createService(adapter, fakeHome.absolutePath)

        service.syncSkillsToAgent(AgentType.CLAUDE_CODE, listOf("my-skill"), SyncMethod.Copy)

        val synced = File(agentDir, "my-skill")
        assertTrue(synced.exists(), "Synced skill directory should exist")
        assertTrue(synced.isDirectory, "Should be a directory")
        assertTrue(!Files.isSymbolicLink(synced.toPath()), "Should NOT be a symlink")
        assertTrue(File(synced, "SKILL.md").exists(), "Files inside should be copied")
        assertEquals(
            "# My Skill\nA great skill",
            File(synced, "SKILL.md").readText(),
            "File content should match"
        )
    }

    // ── syncSkillsToAgent (Symlink) ──────────────────────────────────

    @Test
    fun `syncSkillsToAgent with Symlink creates symbolic links`() = runTest {
        val fakeHome = createTempDir("fake-home-sym")
        val skillsDir = File(fakeHome, "skills")
        val skillDir = File(skillsDir, "link-skill")
        skillDir.mkdirs()
        File(skillDir, "SKILL.md").writeText("# Linked")

        val agentDir = createTempDir("agent-sym")

        val adapter = mockAdapter(agentDir.absolutePath)
        val service = createService(adapter, fakeHome.absolutePath)

        service.syncSkillsToAgent(AgentType.CLAUDE_CODE, listOf("link-skill"), SyncMethod.Symlink)

        val synced = File(agentDir, "link-skill")
        assertTrue(synced.exists(), "Synced skill should exist")
        assertTrue(Files.isSymbolicLink(synced.toPath()), "Should be a symlink")
    }

    // ── syncSkillsToAgent creates target directory ───────────────────

    @Test
    fun `syncSkillsToAgent creates target directory when it does not exist`() = runTest {
        val fakeHome = createTempDir("fake-home-mkdir")
        val skillsDir = File(fakeHome, "skills")
        val skillDir = File(skillsDir, "mkdir-skill")
        skillDir.mkdirs()
        File(skillDir, "SKILL.md").writeText("# Mkdir")

        // Agent dir points to a non-existent path
        val agentDir = File(createTempDir("agent-parent"), "nested/skills")
        assertTrue(!agentDir.exists(), "Agent dir should not exist yet")

        val adapter = mockAdapter(agentDir.absolutePath)
        val service = createService(adapter, fakeHome.absolutePath)

        service.syncSkillsToAgent(AgentType.CLAUDE_CODE, listOf("mkdir-skill"), SyncMethod.Copy)

        assertTrue(agentDir.exists(), "Agent dir should be created")
        assertTrue(File(agentDir, "mkdir-skill").exists(), "Skill should be synced")
    }

    @Test
    fun `syncSkillsToAgent does nothing when adapter is null`() = runTest {
        val service = createService(null)
        // Should not throw
        service.syncSkillsToAgent(AgentType.CLAUDE_CODE, listOf("any"), SyncMethod.Copy)
    }

    // ── applyProviderPreset ──────────────────────────────────────────

    @Test
    fun `applyProviderPreset writes baseUrl and model to native config`() = runTest {
        val preset = ProviderPreset("TestProvider", "https://test.com/api", "test-model-v1")
        val adapter = mockk<AgentAdapter>(relaxed = true) {
            every { providerPresets } returns listOf(preset)
        }
        val service = createService(adapter)

        service.applyProviderPreset(AgentType.CLAUDE_CODE, "TestProvider")

        coVerify { adapter.writeNativeConfigField("Base URL", "https://test.com/api") }
        coVerify { adapter.writeNativeConfigField("Model", "test-model-v1") }
    }

    @Test
    fun `applyProviderPreset does nothing when preset not found`() = runTest {
        val adapter = mockk<AgentAdapter>(relaxed = true) {
            every { providerPresets } returns listOf(
                ProviderPreset("Other", "https://other.com", "other-model")
            )
        }
        val service = createService(adapter)

        // Should not throw and should not write any config
        service.applyProviderPreset(AgentType.CLAUDE_CODE, "NonExistent")

        coVerify(exactly = 0) { adapter.writeNativeConfigField(any(), any()) }
    }

    @Test
    fun `applyProviderPreset does nothing when adapter is null`() = runTest {
        val service = createService(null)
        // Should not throw
        service.applyProviderPreset(AgentType.CLAUDE_CODE, "AnyPreset")
    }
}
