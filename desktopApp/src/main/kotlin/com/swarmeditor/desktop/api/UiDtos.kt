package com.swarmeditor.desktop.api

import kotlinx.serialization.Serializable

@Serializable
data class AgentStatsDto(val tasks: Int = 0, val successRate: Double = 0.0, val avgLatency: String = "")

@Serializable
data class AgentDto(
    val config: AgentConfigDto,
    val status: String = "disconnected",
    val version: String = "",
    val description: String = "",
    val stats: AgentStatsDto = AgentStatsDto()
)

@Serializable
data class AgentConfigDto(
    val id: String,
    val name: String,
    val description: String = "",
    val provider: String = "",
    val model: String = "",
    val enabled: Boolean = true
)

@Serializable
data class McpToolParamDto(val name: String, val required: Boolean = false)

@Serializable
data class McpToolDto(
    val name: String,
    val description: String = "",
    val params: List<McpToolParamDto> = emptyList(),
    val active: Boolean = true
)

@Serializable
enum class McpRuntimeStatus {
    DISABLED,
    BRIDGED,
    CONFIGURED,
    UNSUPPORTED,
    FAILED
}

@Serializable
data class McpServerDto(
    val id: String,
    val name: String,
    val type: String = "stdio",
    val command: String = "",
    val args: List<String> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val url: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(),
    val description: String = "",
    val tags: List<String> = emptyList(),
    val bearerTokenEnvVar: String = "",
    val headers: Map<String, String> = emptyMap(),
    val disabled: Boolean = false,
    val tools: List<McpToolDto> = emptyList(),
    val runtimeStatus: McpRuntimeStatus = McpRuntimeStatus.CONFIGURED,
    val runtimeMessage: String = "",
    val downloads: String = "",
    val rating: Double = 0.0,
    val ratingCount: Int = 0,
    val icon: String = "",
    val version: String = "",
    val published: String = "",
    val updated: String = "",
    val repository: String = "",
    val categories: List<String> = emptyList(),
    val agents: List<String> = emptyList()
)

@Serializable
data class SkillDto(
    val id: String,
    val name: String,
    val description: String = "",
    val source: String = "filesystem",
    val scope: String = "global",
    val path: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(),
    val tags: List<String> = emptyList(),
    val files: List<String> = emptyList(),
)

@Serializable
enum class WasmtimeRuntimeHealthDto {
    READY,
    MISSING,
    INVALID,
    UNSUPPORTED,
}

@Serializable
data class WasmtimeRuntimeDto(
    val expectedVersion: String,
    val health: WasmtimeRuntimeHealthDto,
    val source: String,
    val platform: String,
    val executablePath: String = "",
    val detectedVersion: String = "",
    val installSupported: Boolean = false,
    val artifactSha256: String = "",
    val binarySha256: String = "",
    val message: String = "",
)

@Serializable
data class WasmPluginDto(
    val id: String,
    val name: String,
    val description: String = "",
    val moduleFileName: String,
    val sha256: String,
    val timeoutMillis: Long,
    val maxInputBytes: Int,
    val maxOutputChars: Int,
)

@Serializable
data class FileNodeDto(
    val name: String,
    val path: String,
    val isDirectory: Boolean = false,
    val children: List<FileNodeDto> = emptyList(),
    val changeStatus: String? = null
)

@Serializable
data class GitFileChangeDto(
    val path: String,
    val status: String,
    val hasStagedChanges: Boolean,
    val hasUnstagedChanges: Boolean,
    val isUntracked: Boolean,
    val added: Int,
    val removed: Int,
    val stagedAdded: Int = 0,
    val stagedRemoved: Int = 0,
    val unstagedAdded: Int = 0,
    val unstagedRemoved: Int = 0,
    val diffLines: List<String> = emptyList(),
    val stagedDiffLines: List<String> = emptyList(),
    val unstagedDiffLines: List<String> = emptyList(),
)

@Serializable
data class GitStatusDto(
    val isRepository: Boolean = false,
    val branch: String = "",
    val ahead: Int = 0,
    val behind: Int = 0,
    val staged: Int = 0,
    val modified: Int = 0,
    val untracked: Int = 0,
    val changes: List<GitFileChangeDto> = emptyList()
)

@Serializable
data class GitCommitDto(
    val hash: String,
    val shortHash: String,
    val parentHashes: List<String> = emptyList(),
    val authorName: String,
    val authorEmail: String,
    val authoredAtEpochSeconds: Long,
    val subject: String,
    val refs: List<String> = emptyList(),
)

@Serializable
data class GitHistoryDto(
    val commits: List<GitCommitDto> = emptyList(),
    val truncated: Boolean = false,
)

@Serializable
data class GitCommitChangeDto(
    val path: String,
    val previousPath: String? = null,
    val status: String,
    val added: Int = 0,
    val removed: Int = 0,
)

@Serializable
data class GitCommitChangesDto(
    val commitHash: String,
    val changes: List<GitCommitChangeDto> = emptyList(),
    val truncated: Boolean = false,
)
