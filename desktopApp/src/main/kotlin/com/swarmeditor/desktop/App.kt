package com.swarmeditor.desktop

import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.CommandPalette
import com.swarmeditor.desktop.ui.common.Command
import com.swarmeditor.desktop.ui.common.StatusBar
import com.swarmeditor.desktop.ui.common.ToastHost
import com.swarmeditor.desktop.ui.navigation.EnhancedTopBar
import com.swarmeditor.desktop.ui.navigation.RailNavigation
import com.swarmeditor.desktop.ui.session.SessionPanel
import com.swarmeditor.desktop.ui.settings.SettingsModal
import com.swarmeditor.desktop.ui.dialog.AgentConfigModal
import com.swarmeditor.desktop.ui.dialog.McpConfigModal
import com.swarmeditor.desktop.ui.session.RightPanel
import com.swarmeditor.desktop.ui.chat.ChatArea
import com.swarmeditor.desktop.ui.AgentSideBar
import com.swarmeditor.desktop.ui.PluginSideBar
import com.swarmeditor.desktop.viewmodel.ToastType
import com.swarmeditor.desktop.ui.agents.AgentOrchestrationView
import com.swarmeditor.desktop.ui.plugins.PluginCenterView
import com.swarmeditor.desktop.ui.activity.ActivityLogView
import com.swarmeditor.desktop.ui.files.FileExplorerView
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.navigation.RootComponent
import com.swarmeditor.desktop.navigation.MainConfig
import com.swarmeditor.desktop.navigation.DialogConfig
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.active
import com.swarmeditor.desktop.navigation.MainChild

@androidx.compose.runtime.Immutable
data class AgentInfo(
    val id: String, val name: String, val emoji: String, val color: Color,
    val isConnected: Boolean = false, val version: String = "", val isSelected: Boolean = false,
    val letter: String = name.firstOrNull()?.toString() ?: "?"
)

@Composable
fun App(
    root: RootComponent,
    onClose: () -> Unit = {},
    onMinimize: () -> Unit = {},
    onMaximizeToggle: () -> Unit = {},
    onDragWindow: (Float, Float) -> Unit = { _, _ -> }
) {
    // ViewModels are now from RootComponent
    val agents by root.agentVm.agents.collectAsState()
    val sessions by root.sessionVm.sessions.collectAsState()
    val messages by root.sessionVm.messages.collectAsState()
    val isSending by root.sessionVm.isSending.collectAsState()
    val currentSessionId by root.sessionVm.currentSessionId.collectAsState()
    val mcpServers by root.mcpVm.servers.collectAsState()
    val skills by root.skillVm.skills.collectAsState()
    val stackState by root.stack.subscribeAsState()
    val currentConfig = stackState.active.configuration
    val currentChild = stackState.active.instance
    // Toast: 从 Channel 收集到本地 mutableStateListOf（compose-skill Effect 模式）
    val toastList = remember { androidx.compose.runtime.mutableStateListOf<com.swarmeditor.desktop.viewmodel.ToastData>() }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        root.toastEvents.collect { toast ->
            toastList.add(toast)
        }
    }
    val dialogSlot by root.dialog.subscribeAsState()
    val dialog = dialogSlot.child?.configuration
    val hazeState = rememberHazeState()

    var showRightPanel by remember { mutableStateOf(true) }
    var rightTab by remember { mutableStateOf("changes") }
    var pluginSubTab by remember { mutableStateOf("mcp") }
    // 插件侧栏点击 → 切换到详情页（如 VS Code 插件页）
    var pluginSelectedItem by remember { mutableStateOf<com.swarmeditor.desktop.ui.plugins.PluginItem?>(null) }
    var inputText by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        root.agentVm.load()
        root.sessionVm.loadSessions()
        root.mcpVm.load()
        root.skillVm.load()
        // 截图/测试用：启动时打开指定浮层
        when (System.getProperty("swarm.modal")) {
            "settings" -> root.showSettingsDialog()
            "agent" -> root.showAgentConfigDialog("claude-code")
            "mcp" -> root.showMcpConfigDialog("github")
            "cmdk" -> root.showCmdKDialog()
        }
    }

    val selectedAgent = root.agentVm.selectedAgent.collectAsState().value
        ?: AgentInfo("claude-code", "Claude Code", "🟣", AgentClaude, true, "1.0.0", true, "C")
    val derivedOnlineCount by root.agentVm.onlineCount.collectAsState()
    val derivedSessionTitle by root.sessionVm.currentSessionTitle.collectAsState()

    val handleCommand: (Command) -> Unit = { cmd ->
        when (cmd.id) {
            "new-session" -> root.sessionVm.createSession(selectedAgent.id)
            "open-settings" -> { root.showSettingsDialog() }
            "view-chat" -> root.switchView("chat")
            "view-agents" -> root.switchView("agents")
            "view-plugins" -> root.switchView("plugins")
            "view-files" -> root.switchView("files")
            "view-activity" -> root.switchView("activity")
            else -> root.showToast("Command: ${cmd.name}")
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when {
                    keyEvent.isCtrlPressed && keyEvent.key == Key.K -> { root.showCmdKDialog(); true }
                    keyEvent.isCtrlPressed && keyEvent.key == Key.Comma -> { root.showSettingsDialog(); true }
                    keyEvent.isCtrlPressed -> when (keyEvent.key) {
                        Key.One -> { root.switchView("chat"); true }
                        Key.Two -> { root.switchView("agents"); true }
                        Key.Three -> { root.switchView("plugins"); true }
                        Key.Four -> { root.switchView("files"); true }
                        Key.Five -> { root.switchView("activity"); true }
                        Key.N -> { root.sessionVm.createSession(selectedAgent.id); true }
                        Key.B -> { showRightPanel = !showRightPanel; true }
                        else -> false
                    }
                    keyEvent.key == Key.Escape -> when {
                        dialog == DialogConfig.CommandPalette -> { root.closeDialog(); true }
                        dialog == DialogConfig.Settings -> { root.closeDialog(); true }
                        dialog is DialogConfig.AgentConfig -> { root.closeDialog(); true }
                        dialog is DialogConfig.McpConfig -> { root.closeDialog(); true }
                        else -> false
                    }
                    else -> false
                }
            }
    ) {
        // Background effects (z-index: 0)
        BackgroundEffects()

    Column(Modifier.fillMaxSize().hazeSource(hazeState).background(Bg0)) {
        // Enhanced TopBar — spans full width
        EnhancedTopBar(
            projectName = "swarm-editor",
            branchName = "main",
            agentCount = agents.ifEmpty { listOf(selectedAgent) }.size,
            onlineCount = derivedOnlineCount,
            unreadNotifications = 3,
            onCmdK = { root.showCmdKDialog() },
            onNotifications = { root.showToast("没有新通知", ToastType.INFO) },
            onSettings = { root.showSettingsDialog() },
            onUserAvatar = { root.showToast("Swarmer", ToastType.INFO) },
            onProjectSwitcher = { root.showToast("项目切换器", ToastType.INFO) },
            onSwarmStatus = { root.switchView("agents") },
            onClose = onClose,
            onMinimize = onMinimize,
            onMaximizeToggle = onMaximizeToggle,
            onDragWindow = onDragWindow
        )

        // Main content: Rail | SessionPanel | Center | RightPanel
        Row(Modifier.weight(1f).fillMaxWidth()) {
            // Left Rail Navigation
            RailNavigation(
                currentView = when (currentConfig) {
                    MainConfig.Chat -> "chat"
                    MainConfig.Agents -> "agents"
                    MainConfig.Plugins -> "plugins"
                    MainConfig.Files -> "files"
                    MainConfig.Activity -> "activity"
                },
                onSwitchView = { root.switchView(it) },
                onOpenGit = { root.showToast("Git: 3 commits ahead") },
                onOpenTerminal = { root.showToast("终端功能即将上线") },
                modifier = Modifier.fillMaxHeight()
            )

            // 左侧栏：按视图切换（对齐核心稿 renderSide）
            when (currentConfig) {
                MainConfig.Chat -> SessionPanel(
                    selectedAgent = selectedAgent,
                    sessions = sessions,
                    currentSessionId = currentSessionId,
                    onSelectSession = { root.sessionVm.selectSession(it) },
                    onCreateSession = { root.sessionVm.createSession(selectedAgent.id) },
                    modifier = Modifier.width(260.dp).fillMaxHeight(),
                    agents = agents
                )
                MainConfig.Agents -> AgentSideBar(
                    agents = agents,
                    onSelect = { root.showAgentConfigDialog(it.id) },
                    onAdd = { root.showToast("添加 Agent 向导即将上线") },
                    modifier = Modifier.fillMaxHeight()
                )
                MainConfig.Plugins -> PluginSideBar(
                    mcpServers = mcpServers,
                    skills = skills,
                    onSelectMcp = { pluginSelectedItem = com.swarmeditor.desktop.ui.plugins.PluginItem.Mcp(it) },
                    onSelectSkill = { pluginSelectedItem = com.swarmeditor.desktop.ui.plugins.PluginItem.Skill(it) },
                    onAdd = { root.showToast("添加插件") },
                    activeTab = pluginSubTab,
                    onTabChange = { pluginSubTab = it },
                    selectedMcpId = (pluginSelectedItem as? com.swarmeditor.desktop.ui.plugins.PluginItem.Mcp)?.server?.id,
                    selectedSkillId = (pluginSelectedItem as? com.swarmeditor.desktop.ui.plugins.PluginItem.Skill)?.skill?.id,
                    modifier = Modifier.fillMaxHeight()
                )
                else -> {}
            }

            // Center content + Right panel
            Row(Modifier.weight(1f).fillMaxHeight()) {
                Crossfade(
                    targetState = currentConfig,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    animationSpec = tween(450, delayMillis = 30, easing = FastOutSlowInEasing),
                    label = "viewSwitch"
                ) { view ->
                    when (view) {
                        MainConfig.Chat -> {
                            ChatArea(
                                selectedAgent = selectedAgent, messages = messages, isSending = isSending,
                                inputText = inputText, onInputChange = { inputText = it },
                                onSend = { root.sessionVm.sendMessage(inputText, selectedAgent.id); inputText = "" },
                                modifier = Modifier.fillMaxSize(),
                                agents = agents,
                                sessionTitle = derivedSessionTitle ?: selectedAgent.name,
                                onSelectAgent = { root.agentVm.selectAgent(it) },
                                onMcpClick = { root.switchView("plugins") },
                                onSkillClick = { root.switchView("plugins") }
                            )
                        }
                        MainConfig.Agents -> {
                            AgentOrchestrationView(
                                agents = emptyList(),
                                onConfigClick = { root.showAgentConfigDialog(it.config.id) },
                                onAddAgent = { root.showToast("Add Agent clicked") },
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                        MainConfig.Plugins -> {
                            PluginCenterView(
                                mcpServers = mcpServers,
                                skills = skills,
                                modifier = Modifier.fillMaxSize(),
                                activeTab = pluginSubTab,
                                selectedItem = pluginSelectedItem,
                                onSelectedItemChange = { pluginSelectedItem = it }
                            )
                        }
                        MainConfig.Files -> {
                            FileExplorerView(modifier = Modifier.fillMaxSize())
                        }
                        MainConfig.Activity -> {
                            ActivityLogView(
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }
                }

                if (showRightPanel) {
                    RightPanel(
                        selectedAgent = selectedAgent, currentTab = rightTab, onTabChange = { rightTab = it },
                        mcpServers = mcpServers, skills = skills,
                        modifier = Modifier.width(320.dp).fillMaxHeight()
                    )
                }
            }
        }

        // Bottom status bar
        StatusBar(
            agentName = selectedAgent.name,
            agentColor = selectedAgent.color,
            isConnected = selectedAgent.isConnected,
            mcpCount = mcpServers.size,
            skillCount = skills.size,
            gitStagedAdd = 3,
            gitStagedDel = 1,
            gitModified = 2,
            gitUntracked = 1
        )
    }

    if (dialog == DialogConfig.Settings) {
        SettingsModal(
            agents = agents.ifEmpty { listOf(selectedAgent) },
            settingsVm = root.settingsVm,
            onClose = { root.closeDialog() },
            mcpServers = mcpServers,
            skills = skills
        )
    }

    if (dialog is DialogConfig.AgentConfig) {
        AgentConfigModal(
            agentId = (dialog as DialogConfig.AgentConfig).agentId,
            agents = agents,
            onDismiss = { root.closeDialog() }
        )
    }

    if (dialog is DialogConfig.McpConfig) {
        McpConfigModal(
            serverId = (dialog as DialogConfig.McpConfig).serverId,
            servers = mcpServers,
            onDismiss = { root.closeDialog() }
        )
    }

    CommandPalette(
        isVisible = dialog == DialogConfig.CommandPalette,
        hazeState = hazeState,
        onDismiss = { root.closeDialog() },
        onCommand = handleCommand,
        agentNames = agents.map { it.name }
    )

    ToastHost(
        toasts = toastList,
        onDismiss = { toastList.removeAll { t -> t.id == it } }
    )
    }
}
