package com.swarmeditor.desktop

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
import com.swarmeditor.desktop.ui.dialog.AgentConfigDialog
import com.swarmeditor.desktop.ui.session.RightPanel
import com.swarmeditor.desktop.ui.session.ChatArea
import com.swarmeditor.desktop.viewmodel.AgentViewModel
import com.swarmeditor.desktop.viewmodel.SessionViewModel
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.McpViewModel
import com.swarmeditor.desktop.viewmodel.SkillViewModel
import com.swarmeditor.desktop.viewmodel.MainViewModel
import com.swarmeditor.desktop.ui.agents.AgentOrchestrationView
import com.swarmeditor.desktop.ui.plugins.PluginCenterView
import com.swarmeditor.desktop.ui.activity.ActivityLogView
import com.swarmeditor.desktop.ui.files.FileExplorerView
import com.swarmeditor.desktop.api.AgentDto

data class AgentInfo(
    val id: String, val name: String, val emoji: String, val color: Color,
    val isConnected: Boolean = false, val version: String = "", val isSelected: Boolean = false
)

@Composable
fun App() {
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
    var rightTab by remember { mutableStateOf("mcp") }
    var inputText by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        agentVm.load()
        sessionVm.loadSessions()
        mcpVm.load()
        skillVm.load()
    }

    val selectedAgent = agents.firstOrNull { it.isSelected } ?: agents.firstOrNull()
        ?: AgentInfo("claude-code", "Claude Code", "🟣", Pr)

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
                if (keyEvent.type == KeyEventType.KeyDown && keyEvent.isCtrlPressed && keyEvent.key == Key.K) {
                    mainVm.showCmdKDialog()
                    true
                } else if (keyEvent.type == KeyEventType.KeyDown && keyEvent.key == Key.Escape && showCmdK) {
                    mainVm.hideCmdKDialog()
                    true
                } else {
                    false
                }
            }
    ) {
    Column(Modifier.fillMaxSize().background(Bg)) {
        // Enhanced TopBar — spans full width
        EnhancedTopBar(
            projectName = "swarm-editor",
            branchName = "main",
            agentCount = agents.ifEmpty { listOf(selectedAgent) }.size,
            onlineCount = agents.count { it.isConnected }.coerceAtLeast(2),
            unreadNotifications = 3,
            onCmdK = { mainVm.showCmdKDialog() },
            onNotifications = { /* TODO: notification panel */ },
            onSettings = { showSettings = true },
            onUserAvatar = { /* TODO: user menu */ }
        )

        // Main content: Rail | SessionPanel | Center | RightPanel
        Row(Modifier.weight(1f).fillMaxWidth()) {
            // Left Rail Navigation
            RailNavigation(
                currentView = currentView,
                onSwitchView = { mainVm.switchView(it) },
                modifier = Modifier.fillMaxHeight()
            )

            // Session sidebar
            SessionPanel(
                selectedAgent = selectedAgent,
                sessions = sessions,
                currentSessionId = currentSessionId,
                onSelectSession = { sessionVm.selectSession(it) },
                onCreateSession = { sessionVm.createSession(selectedAgent.id) },
                modifier = Modifier.width(260.dp).fillMaxHeight(),
                agents = agents
            )

            // Center content + Right panel
            Row(Modifier.weight(1f).fillMaxHeight()) {
                when (currentView) {
                    "chat" -> {
                        ChatArea(
                            selectedAgent = selectedAgent, messages = messages, isSending = isSending,
                            inputText = inputText, onInputChange = { inputText = it },
                            onSend = { sessionVm.sendMessage(inputText, selectedAgent.id); inputText = "" },
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                            agents = agents,
                            onMcpClick = { mainVm.switchView("plugins") },
                            onSkillClick = { mainVm.switchView("plugins") }
                        )
                    }
                    "agents" -> {
                        AgentOrchestrationView(
                            agents = emptyList(),
                            onConfigClick = { mainVm.showAgentConfigDialog(it.config.id) },
                            onAddAgent = { mainVm.showToast("Add Agent clicked") },
                            modifier = Modifier.weight(1f).fillMaxHeight()
                        )
                    }
                    "plugins" -> {
                        PluginCenterView(
                            mcpServers = mcpServers,
                            skills = skills,
                            modifier = Modifier.weight(1f).fillMaxHeight()
                        )
                    }
                    "files" -> {
                        FileExplorerView(modifier = Modifier.weight(1f).fillMaxHeight())
                    }
                    "activity" -> {
                        ActivityLogView(
                            modifier = Modifier.weight(1f).fillMaxHeight()
                        )
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
            isConnected = selectedAgent.isConnected,
            mcpCount = mcpServers.size,
            skillCount = skills.size
        )
    }

    if (showSettings) {
        SettingsModal(agents = agents.ifEmpty { listOf(selectedAgent) }, settingsVm = settingsVm, onClose = { showSettings = false })
    }

    val showAgentConfig by mainVm.showAgentConfig.collectAsState()
    if (showAgentConfig != null) {
        AgentConfigDialog(agentId = showAgentConfig, onDismiss = { mainVm.dismissAgentConfigDialog() })
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
