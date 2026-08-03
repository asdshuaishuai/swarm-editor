package com.swarmeditor.common.config

import kotlinx.serialization.Serializable

/** 配置路径常量 */
object ConfigPaths {
    private val HOME: String = System.getProperty("user.home")

    /** Swarm Editor 配置目录 */
    val SWARM_EDITOR_DIR: String = "$HOME/.swarm-editor"

    /** Agent 配置文件 */
    val AGENTS_JSON: String = "$SWARM_EDITOR_DIR/agents.json"

    /** 可供主智能体动态调度的模型池。 */
    val MODELS_JSON: String = "$SWARM_EDITOR_DIR/models.json"

    /** MCP 统一存储 */
    val MCP_SERVERS_JSON: String = "$SWARM_EDITOR_DIR/mcp-servers.json"

    /** Skills 统一存储 */
    val SKILLS_JSON: String = "$SWARM_EDITOR_DIR/skills.json"

    /** 会话数据目录 */
    val SESSIONS_DIR: String = "$SWARM_EDITOR_DIR/sessions"

    /** 真实会话活动事件。 */
    val ACTIVITY_JSON: String = "$SWARM_EDITOR_DIR/activity.json"

    /** 蜂群运行记录目录。 */
    val SWARM_RUNS_DIR: String = "$SWARM_EDITOR_DIR/swarm-runs"

    /** 蜂群工作区差异、沙箱预检和验证证据目录。 */
    val SWARM_EVIDENCE_DIR: String = "$SWARM_EDITOR_DIR/swarm-evidence"

    /** Pi 蜂群跨运行积累的经验手册。 */
    val SWARM_EXPERIENCES_JSON: String = "$SWARM_EDITOR_DIR/swarm-experiences.json"

    /** Pi 蜂群反事实评估与候选 Skill 账本。 */
    val SWARM_EVOLUTION_JSON: String = "$SWARM_EDITOR_DIR/swarm-evolution.json"

    /** 反事实评估使用的临时 Git worktree 根目录。 */
    val SWARM_EVALUATION_WORKTREES_DIR: String = "$SWARM_EDITOR_DIR/evaluation-worktrees"

    /** 捕获未提交工作树时使用的临时 Git index 根目录。 */
    val SWARM_EVALUATION_INDEXES_DIR: String = "$SWARM_EDITOR_DIR/evaluation-indexes"

    /** Pi 蜂群任务独占的 detached Git worktree 根目录。 */
    val SWARM_TASK_WORKTREES_DIR: String = "$SWARM_EDITOR_DIR/task-worktrees"

    /** 捕获任务工作区差异时使用的临时 Git index 根目录。 */
    val SWARM_TASK_INDEXES_DIR: String = "$SWARM_EDITOR_DIR/task-indexes"

    /** pi 自身的会话目录。 */
    val PI_SESSIONS_DIR: String = "$SWARM_EDITOR_DIR/pi-sessions"

    /** Swarm Editor 隔离的 pi Agent 目录。 */
    val PI_AGENT_DIR: String = "$SWARM_EDITOR_DIR/pi-agent"

    /** Pi 工具代理的逐请求审计记录目录。 */
    val PI_TOOL_AUDIT_DIR: String = "$SWARM_EDITOR_DIR/pi-tool-audit"

    /** 哈希固定的 Wasmtime 插件目录，每个插件使用独立子目录。 */
    val WASM_PLUGINS_DIR: String = "$SWARM_EDITOR_DIR/wasm-plugins"

    /** Swarm Editor 管理的固定版本 Wasmtime 运行时。 */
    val WASMTIME_RUNTIME_DIR: String = "$SWARM_EDITOR_DIR/runtimes/wasmtime"

    /** Swarm Editor 按需安装的 JetBrains Kotlin Language Server。 */
    val KOTLIN_LSP_RUNTIME_DIR: String = "$SWARM_EDITOR_DIR/runtimes/kotlin-lsp"

    /** pi 全局 Skills 目录。 */
    val PI_SKILLS_DIR: String = "$PI_AGENT_DIR/skills"
}
