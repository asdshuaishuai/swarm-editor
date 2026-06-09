package com.swarmeditor.backend.agent.adapter

import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.McpServerConfig
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import java.io.File

private val log = KotlinLogging.logger {}

class KimiCodeAdapter : AgentAdapter {
    override val agentType = AgentType.KIMI_CODE
    override val displayName = "Kimi Code"
    override val executableNames = listOf("kimi", "kimi-code", "moonshot")
    override val acpCommand = listOf("kimi", "acp")
    override val nativeConfigPath = File(System.getProperty("user.home"), ".kimi/config.toml").absolutePath
    override val skillsDirectory = File(System.getProperty("user.home"), ".kimi/skills").absolutePath
    private val mcpPath = File(System.getProperty("user.home"), ".kimi/mcp.json").absolutePath

    override suspend fun detect(): String? = withContext(Dispatchers.IO) {
        try {
            val p = ProcessBuilder("kimi", "--version").redirectErrorStream(true).start()
            val out = p.inputStream.bufferedReader().readText().trim(); p.waitFor()
            if (p.exitValue() == 0 && out.isNotEmpty()) out else null
        } catch (_: Exception) { null }
    }

    override suspend fun readNativeConfig(): String? = withContext(Dispatchers.IO) {
        try { File(nativeConfigPath).let { if (it.exists()) it.readText() else null } }
        catch (e: Exception) { log.warn { "Failed to read Kimi config: ${e.message}" }; null }
    }

    override suspend fun readNativeConfigFields(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val content = f.readText()
            // 简单 TOML 解析：提取 [models] 段的 default 和 [providers] 段
            val model = Regex("""default\s*=\s*"([^"]+)"""").find(content)?.groupValues?.get(1) ?: ""
            val provider = Regex("""type\s*=\s*"([^"]+)"""").find(content)?.groupValues?.get(1) ?: "kimi"
            mapOf("Provider" to provider, "Model" to model, "API Key" to "")
        } catch (e: Exception) { log.warn { "Failed to parse Kimi config: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeNativeConfigField(key: String, value: String) = withContext(Dispatchers.IO) {
        log.info { "Kimi config write: $key = $value (TOML format, manual edit recommended)" }
    }

    override suspend fun readMcpConfig(): Map<String, McpServerConfig> = withContext(Dispatchers.IO) {
        try {
            val f = File(mcpPath); if (!f.exists()) return@withContext emptyMap()
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            val content = json.parseToJsonElement(f.readText()).jsonObject
            val servers = content["mcpServers"]?.jsonObject ?: return@withContext emptyMap()
            servers.mapValues { (name, el) ->
                val obj = el.jsonObject
                McpServerConfig(id = "kimi-$name", name = name,
                    command = obj["command"]?.jsonPrimitive?.contentOrNull ?: "",
                    enabledAgents = mapOf("kimi-code" to true))
            }
        } catch (e: Exception) { log.warn { "Failed to read Kimi MCP: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>) = withContext(Dispatchers.IO) {
        try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
            val mcpServers = kotlinx.serialization.json.buildJsonObject {
                servers.values.filter { it.enabledAgents["kimi-code"] == true }.forEach { s ->
                    put(s.name, kotlinx.serialization.json.buildJsonObject { put("command", s.command) })
                }
            }
            File(mcpPath).writeText(json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), kotlinx.serialization.json.buildJsonObject { put("mcpServers", mcpServers) }))
        } catch (e: Exception) { log.error { "Failed to write Kimi MCP: ${e.message}" } }
    }
}
