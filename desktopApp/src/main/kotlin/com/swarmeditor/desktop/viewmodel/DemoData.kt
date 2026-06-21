package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.McpToolDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.ui.chat.CodeCardData
import com.swarmeditor.desktop.ui.chat.DiffLine
import com.swarmeditor.desktop.ui.chat.DiffLineType
import com.swarmeditor.desktop.ui.chat.ToolCardData

/**
 * 所有设计稿示例数据集中在此（从各 ViewModel/View 中提取）。
 * 纯前端演示用，无需后端。
 */

// ═══ Agent 示例数据 ═══
val demoAgents = listOf(
    AgentInfo(id = "claude-code", name = "Claude Code", emoji = "🟣", color = AgentClaude, isConnected = true, version = "v1.2.3", isSelected = true, letter = "C"),
    AgentInfo(id = "qwen-code", name = "QwenCode", emoji = "🔵", color = AgentQwen, isConnected = false, version = "v0.8.1", isSelected = false, letter = "Q"),
    AgentInfo(id = "gemini-cli", name = "Gemini CLI", emoji = "🟢", color = AgentGemini, isConnected = false, version = "", isSelected = false, letter = "G"),
    AgentInfo(id = "kimi-code", name = "Kimi Code", emoji = "🟡", color = AgentKimi, isConnected = false, version = "", isSelected = false, letter = "K"),
    AgentInfo(id = "opencode", name = "OpenCode", emoji = "🟠", color = AgentOpenCode, isConnected = false, version = "", isSelected = false, letter = "O")
)

// ═══ Session 示例数据 ═══
private val now = System.currentTimeMillis()

val demoSessions = listOf(
    UiSession("sess-1", "claude-code", "重构 ACP 协议层", true, createdAt = now - 2 * 60_000L, messageCount = 4),
    UiSession("sess-2", "claude-code", "修复 MCP 配置同步", false, createdAt = now - 3_600_000L, messageCount = 2),
    UiSession("sess-3", "qwen-code", "分析项目架构", false, createdAt = now - 3 * 3_600_000L, messageCount = 1),
    UiSession("sess-4", "claude-code", "创建 Gradle 项目骨架", false, createdAt = now - 86_400_000L, messageCount = 6),
    UiSession("sess-5", "qwen-code", "配置 QwenCode 环境", false, createdAt = now - 90_000_000L, messageCount = 3),
    UiSession("sess-6", "claude-code", "设计 Swarm 协议", false, createdAt = now - 3L * 86_400_000L, messageCount = 8)
)

val demoConversation = listOf(
    UiMessage(
        id = "m1", isUser = true,
        text = "帮我重构 ACP 协议层，使用官方 SDK 封装连接管理。重点关注连接池、断线重连和并发安全。",
        timestamp = "17:08"
    ),
    UiMessage(
        id = "m2", isUser = false,
        text = "我已经分析了当前 ACP 实现。现有代码缺少连接生命周期管理，建议拆分为 `AcpConnectionManager` + `AcpSession` 两层。\n\n我建议创建以下类结构，先写 `ConnectionManager`：",
        role = "AGENT",
        timestamp = "17:09",
        agentId = "claude-code",
        toolCards = listOf(
            ToolCardData(
                title = "探索项目", iconType = "search",
                duration = "1 search, 1 file · 420ms",
                output = "\$ grep \"class AcpConnection\" src/\n→ src/main/kotlin/AcpClient.kt:24\n→ src/main/kotlin/legacy/OldAcp.kt:8",
                resultOk = true, resultDuration = "",
                showResult = false
            ),
            ToolCardData(
                title = "编译验证", iconType = "terminal",
                duration = "./gradlew :backend:compileKotlin",
                output = "BUILD SUCCESSFUL in 2.3s\n3 actionable tasks: 3 executed",
                resultOk = true, resultDuration = "2.3s · 0 warnings"
            )
        ),
        codeCards = listOf(
            CodeCardData(
                filename = "AcpConnectionManager.kt", extension = "kt",
                additions = 45, deletions = 12,
                diffLines = listOf(
                    DiffLine(DiffLineType.ADD, null, 1, "class AcpConnectionManager {"),
                    DiffLine(DiffLineType.ADD, null, 2, "    private val connections = mutableMapOf<String, AcpConnection>()"),
                    DiffLine(DiffLineType.ADD, null, 3, "    private val mutex = Mutex()"),
                    DiffLine(DiffLineType.ADD, null, 4, ""),
                    DiffLine(DiffLineType.ADD, null, 5, "    suspend fun connect(config: AgentConfig): AcpConnection {"),
                    DiffLine(DiffLineType.ADD, null, 6, "        return mutex.withLock {"),
                    DiffLine(DiffLineType.ADD, null, 7, "            connections.getOrPut(config.id) {"),
                    DiffLine(DiffLineType.ADD, null, 8, "                val adapter = AgentAdapterFactory.create(config.agentType)"),
                    DiffLine(DiffLineType.ADD, null, 9, "                AcpConnection(config.id, adapter.spawn())"),
                    DiffLine(DiffLineType.ADD, null, 10, "            }"),
                    DiffLine(DiffLineType.ADD, null, 11, "        }"),
                    DiffLine(DiffLineType.ADD, null, 12, "    }"),
                    DiffLine(DiffLineType.ADD, null, 13, "}")
                )
            )
        )
    ),
    UiMessage(
        id = "m3", isUser = false,
        text = "正在审查变更",
        role = "REVIEWING",
        timestamp = "现在",
        isThinking = true,
        agentId = "qwen-code"
    )
)

// ═══ MCP 示例数据 ═══
val demoMcpServers = listOf(
    McpServerDto(
        id = "github", name = "GitHub MCP Server", type = "stdio",
        command = "npx -y @modelcontextprotocol/server-github",
        description = "Connect Claude to GitHub — 仓库、Issues、PR、文件与 Actions。",
        icon = "🐙", version = "1.2.3",
        categories = listOf("Version Control", "Developer Tools", "API"),
        downloads = "23.8K", rating = 4.8, ratingCount = 142,
        repository = "https://github.com/modelcontextprotocol/servers",
        tags = listOf("github"), agents = listOf("claude"),
        env = mapOf("GITHUB_TOKEN" to "ghp_xxxxxxxxxxxxxxxxxxxx"),
        tools = listOf(
            McpToolDto("search_repos", "根据关键词搜索 GitHub 仓库"),
            McpToolDto("get_file", "读取指定仓库文件内容"),
            McpToolDto("create_pr", "创建 Pull Request"),
            McpToolDto("list_issues", "列出仓库 Issues"),
            McpToolDto("merge_pr", "合并指定 PR"),
            McpToolDto("comment_issue", "在 Issue 下添加评论")
        )
    ),
    McpServerDto(
        id = "filesystem", name = "Filesystem MCP", type = "stdio",
        command = "npx -y @modelcontextprotocol/server-filesystem /tmp",
        description = "安全的本地文件系统访问，可配置沙盒目录范围。",
        icon = "📁", version = "0.6.2",
        categories = listOf("File System", "Core"),
        downloads = "48.2K", rating = 4.6, ratingCount = 89,
        repository = "https://github.com/modelcontextprotocol/servers",
        tags = listOf("filesystem"), agents = listOf("claude", "qwen")
    ),
    McpServerDto(
        id = "brave", name = "Brave Search MCP", type = "stdio",
        command = "npx -y @modelcontextprotocol/server-brave-search",
        description = "基于 Brave Search API 的网络搜索，隐私友好。",
        icon = "🔍", version = "0.5.1",
        categories = listOf("Search", "Web", "Research"),
        downloads = "15.6K", rating = 4.5, ratingCount = 67,
        repository = "https://github.com/modelcontextprotocol/servers",
        tags = listOf("brave"), agents = listOf("claude")
    )
)

// ═══ Skill 示例数据 ═══
val demoSkills = listOf(
    SkillDto(id = "code-review", name = "code-review", description = "自动代码审查 — 检查质量、安全与最佳实践，输出结构化报告。", source = "本地", tags = listOf("review", "质量")),
    SkillDto(id = "test-generator", name = "test-generator", description = "自动生成单元测试 — 支持 JUnit、pytest、Jest 多框架。", source = "本地", tags = listOf("test")),
    SkillDto(id = "github-tools", name = "github-tools", description = "GitHub 工具集 — 8 个工具 · 从 github MCP 自动发现并封装。", source = "MCP", tags = listOf("github"))
)
