package com.swarmeditor.backend.agent.adapter

import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.backend.agent.ProviderPreset
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File

private val log = KotlinLogging.logger {}

/**
 * Claude Code 适配器。
 *
 * 配置: ~/.claude/settings.json
 * 格式: { "env": { "ANTHROPIC_MODEL": "...", "ANTHROPIC_AUTH_TOKEN": "...", "ANTHROPIC_BASE_URL": "..." } }
 * MCP:  ~/.claude.json → { "mcpServers": { "name": { "type", "command", "args", "env" } } }
 * Skills: ~/.claude/skills/
 * ACP 命令: claude acp
 * Provider 预设: Anthropic Official, OpenRouter, DeepSeek, Zhipu GLM, XiaoMi MiMo
 */
class ClaudeCodeAdapter : AgentAdapter {
    override val agentType = AgentType.CLAUDE_CODE
    override val displayName = "Claude Code"
    override val executableNames = listOf("claude", "claude-code")
    override val acpCommand = listOf("claude", "acp")
    override val nativeConfigPath = File(System.getProperty("user.home"), ".claude/settings.json").absolutePath
    override val skillsDirectory = File(System.getProperty("user.home"), ".claude/skills").absolutePath

    private val mcpConfigPath = File(System.getProperty("user.home"), ".claude.json").absolutePath
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    override val providerPresets = listOf(
        ProviderPreset("Anthropic Official", "api.anthropic.com", "claude-sonnet-4-20250514"),
        ProviderPreset("OpenRouter", "openrouter.ai/api", "anthropic/claude-sonnet-4"),
        ProviderPreset("DeepSeek", "api.deepseek.com", "deepseek-chat"),
        ProviderPreset("Zhipu GLM", "open.bigmodel.cn", "glm-4-plus"),
        ProviderPreset("XiaoMi MiMo", "api.xiaomi.com", "mimo-7b"),
    )

    override suspend fun detect(): String? = withContext(Dispatchers.IO) {
        try {
            val p = ProcessBuilder("claude", "--version").redirectErrorStream(true).start()
            val out = p.inputStream.bufferedReader().readText().trim()
            p.waitFor()
            if (p.exitValue() == 0 && out.isNotEmpty()) out else null
        } catch (_: Exception) { null }
    }

    override suspend fun readNativeConfig(): String? = withContext(Dispatchers.IO) {
        try { File(nativeConfigPath).let { if (it.exists()) it.readText() else null } }
        catch (e: Exception) { log.warn { "Failed to read Claude config: ${e.message}" }; null }
    }

    override suspend fun readNativeConfigFields(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val content = json.parseToJsonElement(f.readText()).jsonObject
            val env = content["env"]?.jsonObject

            // 读取 env vars，支持 ${VAR} 展开
            fun envValue(key: String): String {
                val raw = env?.get(key)?.jsonPrimitive?.contentOrNull ?: return ""
                return if (raw.startsWith("\${") && raw.endsWith("}")) {
                    val varName = raw.removePrefix("\${").removeSuffix("}")
                    System.getenv(varName) ?: raw
                } else raw
            }

            mapOf(
                "Model" to envValue("ANTHROPIC_MODEL"),
                "API Key" to (envValue("ANTHROPIC_AUTH_TOKEN").ifEmpty { envValue("ANTHROPIC_API_KEY") }),
                "Base URL" to (envValue("ANTHROPIC_BASE_URL").ifEmpty { "api.anthropic.com" }),
                "Max Tokens" to (env?.get("CLAUDE_MAX_TOKENS")?.jsonPrimitive?.contentOrNull ?: "8192"),
                "Temperature" to (env?.get("CLAUDE_TEMPERATURE")?.jsonPrimitive?.contentOrNull ?: "1.0"),
            )
        } catch (e: Exception) { log.warn { "Failed to parse Claude config: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeNativeConfigField(key: String, value: String) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            val envObj = existing["env"]?.jsonObject?.toMutableMap() ?: mutableMapOf()
            val envKey = when (key) {
                "Model" -> "ANTHROPIC_MODEL"
                "API Key" -> {
                    envObj["ANTHROPIC_API_KEY"] = kotlinx.serialization.json.JsonPrimitive(value)
                    envObj["ANTHROPIC_AUTH_TOKEN"] = kotlinx.serialization.json.JsonPrimitive(value)
                    null
                }
                "Base URL" -> "ANTHROPIC_BASE_URL"
                "Max Tokens" -> "CLAUDE_MAX_TOKENS"
                "Temperature" -> "CLAUDE_TEMPERATURE"
                else -> key
            }
            if (envKey != null) {
                envObj[envKey] = kotlinx.serialization.json.JsonPrimitive(value)
            }
            existing["env"] = JsonObject(envObj)
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write Claude config: ${e.message}" } }
    }

    override suspend fun readMcpConfig(): Map<String, McpServerConfig> = withContext(Dispatchers.IO) {
        try {
            val f = File(mcpConfigPath); if (!f.exists()) return@withContext emptyMap()
            val content = json.parseToJsonElement(f.readText()).jsonObject
            val servers = content["mcpServers"]?.jsonObject ?: return@withContext emptyMap()
            servers.mapValues { (name, element) ->
                val obj = element.jsonObject
                McpServerConfig(
                    id = "claude-$name", name = name,
                    type = McpServerType.STDIO,
                    command = obj["command"]?.jsonPrimitive?.contentOrNull ?: "",
                    args = obj["args"]?.jsonArray?.map { it.jsonPrimitive.contentOrNull ?: "" } ?: emptyList(),
                    env = obj["env"]?.jsonObject?.mapValues { it.value.jsonPrimitive.contentOrNull ?: "" } ?: emptyMap(),
                    enabledAgents = mapOf("claude-code" to true)
                )
            }
        } catch (e: Exception) { log.warn { "Failed to read Claude MCP: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>) = withContext(Dispatchers.IO) {
        try {
            val mcpServers = buildJsonObject {
                servers.values.filter { it.enabledAgents["claude-code"] == true }.forEach { server ->
                    put(server.name, buildJsonObject {
                        put("command", server.command)
                        if (server.args.isNotEmpty()) {
                            put("args", kotlinx.serialization.json.buildJsonArray { server.args.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) } })
                        }
                        if (server.env.isNotEmpty()) {
                            put("env", buildJsonObject { server.env.forEach { (k, v) -> put(k, v) } })
                        }
                    })
                }
            }
            File(mcpConfigPath).writeText(json.encodeToString(JsonObject.serializer(), buildJsonObject { put("mcpServers", mcpServers) }))
        } catch (e: Exception) { log.error { "Failed to write Claude MCP: ${e.message}" } }
    }

}
