package com.swarmeditor.common.config

import kotlinx.serialization.Serializable

/** 配置路径常量 */
object ConfigPaths {
    private val HOME: String = System.getProperty("user.home")

    /** Swarm Editor 配置目录 */
    val SWARM_EDITOR_DIR: String = "$HOME/.swarm-editor"

    /** Agent 配置文件 */
    val AGENTS_JSON: String = "$SWARM_EDITOR_DIR/agents.json"

    /** MCP 统一存储 */
    val MCP_SERVERS_JSON: String = "$SWARM_EDITOR_DIR/mcp-servers.json"

    /** Skills 统一存储 */
    val SKILLS_JSON: String = "$SWARM_EDITOR_DIR/skills.json"

    /** 会话数据目录 */
    val SESSIONS_DIR: String = "$SWARM_EDITOR_DIR/sessions"

    // --- Agent 原生配置路径 ---

    /** Claude Code 配置 */
    val CLAUDE_SETTINGS: String = "$HOME/.claude/settings.json"
    val CLAUDE_MCP: String = "$HOME/.claude.json"

    /** Gemini CLI 配置 */
    val GEMINI_SETTINGS: String = "$HOME/.gemini/settings.json"

    /** Kimi Code 配置 */
    val KIMI_CONFIG: String = "$HOME/.kimi/config.toml"
    val KIMI_MCP: String = "$HOME/.kimi/mcp.json"

    /** QwenCode 配置 */
    val QWEN_SETTINGS: String = "$HOME/.qwen/settings.json"

    /** OpenCode 配置 */
    val OPENCODE_CONFIG: String = "$HOME/.config/opencode/opencode.json"
}

/** API 服务端口 */
object ServerConfig {
    const val DEFAULT_PORT = 8080
    const val DEFAULT_HOST = "0.0.0.0"
}
