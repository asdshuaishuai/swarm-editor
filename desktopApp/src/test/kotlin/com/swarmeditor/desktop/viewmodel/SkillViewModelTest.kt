package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.skill.ProjectSkillScanner
import com.swarmeditor.backend.skill.ProjectSkillTrustStore
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import java.io.File
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalPathApi::class, ExperimentalCoroutinesApi::class)
class SkillViewModelTest {
    @Test
    fun `project skill trust state follows scan trust change and revocation`() = runTest {
        val directory = Files.createTempDirectory("skill-view-model").toFile()
        try {
            val skill = File(directory, ".agents/skills/review").apply { mkdirs() }
            File(skill, "SKILL.md").writeText("# Review\n\nReview changes.")
            val service = SkillService(
                store = SkillStore(File(directory, "skills.json")),
                scanner = SkillScanner(emptyList()),
                projectRoot = directory,
                projectScanner = ProjectSkillScanner(),
                projectTrustStore = ProjectSkillTrustStore(File(directory, "trust.json")),
            )
            service.scan().getOrThrow()
            assertNotNull(service.getAll().singleOrNull { it.name == "review" })
            val viewModel = SkillViewModel(service, backgroundScope)
            backgroundScope.launch(start = CoroutineStart.UNDISPATCHED) { viewModel.skills.collect {} }

            val trustEvent = async { viewModel.events.first() }
            viewModel.trustProjectSkills()
            assertEquals("项目 Skills 已信任", trustEvent.await().message)
            assertTrue(viewModel.projectSkillTrust.value?.trusted == true)

            File(skill, "SKILL.md").appendText("\nUpdated.")
            val scanEvent = async { viewModel.events.first() }
            viewModel.scan()
            assertEquals("Skills 扫描完成", scanEvent.await().message)
            assertFalse(viewModel.projectSkillTrust.value?.trusted == true)

            val retrustEvent = async { viewModel.events.first() }
            viewModel.trustProjectSkills()
            assertEquals("项目 Skills 已信任", retrustEvent.await().message)
            assertTrue(viewModel.projectSkillTrust.value?.trusted == true)
            val revokeEvent = async { viewModel.events.first() }
            viewModel.revokeProjectSkillTrust()
            assertEquals("项目 Skills 信任已撤销", revokeEvent.await().message)
            assertFalse(viewModel.projectSkillTrust.value?.trusted == true)
        } finally {
            directory.toPath().deleteRecursively()
        }
    }

}
