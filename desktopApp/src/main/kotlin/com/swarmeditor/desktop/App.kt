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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.StatusBar
import com.swarmeditor.desktop.ui.navigation.EnhancedTopBar
import com.swarmeditor.desktop.ui.navigation.RailNavigation
import com.swarmeditor.desktop.ui.session.SessionPanel
import com.swarmeditor.desktop.ui.settings.SettingsModal
import com.swarmeditor.desktop.ui.session.RightPanel
import com.swarmeditor.desktop.ui.session.ChatArea
import com.swarmeditor.desktop.viewmodel.AgentViewModel
import com.swarmeditor.desktop.viewmodel.SessionViewModel
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.McpViewModel
import com.swarmeditor.desktop.viewmodel.SkillViewModel
import com.swarmeditor.desktop.viewmodel.MainViewModel

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
                modifier = Modifier.width(260.dp).fillMaxHeight()
            )

            // Center content + Right panel
            Row(Modifier.weight(1f).fillMaxHeight()) {
                when (currentView) {
                    "chat" -> {
                        ChatArea(
                            selectedAgent = selectedAgent, messages = messages, isSending = isSending,
                            inputText = inputText, onInputChange = { inputText = it },
                            onSend = { sessionVm.sendMessage(inputText, selectedAgent.id); inputText = "" },
                            modifier = Modifier.weight(1f).fillMaxHeight()
                        )
                    }
                    "agents" -> {
                        Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                            Text("Agents View", color = Tx, fontSize = 18.sp)
                        }
                    }
                    "plugins" -> {
                        Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                            Text("Plugins View", color = Tx, fontSize = 18.sp)
                        }
                    }
                    "files" -> {
                        Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                            Text("Files View", color = Tx, fontSize = 18.sp)
                        }
                    }
                    "activity" -> {
                        Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                            Text("Activity View", color = Tx, fontSize = 18.sp)
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
            isConnected = selectedAgent.isConnected,
            mcpCount = mcpServers.size,
            skillCount = skills.size
        )
    }

    if (showSettings) {
        SettingsModal(agents = agents.ifEmpty { listOf(selectedAgent) }, settingsVm = settingsVm, onClose = { showSettings = false })
    }
}
