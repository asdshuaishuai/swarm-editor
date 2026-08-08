package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PiRuntimeDistributionTest {
    @Test
    fun `runtime command disables ambient skills and loads only the profile directory`() {
        val distribution = PiRuntimeDistribution(File("."), nodeExecutable = "node")

        val command = distribution.command(AgentConfig("review-agent", "Review"), null)

        val noSkillsIndex = command.indexOf("--no-skills")
        val skillIndex = command.indexOf("--skill")
        assertTrue(noSkillsIndex >= 0)
        assertTrue(skillIndex > noSkillsIndex)
        assertEquals(
            PiRuntimePaths.agentDirectory("review-agent").resolve("skills").absolutePath,
            command[skillIndex + 1]
        )
    }

    @Test
    fun `model catalog command disables tools extensions and profile skills`() {
        val distribution = PiRuntimeDistribution(File("."), nodeExecutable = "node")
        val config = AgentConfig(
            id = "review-agent",
            name = "Review",
            env = mapOf(SWARM_PI_MODEL_CATALOG_ENV to "1"),
        )

        val command = distribution.command(config, null)

        assertTrue("--no-tools" in command)
        assertTrue("--no-extensions" in command)
        assertTrue("--no-skills" in command)
        assertTrue("--skill" !in command)
    }

    @Test
    fun `accepts the minimum supported node version`() {
        assertEquals("v22.19.0", validateNodeVersion("v22.19.0"))
        assertEquals("23.0.1", validateNodeVersion("23.0.1"))
    }

    @Test
    fun `rejects node versions that cannot run the vendored pi runtime`() {
        val error = assertFailsWith<IllegalArgumentException> {
            validateNodeVersion("v22.18.0")
        }

        assertTrue(error.message.orEmpty().contains("22.19.0"))
    }

    @Test
    fun `rejects unrecognized node version output`() {
        assertFailsWith<IllegalStateException> { validateNodeVersion("node unavailable") }
    }
}
