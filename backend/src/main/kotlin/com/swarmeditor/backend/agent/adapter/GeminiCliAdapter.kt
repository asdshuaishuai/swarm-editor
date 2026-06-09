package com.swarmeditor.backend.agent.adapter

import com.swarmeditor.backend.agent.AgentAdapter
import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.McpServerConfig
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.io.File

private val log = KotlinLogging.logger {}

class GeminiCliAdapter : AgentAdapter {
    override val agentType = AgentType.GEMINI_CLI
    override val displayName = "Gemini CLI"
    override val executableNames = listOf("gemini", "gemini-cli", "gcloud-ai")
    override val acpCommand = listOf("gemini", "--acp")
    override val nativeConfigPath = File(System.getProperty("user.home"), ".gemini/settings.json").absolutePath
    override val skillsDirectory = File(System.getProperty("user.home"), ".gemini/skills").absolutePath
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }

    override suspend fun detect(): String? = withContext(Dispatchers.IO) {
        try {
            val p = ProcessBuilder("gemini", "--version").redirectErrorStream(true).start()
            val out = p.inputStream.bufferedReader().readText().trim(); p.waitFor()
            if (p.exitValue() == 0 && out.isNotEmpty()) out else null
        } catch (_: Exception) { null }
    }

    override suspend fun readNativeConfig(): String? = withContext(Dispatchers.IO) {
        try { File(nativeConfigPath).let { if (it.exists()) it.readText() else null } }
        catch (e: Exception) { log.warn { "Failed to read Gemini config: ${e.message}" }; null }
    }

    override suspend fun readNativeConfigFields(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath); if (!f.exists()) return@withContext emptyMap()
            val c = json.parseToJsonElement(f.readText()).jsonObject
            mapOf("API Key" to (c["apiKey"]?.jsonPrimitive?.contentOrNull ?: ""), "Model" to (c["model"]?.jsonPrimitive?.contentOrNull ?: "gemini-2.5-pro"))
        } catch (e: Exception) { log.warn { "Failed to parse Gemini config: ${e.message}" }; emptyMap() }
    }

    override suspend fun writeNativeConfigField(key: String, value: String) = withContext(Dispatchers.IO) {
        try {
            val f = File(nativeConfigPath)
            val existing = if (f.exists()) json.parseToJsonElement(f.readText()).jsonObject.toMutableMap() else mutableMapOf()
            existing[when(key){"Model"->"model";"API Key"->"apiKey";else->key}] = kotlinx.serialization.json.JsonPrimitive(value)
            f.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(existing)))
        } catch (e: Exception) { log.error { "Failed to write Gemini config: ${e.message}" } }
    }

    override suspend fun readMcpConfig(): Map<String, McpServerConfig> = emptyMap()
    override suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>) {}
}
