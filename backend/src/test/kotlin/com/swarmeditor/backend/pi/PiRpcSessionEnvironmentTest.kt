package com.swarmeditor.backend.pi

import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.model.AgentConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PiRpcSessionEnvironmentTest {
    @Test
    fun `managed runtime environment cannot be overridden by agent profile`() {
        val config = AgentConfig(
            id = "reviewer",
            name = "Reviewer",
            env = mapOf(
                "API_KEY" to "secret",
                "PI_CODING_AGENT_DIR" to "/tmp/other-agent",
                "SWARM_PI_AGENT_ID" to "other-agent",
                "SWARM_EDITOR_MCP_CONFIG" to "/tmp/other-mcp.json",
                "SWARM_PI_TOOL_BROKER" to "profile-controlled",
                "SWARM_PI_TOOL_BROKER_NONCE" to "profile-nonce",
                "SWARM_PI_TOOL_BROKER_CORE_TOOLS" to "profile-controlled",
            ),
        )

        val environment = piProcessEnvironment(config)

        assertEquals("secret", environment["API_KEY"])
        assertEquals(PiRuntimePaths.agentDirectory("reviewer").absolutePath, environment["PI_CODING_AGENT_DIR"])
        assertEquals("reviewer", environment["SWARM_PI_AGENT_ID"])
        assertEquals(ConfigPaths.MCP_SERVERS_JSON, environment["SWARM_EDITOR_MCP_CONFIG"])
        assertNull(environment["SWARM_PI_TOOL_BROKER"])
        assertNull(environment["SWARM_PI_TOOL_BROKER_NONCE"])
        assertNull(environment["SWARM_PI_TOOL_BROKER_CORE_TOOLS"])
    }

    @Test
    fun `tool broker environment is enabled only by the host`() {
        val environment = piProcessEnvironment(
            config = AgentConfig(
                id = "reviewer",
                name = "Reviewer",
                env = mapOf(
                    "SWARM_PI_TOOL_BROKER" to "profile-controlled",
                    "SWARM_PI_TOOL_BROKER_NONCE" to "profile-nonce",
                ),
            ),
            toolBrokerNonce = "host-controlled-nonce",
            brokerCoreTools = false,
        )

        assertEquals("stdio-v1", environment["SWARM_PI_TOOL_BROKER"])
        assertEquals("host-controlled-nonce", environment["SWARM_PI_TOOL_BROKER_NONCE"])
        assertEquals("0", environment["SWARM_PI_TOOL_BROKER_CORE_TOOLS"])
    }
}
