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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File

private val log = KotlinLogging.logger {}

class OpenCodeAdapter : AgentAdapter {
    override val agentType = AgentType.OPEN_CODE
    override val displayName = "OpenCode"
    override val executableNames = listOf("opencode", "open-code")
    override val acpCommand = listOf("opencode", "acp")
    override val nativeConfigPath = File(System.getProperty("user.home"), ".config/opencode/opencode.json").absolutePath
    override val skillsDirectory = File(System.getProperty("user.home"), ".config/opencode/skills").absolutePath
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    override suspend fun detect(): String? = withContext(Dispatchers.IO) {
        try {
            val p = ProcessBuilder("opencode", "--version").redirectErrorStream(true).start()
            val out = p.inputStream.bufferedReader().readText().trim(); p.waitFor()
            if (p.exitValue() == 0 && out.isNotEmpty()) out else null
        } catch (_: Exception) { null }
    }

    override suspend fun readNativeConfig(): String? = withContext(Dispatchers.IO) {
        try { File(nativeConfigPath).let { if (it.exists()) it.readText() else null } }
        catch (e: Exception) { log.warn { "Failed to read OpenCode config: ${e.message}" }; null }
    }

    override suspend fun readNativeConfigFields(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val c = json.parseToJsonElement(f.readText()).jsonObject
            val provider = c["provider"]?.jsonObject
            val opts = provider?.get("name")?.jsonObject?.get("options")?.jsonObject
            mapOf(
                "Model" to (c["model"]?.jsonPrimitive?.contentOrNull ?: ""),
                "Small Model" to (c["small_model"]?.jsonPrimitive?.contentOrNull ?: ""),
                "Provider" to (provider?.get("name")?.jsonPrimitive?.contentOrNull ?: "anthropic"),
                "API Key" to (opts?.get("apiKey")?.jsonPrimitive?.contentOrNull ?: ""),
                "Base URL" to (opts?.get("baseURL")?.jsonPrimitive?.contentOrNull ?: "")
            )
        } catch (e: Exception) { log.warn { "Failed to parse OpenCode config: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeNativeConfigField(key: String, value: String) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            val configKey = when(key){"Model"->"model";"Small Model"->"small_model";else->key}
            existing[configKey] = kotlinx.serialization.json.JsonPrimitive(value)
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write OpenCode config: ${e.message}" } }
    }

    override suspend fun readMcpConfig(): Map<String, McpServerConfig> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val c = json.parseToJsonElement(f.readText()).jsonObject
            val mcp = c["mcp"]?.jsonObject ?: return@withContext emptyMap()
            mcp.mapValues { (name, el) ->
                val obj = el.jsonObject
                val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: "local"
                val cmd = obj["command"]?.jsonObject
                McpServerConfig(id = "opencode-$name", name = name,
                    type = if (type == "remote") McpServerType.HTTP else McpServerType.STDIO,
                    command = cmd?.let { it.values.map { v -> v.jsonPrimitive.contentOrNull ?: "" }.joinToString(" ") } ?: "",
                    enabledAgents = mapOf("opencode" to true))
            }
        } catch (e: Exception) { log.warn { "Failed to read OpenCode MCP: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            val mcp = buildJsonObject {
                servers.values.filter { it.enabledAgents["opencode"] == true }.forEach { s ->
                    put(s.name, buildJsonObject {
                        put("type", if (s.type == McpServerType.HTTP) "remote" else "local")
                        put("command", buildJsonObject { put(s.command.split(" ").first(), s.command) })
                    })
                }
            }
            existing["mcp"] = mcp
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write OpenCode MCP: ${e.message}" } }
    }
}
