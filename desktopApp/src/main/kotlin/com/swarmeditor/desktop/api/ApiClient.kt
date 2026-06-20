package com.swarmeditor.desktop.api

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val client = HttpClient(CIO) {
    install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true; encodeDefaults = true }) }
}
private const val BASE = "http://localhost:8080"

// --- Response DTOs ---
@Serializable data class AgentStatsDto(val tasks: Int = 0, val successRate: Double = 0.0, val avgLatency: String = "")
@Serializable data class AgentListResponse(val agents: List<AgentDto> = emptyList())
@Serializable data class AgentDto(val config: AgentConfigDto, val status: String = "disconnected", val version: String = "", val description: String = "", val stats: AgentStatsDto = AgentStatsDto())
@Serializable data class AgentConfigDto(val id: String, val name: String, val description: String = "", val command: String = "", val args: List<String> = emptyList(), val agentType: String = "", val enabled: Boolean = true)
@Serializable data class SessionListResponse(val sessions: List<SessionDto> = emptyList())
@Serializable data class SessionDto(val id: String, val agentId: String, val status: String = "active", val messages: List<MessageDto> = emptyList(), val createdAt: String = "", val updatedAt: String = "")
@Serializable data class MessageDto(val id: String, val role: String, val content: List<ContentBlockDto> = emptyList(), val createdAt: String = "")
@Serializable data class ContentBlockDto(val type: String = "text", val text: String = "")
@Serializable data class McpServerListResponse(val servers: List<McpServerDto> = emptyList())
@Serializable data class McpToolParamDto(val name: String, val required: Boolean = false)
@Serializable data class McpToolDto(val name: String, val description: String = "", val params: List<McpToolParamDto> = emptyList())
@Serializable data class McpServerDto(val id: String, val name: String, val type: String = "stdio", val command: String = "", val args: List<String> = emptyList(), val env: Map<String, String> = emptyMap(), val url: String = "", val enabledAgents: Map<String, Boolean> = emptyMap(), val description: String = "", val tags: List<String> = emptyList(), val tools: List<McpToolDto> = emptyList(), val downloads: String = "", val rating: Double = 0.0, val ratingCount: Int = 0, val icon: String = "", val version: String = "", val published: String = "", val updated: String = "", val repository: String = "", val categories: List<String> = emptyList(), val agents: List<String> = emptyList())
@Serializable data class SkillListResponse(val skills: List<SkillDto> = emptyList())
@Serializable data class SkillDto(val id: String, val name: String, val description: String = "", val source: String = "filesystem", val scope: String = "global", val path: String = "", val enabledAgents: Map<String, Boolean> = emptyMap(), val tags: List<String> = emptyList())
@Serializable data class ConfigFieldsResponse(val fields: Map<String, String> = emptyMap(), val configPath: String = "")
@Serializable data class StatusResponse(val status: String = "", val error: String? = null, val response: String? = null)
@Serializable data class SessionResponse(val session: SessionDto? = null)
@Serializable data class GitStatusDto(val branch: String = "", val ahead: Int = 0, val behind: Int = 0, val staged: Int = 0, val modified: Int = 0, val untracked: Int = 0)
@Serializable data class GitStatusResponse(val branch: String = "", val ahead: Int = 0, val behind: Int = 0, val staged: Int = 0, val modified: Int = 0, val untracked: Int = 0)
@Serializable data class FileNodeDto(val name: String, val path: String, val isDirectory: Boolean = false, val children: List<FileNodeDto> = emptyList(), val changeStatus: String? = null)
@Serializable data class ProjectTreeResponse(val tree: FileNodeDto = FileNodeDto(name = "", path = ""))

object ApiClient {
    // --- Agent ---
    suspend fun getAgents(): List<AgentDto> = try { client.get("$BASE/api/agents").body<AgentListResponse>().agents } catch (_: Exception) { emptyList() }
    suspend fun scanAgents(): List<AgentDto> = try { client.get("$BASE/api/agents/scan").body<AgentListResponse>().agents } catch (_: Exception) { emptyList() }
    suspend fun connectAgent(id: String): StatusResponse = try { client.post("$BASE/api/agents/$id/connect").body() } catch (e: Exception) { StatusResponse(error = e.message) }
    suspend fun disconnectAgent(id: String): StatusResponse = try { client.post("$BASE/api/agents/$id/disconnect").body() } catch (e: Exception) { StatusResponse(error = e.message) }
    suspend fun getAgentConfig(id: String): ConfigFieldsResponse = try { client.get("$BASE/api/agents/$id/config").body() } catch (_: Exception) { ConfigFieldsResponse() }
    suspend fun updateAgentConfig(id: String, key: String, value: String): StatusResponse = try { client.put("$BASE/api/agents/$id/config/$key") { contentType(ContentType.Application.Json); setBody(mapOf("value" to value)) }.body() } catch (e: Exception) { StatusResponse(error = e.message) }

    // --- Session ---
    suspend fun getSessions(): List<SessionDto> = try { client.get("$BASE/api/sessions").body<SessionListResponse>().sessions } catch (_: Exception) { emptyList() }
    suspend fun getSession(id: String): SessionDto? = try { client.get("$BASE/api/sessions/$id").body<SessionResponse>().session } catch (_: Exception) { null }
    suspend fun createSession(agentId: String, title: String): SessionDto? = try { client.post("$BASE/api/sessions") { contentType(ContentType.Application.Json); setBody(mapOf("agentId" to agentId, "title" to title)) }.body<SessionResponse>().session } catch (_: Exception) { null }
    suspend fun sendMessage(sessionId: String, content: String): StatusResponse = try { client.post("$BASE/api/sessions/$sessionId/messages") { contentType(ContentType.Application.Json); setBody(mapOf("content" to content)) }.body() } catch (e: Exception) { StatusResponse(error = e.message) }
    suspend fun closeSession(id: String): StatusResponse = try { client.delete("$BASE/api/sessions/$id").body() } catch (e: Exception) { StatusResponse(error = e.message) }

    // --- MCP ---
    suspend fun getMcpServers(): List<McpServerDto> = try { client.get("$BASE/api/mcp/servers").body<McpServerListResponse>().servers } catch (_: Exception) { emptyList() }
    suspend fun addMcpServer(server: McpServerDto): StatusResponse = try { client.post("$BASE/api/mcp/servers") { contentType(ContentType.Application.Json); setBody(server) }.body() } catch (e: Exception) { StatusResponse(error = e.message) }
    suspend fun updateMcpServer(id: String, server: McpServerDto): StatusResponse = try { client.put("$BASE/api/mcp/servers/$id") { contentType(ContentType.Application.Json); setBody(server) }.body() } catch (e: Exception) { StatusResponse(error = e.message) }
    suspend fun deleteMcpServer(id: String): StatusResponse = try { client.delete("$BASE/api/mcp/servers/$id").body() } catch (e: Exception) { StatusResponse(error = e.message) }

    // --- Skills ---
    suspend fun getSkills(): List<SkillDto> = try { client.get("$BASE/api/skills").body<SkillListResponse>().skills } catch (_: Exception) { emptyList() }
    suspend fun scanSkills(): List<SkillDto> = try { client.get("$BASE/api/skills/scan").body<SkillListResponse>().skills } catch (_: Exception) { emptyList() }
    suspend fun toggleSkillAgent(id: String, agentId: String, enabled: Boolean): StatusResponse = try { client.put("$BASE/api/skills/$id/toggle/$agentId").body() } catch (e: Exception) { StatusResponse(error = e.message) }

    // --- Git ---
    suspend fun getGitStatus(): GitStatusDto = try { client.get("$BASE/api/git/status").body<GitStatusResponse>().let { GitStatusDto(branch = it.branch, ahead = it.ahead, behind = it.behind, staged = it.staged, modified = it.modified, untracked = it.untracked) } } catch (_: Exception) { GitStatusDto() }

    // --- Project ---
    suspend fun getProjectTree(): FileNodeDto = try { client.get("$BASE/api/project/tree").body<ProjectTreeResponse>().tree } catch (_: Exception) { FileNodeDto(name = "", path = "") }
}
