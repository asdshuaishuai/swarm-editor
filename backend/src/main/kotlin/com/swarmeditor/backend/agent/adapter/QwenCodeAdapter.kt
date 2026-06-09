package com.swarmeditor.backend.agent.adapter

import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
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

/**
 * QwenCode 适配器。
 *
 * 配置: ~/.qwen/settings.json
 * 格式: { "model": { "name": "..." }, "apiKey": "...", "baseUrl": "..." }
 * MCP:  ~/.qwen/settings.json → { "mcpServers": { "name": { "command", "args", "env", "httpUrl" } } }
 *       注意: Qwen 的 MCP 格式没有 type 字段，HTTP 类型用 httpUrl 字段表示
 * Skills: ~/.qwen/skills/
 * ACP 命令: qwen --acp
 */
class QwenCodeAdapter : AgentAdapter {
    override val agentType = AgentType.QWEN_CODE
    override val displayName = "QwenCode"
    override val executableNames = listOf("qwen", "qwen-code", "tongyi")
    override val acpCommand = listOf("qwen", "--acp")
    override val nativeConfigPath = File(System.getProperty("user.home"), ".qwen/settings.json").absolutePath
    override val skillsDirectory = File(System.getProperty("user.home"), ".qwen/skills").absolutePath

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    override suspend fun detect(): String? = withContext(Dispatchers.IO) {
        try {
            val p = ProcessBuilder("qwen", "--version").redirectErrorStream(true).start()
            val out = p.inputStream.bufferedReader().readText().trim(); p.waitFor()
            if (p.exitValue() == 0 && out.isNotEmpty()) out else null
        } catch (_: Exception) { null }
    }

    override suspend fun readNativeConfig(): String? = withContext(Dispatchers.IO) {
        try { File(nativeConfigPath).let { if (it.exists()) it.readText() else null } }
        catch (e: Exception) { log.warn { "Failed to read Qwen config: ${e.message}" }; null }
    }

    override suspend fun readNativeConfigFields(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val c = json.parseToJsonElement(f.readText()).jsonObject
            val model = c["model"]?.jsonObject
            mapOf(
                "Model" to (model?.get("name")?.jsonPrimitive?.contentOrNull ?: ""),
                "API Key" to (c["apiKey"]?.jsonPrimitive?.contentOrNull ?: ""),
                "Base URL" to (c["baseUrl"]?.jsonPrimitive?.contentOrNull ?: "https://dashscope.aliyuncs.com")
            )
        } catch (e: Exception) { log.warn { "Failed to parse Qwen config: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeNativeConfigField(key: String, value: String) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            val configKey = when (key) {
                "Model" -> "model"
                "API Key" -> "apiKey"
                "Base URL" -> "baseUrl"
                else -> key
            }
            existing[configKey] = kotlinx.serialization.json.JsonPrimitive(value)
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write Qwen config: ${e.message}" } }
    }

    override suspend fun readMcpConfig(): Map<String, McpServerConfig> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val c = json.parseToJsonElement(f.readText()).jsonObject
            val servers = c["mcpServers"]?.jsonObject ?: return@withContext emptyMap()
            servers.mapValues { (name, element) ->
                val obj = element.jsonObject
                val httpUrl = obj["httpUrl"]?.jsonPrimitive?.contentOrNull
                McpServerConfig(
                    id = "qwen-$name", name = name,
                    type = if (httpUrl != null) McpServerType.HTTP else McpServerType.STDIO,
                    command = obj["command"]?.jsonPrimitive?.contentOrNull ?: "",
                    args = obj["args"]?.jsonObject?.values?.map { it.jsonPrimitive.contentOrNull ?: "" } ?: emptyList(),
                    env = obj["env"]?.jsonObject?.mapValues { it.value.jsonPrimitive.contentOrNull ?: "" } ?: emptyMap(),
                    url = httpUrl ?: "",
                    enabledAgents = mapOf("qwen-code" to true)
                )
            }
        } catch (e: Exception) { log.warn { "Failed to read Qwen MCP: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            val mcpServers = buildJsonObject {
                servers.values.filter { it.enabledAgents["qwen-code"] == true }.forEach { server ->
                    put(server.name, buildJsonObject {
                        put("command", server.command)
                        if (server.url.isNotEmpty()) put("httpUrl", server.url)
                    })
                }
            }
            existing["mcpServers"] = mcpServers
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write Qwen MCP: ${e.message}" } }
    }
}
