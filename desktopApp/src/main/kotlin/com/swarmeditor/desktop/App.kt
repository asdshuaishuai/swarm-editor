package com.swarmeditor.desktop

import androidx.compose.animation.Crossfade
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
import com.swarmeditor.desktop.viewmodel.AgentViewModel
import com.swarmeditor.desktop.viewmodel.SessionViewModel
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.McpViewModel
import com.swarmeditor.desktop.viewmodel.SkillViewModel
import com.swarmeditor.desktop.viewmodel.MainViewModel
import com.swarmeditor.desktop.viewmodel.ToastType
import com.swarmeditor.desktop.ui.agents.AgentOrchestrationView
import com.swarmeditor.desktop.ui.plugins.PluginCenterView
import com.swarmeditor.desktop.ui.activity.ActivityLogView
import com.swarmeditor.desktop.ui.files.FileExplorerView
import com.swarmeditor.desktop.api.AgentDto

data class AgentInfo(
    val id: String, val name: String, val emoji: String, val color: Color,
    val isConnected: Boolean = false, val version: String = "", val isSelected: Boolean = false,
    val letter: String = name.firstOrNull()?.toString() ?: "?"
)

@Composable
fun App(onClose: () -> Unit = {}, onDragWindow: (Float, Float) -> Unit = { _, _ -> }) {
    val agentVm = remember { AgentViewModel() }
    val sessionVm = remember { SessionViewModel() }
    val settingsVm = remember { SettingsViewModel() }
    val mcpVm = remember { McpViewModel() }
    val skillVm = remember { SkillViewModel() }
    val mainVm = remember { MainViewModel() }

    val agents by agentVm.agents.collectAsState()
    val sessions by sessionVm.sessions.collectAsState()
    val messages by sessionVm.messages.collectAsState()
    val isSending by sessionVm.isSending.collectAsState()
    val currentSessionId by sessionVm.currentSessionId.collectAsState()
    val mcpServers by mcpVm.servers.collectAsState()
    val skills by skillVm.skills.collectAsState()
    val currentView by mainVm.currentView.collectAsState()
    val toasts by mainVm.toasts.collectAsState()
    val showCmdK by mainVm.showCmdK.collectAsState()

    var showSettings by remember { mutableStateOf(false) }
    var showRightPanel by remember { mutableStateOf(true) }
    var rightTab by remember { mutableStateOf("changes") }
    var pluginSubTab by remember { mutableStateOf("mcp") }
    var showMcpConfig by remember { mutableStateOf<String?>(null) }
    var inputText by remember { mutableStateOf("") }
    val showAgentConfig by mainVm.showAgentConfig.collectAsState()

    LaunchedEffect(Unit) {
        agentVm.load()
        sessionVm.loadSessions()
        mcpVm.load()
        skillVm.load()
        // 截图/测试用：启动时打开指定浮层
        when (System.getProperty("swarm.modal")) {
            "settings" -> showSettings = true
            "agent" -> mainVm.showAgentConfigDialog("claude-code")
            "mcp" -> showMcpConfig = "github"
            "cmdk" -> mainVm.showCmdKDialog()
        }
    }

    val selectedAgent = agentVm.selectedAgent.collectAsState().value
        ?: AgentInfo("claude-code", "Claude Code", "🟣", AgentClaude, true, "1.0.0", true, "C")
    val derivedOnlineCount by agentVm.onlineCount.collectAsState()
    val derivedSessionTitle by sessionVm.currentSessionTitle.collectAsState()

    val handleCommand: (Command) -> Unit = { cmd ->
        when (cmd.id) {
            "new-session" -> sessionVm.createSession(selectedAgent.id)
            "open-settings" -> { showSettings = true }
            "view-chat" -> mainVm.switchView("chat")
            "view-agents" -> mainVm.switchView("agents")
            "view-plugins" -> mainVm.switchView("plugins")
            "view-files" -> mainVm.switchView("files")
            "view-activity" -> mainVm.switchView("activity")
            else -> mainVm.showToast("Command: ${cmd.name}")
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when {
                    keyEvent.isCtrlPressed && keyEvent.key == Key.K -> { mainVm.showCmdKDialog(); true }
                    keyEvent.isCtrlPressed && keyEvent.key == Key.Comma -> { showSettings = true; true }
                    keyEvent.isCtrlPressed -> when (keyEvent.key) {
                        Key.One -> { mainVm.switchView("chat"); true }
                        Key.Two -> { mainVm.switchView("agents"); true }
                        Key.Three -> { mainVm.switchView("plugins"); true }
                        Key.Four -> { mainVm.switchView("files"); true }
                        Key.Five -> { mainVm.switchView("activity"); true }
                        Key.N -> { sessionVm.createSession(selectedAgent.id); true }
                        Key.B -> { showRightPanel = !showRightPanel; true }
                        else -> false
                    }
                    keyEvent.key == Key.Escape -> when {
                        showCmdK -> { mainVm.hideCmdKDialog(); true }
                        showSettings -> { showSettings = false; true }
                        showAgentConfig != null -> { mainVm.dismissAgentConfigDialog(); true }
                        showMcpConfig != null -> { showMcpConfig = null; true }
                        else -> false
                    }
                    else -> false
                }
            }
    ) {
        // Background effects (z-index: 0)
        BackgroundEffects()

    Column(Modifier.fillMaxSize().background(Bg)) {
        // Enhanced TopBar — spans full width
        EnhancedTopBar(
            projectName = "swarm-editor",
            branchName = "main",
            agentCount = agents.ifEmpty { listOf(selectedAgent) }.size,
            onlineCount = derivedOnlineCount,
            unreadNotifications = 3,
            onCmdK = { mainVm.showCmdKDialog() },
            onNotifications = { mainVm.showToast("没有新通知", ToastType.INFO) },
            onSettings = { showSettings = true },
            onUserAvatar = { mainVm.showToast("Swarmer", ToastType.INFO) },
            onProjectSwitcher = { mainVm.showToast("项目切换器", ToastType.INFO) },
            onSwarmStatus = { mainVm.switchView("agents") },
            onClose = onClose,
            onDragWindow = onDragWindow
        )

        // Main content: Rail | SessionPanel | Center | RightPanel
        Row(Modifier.weight(1f).fillMaxWidth()) {
            // Left Rail Navigation
            RailNavigation(
                currentView = currentView,
                onSwitchView = { mainVm.switchView(it) },
                onOpenGit = { mainVm.showToast("Git: 3 commits ahead") },
                onOpenTerminal = { mainVm.showToast("终端功能即将上线") },
                modifier = Modifier.fillMaxHeight()
            )

            // 左侧栏：按视图切换（对齐核心稿 renderSide）
            when (currentView) {
                "chat" -> SessionPanel(
                    selectedAgent = selectedAgent,
                    sessions = sessions,
                    currentSessionId = currentSessionId,
                    onSelectSession = { sessionVm.selectSession(it) },
                    onCreateSession = { sessionVm.createSession(selectedAgent.id) },
                    modifier = Modifier.width(260.dp).fillMaxHeight(),
                    agents = agents
                )
                "agents" -> AgentSideBar(
                    agents = agents,
                    onSelect = { mainVm.showAgentConfigDialog(it.id) },
                    onAdd = { mainVm.showToast("添加 Agent 向导即将上线") },
                    modifier = Modifier.fillMaxHeight()
                )
                "plugins" -> PluginSideBar(
                    mcpServers = mcpServers,
                    skills = skills,
                    onSelectMcp = { showMcpConfig = it.id },
                    onSelectSkill = { mainVm.switchView("plugins") },
                    onAdd = { mainVm.showToast("添加插件") },
                    activeTab = pluginSubTab,
                    onTabChange = { pluginSubTab = it },
                    modifier = Modifier.fillMaxHeight()
                )
                else -> {}
            }

            // Center content + Right panel
            Row(Modifier.weight(1f).fillMaxHeight()) {
                Crossfade(
                    targetState = currentView,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    animationSpec = tween(250),
                    label = "viewSwitch"
                ) { view ->
                    when (view) {
                        "chat" -> {
                            ChatArea(
                                selectedAgent = selectedAgent, messages = messages, isSending = isSending,
                                inputText = inputText, onInputChange = { inputText = it },
                                onSend = { sessionVm.sendMessage(inputText, selectedAgent.id); inputText = "" },
                                modifier = Modifier.fillMaxSize(),
                                agents = agents,
                                sessionTitle = derivedSessionTitle ?: selectedAgent.name,
                                onSelectAgent = { agentVm.selectAgent(it) },
                                onMcpClick = { mainVm.switchView("plugins") },
                                onSkillClick = { mainVm.switchView("plugins") }
                            )
                        }
                        "agents" -> {
                            AgentOrchestrationView(
                                agents = emptyList(),
                                onConfigClick = { mainVm.showAgentConfigDialog(it.config.id) },
                                onAddAgent = { mainVm.showToast("Add Agent clicked") },
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                        "plugins" -> {
                            PluginCenterView(
                                mcpServers = mcpServers,
                                skills = skills,
                                modifier = Modifier.fillMaxSize(),
                                activeTab = pluginSubTab
                            )
                        }
                        "files" -> {
                            FileExplorerView(modifier = Modifier.fillMaxSize())
                        }
                        "activity" -> {
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

    if (showSettings) {
        SettingsModal(
            agents = agents.ifEmpty { listOf(selectedAgent) },
            settingsVm = settingsVm,
            onClose = { showSettings = false },
            mcpServers = mcpServers,
            skills = skills
        )
    }

    if (showAgentConfig != null) {
        AgentConfigModal(agentId = showAgentConfig, agents = agents, onDismiss = { mainVm.dismissAgentConfigDialog() })
    }

    if (showMcpConfig != null) {
        McpConfigModal(serverId = showMcpConfig, servers = mcpServers, onDismiss = { showMcpConfig = null })
    }

    CommandPalette(
        isVisible = showCmdK,
        onDismiss = { mainVm.hideCmdKDialog() },
        onCommand = handleCommand,
        agentNames = agents.map { it.name }
    )

    ToastHost(
        toasts = toasts,
        onDismiss = { mainVm.dismissToast(it) }
    )
    }
}
