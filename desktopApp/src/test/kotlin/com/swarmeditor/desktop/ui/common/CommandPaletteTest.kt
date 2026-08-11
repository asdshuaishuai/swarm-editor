package com.swarmeditor.desktop.ui.common

import androidx.compose.ui.graphics.Color
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.backend.pi.PiCommandInfo
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.desktop.api.FileNodeDto
import kotlin.test.Test
import kotlin.test.assertEquals

class CommandPaletteTest {
    @Test
    fun `find in files remains a dedicated navigation action`() {
        val command = buildCommands(emptyList()).single { it.id == "find-in-files" }

        assertEquals("在文件中查找", command.name)
        assertEquals("导航", command.group)
        assertEquals("Ctrl/Cmd+Shift+F", command.shortcut)
    }

    @Test
    fun `lazy list index includes group headers`() {
        val commands = listOf(
            Command("one", "One", "Workspace"),
            Command("two", "Two", "Workspace"),
            Command("three", "Three", "Pi"),
        )

        assertEquals(1, commandPaletteLazyIndex(commands, 0))
        assertEquals(2, commandPaletteLazyIndex(commands, 1))
        assertEquals(4, commandPaletteLazyIndex(commands, 2))
        assertEquals(0, commandPaletteLazyIndex(commands, 3))
    }

    @Test
    fun `command palette exposes only the primary agent configuration`() {
        val commands = buildCommands(
            listOf(
                AgentInfo(
                    id = "pi-default",
                    name = "主智能体",
                    emoji = "",
                    color = Color.Magenta,
                )
            )
        )

        val agentCommands = commands.filter { it.group == "主智能体配置" }
        assertEquals(1, agentCommands.size)
        assertEquals("agent-config:pi-default", agentCommands.single().id)
        assertEquals("配置 主智能体", agentCommands.single().name)
    }

    @Test
    fun `command palette exposes recent files navigation`() {
        val commands = buildCommands(emptyList())
        val command = commands.single { it.id == "recent-files" }

        assertEquals("最近文件", command.name)
        assertEquals("导航", command.group)
        assertEquals("Ctrl/Cmd+E", command.shortcut)
        assertEquals("Ctrl+Alt+←", commands.single { it.id == "navigate-back" }.shortcut)
        assertEquals("Ctrl+Alt+→", commands.single { it.id == "navigate-forward" }.shortcut)
    }

    @Test
    fun `search everywhere flattens project files and ranks file names before paths`() {
        val tree = FileNodeDto(
            name = "project",
            path = "",
            isDirectory = true,
            children = listOf(
                FileNodeDto("src", "src", true, listOf(FileNodeDto("Main.kt", "src/Main.kt"))),
                FileNodeDto("docs", "docs", true, listOf(FileNodeDto("main-guide.md", "docs/main-guide.md"))),
                FileNodeDto("README.md", "README.md"),
            ),
        )

        val files = projectFilePaths(tree)
        val results = searchEverywhereCommands(
            baseCommands = emptyList(),
            projectFiles = files,
            recentFiles = emptyList(),
            symbols = emptyList(),
            currentPath = null,
            query = "main",
        )

        assertEquals(listOf("src/Main.kt", "docs/main-guide.md"), results.mapNotNull { it.filePath })
        assertEquals(listOf("Main.kt", "main-guide.md"), results.map { it.name })
    }

    @Test
    fun `search everywhere mixes current symbols and actions after file results`() {
        val results = searchEverywhereCommands(
            baseCommands = listOf(Command("open-settings", "打开设置", "命令")),
            projectFiles = listOf("docs/settings.md"),
            recentFiles = emptyList(),
            symbols = listOf(SourceSymbol("SettingsPanel", "Class", 42, "UI")),
            currentPath = "desktopApp/Settings.kt",
            query = "settings",
        )

        assertEquals(listOf("文件", "符号"), results.take(2).map { it.group })
        assertEquals("desktopApp/Settings.kt", results[1].filePath)
        assertEquals(42, results[1].line)
        assertEquals("命令", results.last().group)
    }

    @Test
    fun `blank search shows distinct recent files before actions`() {
        val results = searchEverywhereCommands(
            baseCommands = listOf(Command("open-settings", "打开设置", "命令")),
            projectFiles = listOf("ignored.kt"),
            recentFiles = listOf("README.md", "src/Main.kt", "README.md"),
            symbols = emptyList(),
            currentPath = null,
            query = "",
        )

        assertEquals(listOf("README.md", "src/Main.kt"), results.take(2).mapNotNull { it.filePath })
        assertEquals("命令", results.last().group)
    }

    @Test
    fun `search everywhere keyboard selection wraps`() {
        assertEquals(2, movedCommandIndex(0, -1, 3))
        assertEquals(0, movedCommandIndex(2, 1, 3))
        assertEquals(0, movedCommandIndex(0, 1, 0))
    }

    @Test
    fun `search everywhere excludes generated and dependency roots`() {
        val results = searchEverywhereCommands(
            baseCommands = emptyList(),
            projectFiles = listOf(
                "desktopApp/src/main/Main.kt",
                "desktopApp/build/generated/Main.kt",
                "pi-0.83.0/packages/agent/dist/main.js",
                "web/node_modules/pkg/main.js",
            ),
            recentFiles = emptyList(),
            symbols = emptyList(),
            currentPath = null,
            query = "main",
        )

        assertEquals(listOf("desktopApp/src/main/Main.kt"), results.mapNotNull { it.filePath })
    }

    @Test
    fun `command palette groups live pi commands by source`() {
        val commands = buildCommands(
            agents = emptyList(),
            piCommands = listOf(
                PiCommandInfo("skill:review", "Review changes", "skill"),
                PiCommandInfo("release", "Prepare release", "prompt"),
                PiCommandInfo("mcp-status", "", "extension"),
            ),
        )

        assertEquals("Pi Skills", commands.single { it.id == "pi-command:skill:review" }.group)
        assertEquals("Pi Prompt Templates", commands.single { it.id == "pi-command:release" }.group)
        assertEquals("Pi Extensions", commands.single { it.id == "pi-command:mcp-status" }.group)
    }
}
