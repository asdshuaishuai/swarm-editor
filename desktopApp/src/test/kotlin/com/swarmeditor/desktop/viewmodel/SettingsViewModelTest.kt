package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.backend.pi.PiRuntimeDistribution
import com.swarmeditor.backend.pi.PiRuntimeInfo
import com.swarmeditor.backend.pi.PiRuntimeManager
import com.swarmeditor.backend.pi.PiSessionFactory
import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.service.ModelService
import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ModelConfig
import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, ExperimentalPathApi::class)
class SettingsViewModelTest {
    @Test
    fun `primary agent and model pool saves stay independent`() = runTest {
        val directory = Files.createTempDirectory("settings-save-target")
        try {
            val agentService = createAgentService(directory)
            agentService.init()
            val modelService = ModelService(
                ModelRegistry(
                    configPath = directory.resolve("models.json").toFile(),
                    legacyAgentsPath = directory.resolve("agents.json").toFile(),
                )
            )
            modelService.init()
            modelService.upsert(ModelConfig("secondary-model", "Secondary Model")).getOrThrow()
            val viewModel = SettingsViewModel(
                agentService = agentService,
                mcpService = McpService(McpStore(directory.resolve("mcp.json").toFile())),
                skillService = SkillService(
                    store = SkillStore(directory.resolve("skills.json").toFile()),
                    scanner = SkillScanner(emptyList()),
                ),
                scope = backgroundScope,
                modelService = modelService,
            )

            runCurrent()
            viewModel.selectModel("secondary-model")
            runCurrent()

            viewModel.setPrimaryModel("secondary-model")
            viewModel.saveModelField("Priority", "700")
            runCurrent()

            assertEquals("secondary-model", agentService.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.modelConfigId)
            assertEquals("Pi 主智能体", agentService.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.name)
            assertEquals("Secondary Model", modelService.get("secondary-model")?.name)
            assertEquals(700, modelService.get("secondary-model")?.priority)
            assertEquals("secondary-model", viewModel.selectedModelId.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun createAgentService(directory: java.nio.file.Path): AgentService {
        val manager = PiRuntimeManager(
            distribution = PiRuntimeDistribution(directory.toFile()),
            defaultWorkingDirectory = directory.toFile(),
            factory = PiSessionFactory { _, _, _ -> error("Runtime session is not needed in this test") },
        )
        return AgentService(
            registry = AgentRegistry(directory.resolve("agents.json").toFile()),
            runtimeManager = manager,
            inspectRuntime = {
                Result.success(PiRuntimeInfo("0.80.10", "v22.0.0", directory.resolve("rpc-entry.js").toFile()))
            },
        )
    }
}
