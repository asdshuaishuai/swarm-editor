package com.swarmeditor.backend.mcp

import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private val log = KotlinLogging.logger {}

enum class UserMcpConfigFormat {
    JSON,
    TOML,
}

data class UserMcpConfigSource(
    val id: String,
    val file: File,
    val format: UserMcpConfigFormat,
)

class UserMcpScanner(
    private val sources: List<UserMcpConfigSource> = defaultUserMcpConfigSources(),
    private val maxFileBytes: Long = 32L * 1024 * 1024,
    private val maxServersPerSource: Int = 512,
) {
    private val json = Json { ignoreUnknownKeys = true }

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
        require(maxServersPerSource > 0) { "maxServersPerSource must be positive" }
    }

    suspend fun scan(): List<McpServerConfig> = withContext(Dispatchers.IO) {
        val discovered = linkedMapOf<McpConnectionKey, McpServerConfig>()
        sources.filter { it.file.isFile }.forEach { source ->
            val servers = try {
                val content = source.file.readBoundedUtf8(maxFileBytes)
                when (source.format) {
                    UserMcpConfigFormat.JSON -> parseJsonSource(source, content)
                    UserMcpConfigFormat.TOML -> parseTomlSource(source, content)
                }.also { parsed ->
                    require(parsed.size <= maxServersPerSource) {
                        "MCP source ${source.file.path} contains more than $maxServersPerSource servers"
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                log.warn { "Failed to scan user MCP config ${source.file.path}: ${error.message}" }
                emptyList()
            }
            servers.forEach { server -> discovered.putIfAbsent(server.connectionKey(), server) }
        }
        log.info { "Discovered ${discovered.size} user MCP servers from ${sources.size} config candidates" }
        discovered.values.toList()
    }

    private fun parseJsonSource(source: UserMcpConfigSource, content: String): List<McpServerConfig> {
        val root = json.parseToJsonElement(content).jsonObject
        val servers = sequenceOf("mcpServers", "servers")
            .mapNotNull { key -> root[key] as? JsonObject }
            .firstOrNull()
            ?: return emptyList()
        return servers.mapNotNull { (name, element) ->
            (element as? JsonObject)?.toServer(source, name)
        }
    }

    private fun parseTomlSource(source: UserMcpConfigSource, content: String): List<McpServerConfig> {
        val builders = linkedMapOf<String, TomlMcpBuilder>()
        var currentName: String? = null
        var currentSection = TomlSection.SERVER
        content.lineSequence().forEach { rawLine ->
            val line = stripTomlComment(rawLine).trim()
            if (line.isBlank()) return@forEach
            if (line.startsWith('[') && line.endsWith(']')) {
                val table = line.substring(1, line.length - 1).trim()
                val parsed = parseMcpTable(table)
                currentName = parsed?.first
                currentSection = parsed?.second ?: TomlSection.SERVER
                return@forEach
            }
            val name = currentName ?: return@forEach
            val separator = line.indexOf('=')
            if (separator <= 0) return@forEach
            val key = line.substring(0, separator).trim().trim('"')
            val value = line.substring(separator + 1).trim()
            val builder = builders.getOrPut(name) { TomlMcpBuilder() }
            when (currentSection) {
                TomlSection.ENV -> builder.env[key] = parseTomlString(value)
                TomlSection.HEADERS -> builder.headers[key] = parseTomlString(value)
                TomlSection.SERVER -> when (key) {
                    "type" -> builder.type = parseTomlString(value)
                    "command" -> builder.command = parseTomlString(value)
                    "args" -> builder.args = parseTomlStringArray(value)
                    "url" -> builder.url = parseTomlString(value)
                    "disabled" -> builder.disabled = value.equals("true", ignoreCase = true)
                }
            }
        }
        return builders.mapNotNull { (name, builder) -> builder.toServer(source, name) }
    }

    private fun JsonObject.toServer(source: UserMcpConfigSource, name: String): McpServerConfig? {
        val command = string("command")
        val url = string("url").ifBlank { string("serverUrl") }.ifBlank { string("httpUrl") }
        if (command.isBlank() && url.isBlank()) return null
        val rawType = string("type")
        val type = if (url.isNotBlank() || rawType.equals("http", true) || rawType.equals("sse", true)) {
            McpServerType.HTTP
        } else {
            McpServerType.STDIO
        }
        return discoveredServer(
            source = source,
            name = name,
            type = type,
            command = command,
            args = stringList("args"),
            env = stringMap("env"),
            url = url,
            headers = stringMap("headers"),
            disabled = this["disabled"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() ?: false,
        )
    }

    private fun JsonObject.string(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()

    private fun JsonObject.stringList(key: String): List<String> =
        (this[key] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()

    private fun JsonObject.stringMap(key: String): Map<String, String> =
        (this[key] as? JsonObject)?.mapNotNull { (name, value) ->
            value.jsonPrimitive.contentOrNull?.let { name to it }
        }?.toMap().orEmpty()

    private fun discoveredServer(
        source: UserMcpConfigSource,
        name: String,
        type: McpServerType,
        command: String,
        args: List<String>,
        env: Map<String, String>,
        url: String,
        headers: Map<String, String>,
        disabled: Boolean,
    ): McpServerConfig {
        val key = McpConnectionKey(type, command, args, env, url, headers)
        val normalizedName = name.replace(Regex("[^A-Za-z0-9._-]"), "-").trim('-').ifBlank { "server" }
        return McpServerConfig(
            id = "user:${source.id}:$normalizedName:${key.shortHash()}",
            name = name,
            type = type,
            command = command,
            args = args,
            env = env,
            url = url,
            description = "自动发现自 ${source.id}",
            tags = listOf(USER_MCP_TAG, "source:${source.id}"),
            headers = headers,
            disabled = disabled,
        )
    }

    private fun TomlMcpBuilder.toServer(source: UserMcpConfigSource, name: String): McpServerConfig? {
        if (command.isBlank() && url.isBlank()) return null
        val serverType = if (url.isNotBlank() || type.equals("http", true) || type.equals("sse", true)) {
            McpServerType.HTTP
        } else {
            McpServerType.STDIO
        }
        return discoveredServer(source, name, serverType, command, args, env, url, headers, disabled)
    }

    private fun parseTomlString(value: String): String = runCatching {
        json.parseToJsonElement(value).jsonPrimitive.content
    }.getOrElse { value.trim().trim('"', '\'') }

    private fun parseTomlStringArray(value: String): List<String> = runCatching {
        (json.parseToJsonElement(value) as JsonArray).map { it.jsonPrimitive.content }
    }.getOrDefault(emptyList())
}

fun defaultUserMcpConfigSources(
    homeDirectory: File = File(System.getProperty("user.home")),
    appDataDirectory: File? = System.getenv("APPDATA")?.let(::File),
): List<UserMcpConfigSource> {
    val sources = mutableListOf(
        UserMcpConfigSource("claude-user", File(homeDirectory, ".claude.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("claude-settings", File(homeDirectory, ".claude/settings.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("claude-desktop", File(homeDirectory, ".config/Claude/claude_desktop_config.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("claude-desktop", File(homeDirectory, "Library/Application Support/Claude/claude_desktop_config.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("codex", File(homeDirectory, ".codex/config.toml"), UserMcpConfigFormat.TOML),
        UserMcpConfigSource("gemini", File(homeDirectory, ".gemini/settings.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("antigravity", File(homeDirectory, ".gemini/antigravity/mcp_config.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("cursor", File(homeDirectory, ".cursor/mcp.json"), UserMcpConfigFormat.JSON),
        UserMcpConfigSource("windsurf", File(homeDirectory, ".codeium/windsurf/mcp_config.json"), UserMcpConfigFormat.JSON),
    )
    appDataDirectory?.let { appData ->
        sources += UserMcpConfigSource("claude-desktop", File(appData, "Claude/claude_desktop_config.json"), UserMcpConfigFormat.JSON)
        sources += UserMcpConfigSource("cursor", File(appData, "Cursor/User/mcp.json"), UserMcpConfigFormat.JSON)
    }
    return sources.distinctBy { it.file.absoluteFile.normalize().path }
}

internal data class McpConnectionKey(
    val type: McpServerType,
    val command: String,
    val args: List<String>,
    val env: Map<String, String>,
    val url: String,
    val headers: Map<String, String>,
) {
    fun shortHash(): String {
        val content = listOf(type.name, command, args.joinToString("\u0000"), env.toSortedMap(), url, headers.toSortedMap())
            .joinToString("\u0001")
        return MessageDigest.getInstance("SHA-256")
            .digest(content.toByteArray())
            .take(6)
            .joinToString("") { byte -> "%02x".format(byte) }
    }
}

internal fun McpServerConfig.connectionKey() = McpConnectionKey(type, command, args, env, url, headers)

private data class TomlMcpBuilder(
    var type: String = "stdio",
    var command: String = "",
    var args: List<String> = emptyList(),
    var url: String = "",
    var disabled: Boolean = false,
    val env: MutableMap<String, String> = linkedMapOf(),
    val headers: MutableMap<String, String> = linkedMapOf(),
)

private enum class TomlSection {
    SERVER,
    ENV,
    HEADERS,
}

private fun parseMcpTable(table: String): Pair<String, TomlSection>? {
    if (!table.startsWith("mcp_servers.")) return null
    val remainder = table.removePrefix("mcp_servers.")
    val section = when {
        remainder.endsWith(".env") -> TomlSection.ENV
        remainder.endsWith(".headers") -> TomlSection.HEADERS
        remainder.contains(".tools.") -> return null
        else -> TomlSection.SERVER
    }
    val name = remainder.removeSuffix(".env").removeSuffix(".headers").trim().trim('"', '\'')
    return name.takeIf(String::isNotBlank)?.let { it to section }
}

private fun stripTomlComment(line: String): String {
    var quote: Char? = null
    var escaped = false
    line.forEachIndexed { index, character ->
        if (escaped) {
            escaped = false
        } else if (character == '\\' && quote == '"') {
            escaped = true
        } else if (character == '"' || character == '\'') {
            quote = if (quote == character) null else quote ?: character
        } else if (character == '#' && quote == null) {
            return line.substring(0, index)
        }
    }
    return line
}

internal const val USER_MCP_TAG = "discovered:user"
