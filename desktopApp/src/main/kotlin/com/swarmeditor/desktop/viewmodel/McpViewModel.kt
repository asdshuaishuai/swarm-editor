package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.McpToolDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class McpViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _servers = MutableStateFlow<List<McpServerDto>>(emptyList())
    val servers: StateFlow<List<McpServerDto>> = _servers

    // 设计稿示例 MCP Servers（mvp-design-mockup.html · mcpServers）
    private val mockServers = listOf(
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

    fun load() {
        scope.launch { _servers.value = mockServers }
    }
}
