package com.swarmeditor.backend.agent

import com.swarmeditor.common.model.AgentType
import com.swarmeditor.common.model.McpServerConfig

/**
 * Agent 适配器接口 — 每个 Agent 类型实现此接口。
 *
 * 负责：
 * - 读写原生配置文件
 * - 读写 MCP 配置
 * - 提供 ACP 命令
 * - 检测是否安装
 */
interface AgentAdapter {
    val agentType: AgentType
    val displayName: String
    val executableNames: List<String>
    val acpCommand: List<String>
    val nativeConfigPath: String
    val skillsDirectory: String

    /** 检测 Agent 是否安装，返回版本号（null = 未安装） */
    suspend fun detect(): String?

    /** 读取原生配置文件内容（原始 JSON/TOML 字符串） */
    suspend fun readNativeConfig(): String?

    /** 读取原生配置为结构化字段 */
    suspend fun readNativeConfigFields(): Map<String, String>

    /** 写入原生配置字段 */
    suspend fun writeNativeConfigField(key: String, value: String)

    /** 读取 MCP 配置 */
    suspend fun readMcpConfig(): Map<String, McpServerConfig>

    /** 写入 MCP 配置 */
    suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>)
}
