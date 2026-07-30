package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

/** MCP Server 配置 */
@Serializable
data class McpServerConfig(
    val id: String,
    val name: String,
    val type: McpServerType = McpServerType.STDIO,
    val command: String = "",
    val args: List<String> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val url: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(),
    val description: String = "",
    val tags: List<String> = emptyList(),
    val bearerTokenEnvVar: String = "",
    val headers: Map<String, String> = emptyMap(),
    val disabled: Boolean = false
)

/** MCP Server 类型 */
@Serializable
enum class McpServerType {
    STDIO,
    HTTP
}

/** MCP 工具 */
@Serializable
data class McpTool(
    val name: String,
    val description: String = "",
    val inputSchema: McpToolInputSchema = McpToolInputSchema()
)

/** MCP 工具输入 Schema (JSON Schema 子集) */
@Serializable
data class McpToolInputSchema(
    val type: String = "object",
    val properties: Map<String, McpSchemaProperty> = emptyMap(),
    val required: List<String> = emptyList()
)

/** JSON Schema 属性 */
@Serializable
data class McpSchemaProperty(
    val type: String = "string",
    val description: String = "",
    val enum: List<String> = emptyList()
)

/** MCP 工具调用结果 */
@Serializable
data class McpToolResult(
    val content: List<McpContent> = emptyList(),
    val isError: Boolean = false
)

/** MCP 内容块 */
@Serializable
data class McpContent(
    val type: String = "text",
    val text: String = "",
    val mimeType: String = ""
)
