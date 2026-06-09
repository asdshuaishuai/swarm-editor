package com.swarmeditor.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.agent.AgentBar
import com.swarmeditor.desktop.ui.common.StatusBar
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
        // 主内容区
        Row(Modifier.weight(1f).fillMaxWidth()) {
            // 左侧 Agent 图标栏
            AgentBar(
                agents = agents.ifEmpty { listOf(selectedAgent) },
                selectedAgent = selectedAgent,
                onSelectAgent = { agentVm.selectAgent(it.id) },
                onScan = { agentVm.scan() },
                modifier = Modifier.fillMaxHeight()
            )

            // 左侧栏：会话 + 项目
            SessionPanel(
                selectedAgent = selectedAgent,
                sessions = sessions,
                currentSessionId = currentSessionId,
                onSelectSession = { sessionVm.selectSession(it) },
                onCreateSession = { sessionVm.createSession(selectedAgent.id) },
                modifier = Modifier.width(260.dp).fillMaxHeight()
            )

            // 中间 + 右侧
            Column(Modifier.weight(1f).fillMaxHeight()) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth().height(52.dp).background(Bg2).border(1.dp, Bd).padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(selectedAgent.color.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(selectedAgent.emoji, fontSize = 12.sp)
                            Spacer(Modifier.width(6.dp))
                            Text(selectedAgent.name, color = selectedAgent.color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.width(10.dp))
                    val currentSession = sessions.find { it.id == currentSessionId }
                    Text(currentSession?.title ?: "新会话", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Box(modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).clickable { showRightPanel = !showRightPanel }, contentAlignment = Alignment.Center) {
                        Text("☰", color = Tx3, fontSize = 15.sp)
                    }
                    Spacer(Modifier.width(4.dp))
                    Box(modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).clickable { showSettings = true }, contentAlignment = Alignment.Center) {
                        Text("⚙️", color = Tx3, fontSize = 15.sp)
                    }
                }

                // 对话区 + 右侧面板
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    when (currentView) {
                        "chat" -> {
                            ChatArea(
                                selectedAgent = selectedAgent, messages = messages, isSending = isSending,
                                inputText = inputText, onInputChange = { inputText = it },
                                onSend = { sessionVm.sendMessage(inputText, selectedAgent.id); inputText = "" },
                                modifier = Modifier.weight(1f).fillMaxHeight()
                            )
                            if (showRightPanel) {
                                RightPanel(
                                    selectedAgent = selectedAgent, currentTab = rightTab, onTabChange = { rightTab = it },
                                    mcpServers = mcpServers, skills = skills,
                                    modifier = Modifier.width(320.dp).fillMaxHeight()
                                )
                            }
                        }
                        "agents" -> {
                            Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                                Text("Agents View", color = Tx, fontSize = 18.sp)
                            }
                            if (showRightPanel) {
                                RightPanel(
                                    selectedAgent = selectedAgent, currentTab = rightTab, onTabChange = { rightTab = it },
                                    mcpServers = mcpServers, skills = skills,
                                    modifier = Modifier.width(320.dp).fillMaxHeight()
                                )
                            }
                        }
                        "plugins" -> {
                            Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                                Text("Plugins View", color = Tx, fontSize = 18.sp)
                            }
                            if (showRightPanel) {
                                RightPanel(
                                    selectedAgent = selectedAgent, currentTab = rightTab, onTabChange = { rightTab = it },
                                    mcpServers = mcpServers, skills = skills,
                                    modifier = Modifier.width(320.dp).fillMaxHeight()
                                )
                            }
                        }
                        "files" -> {
                            Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                                Text("Files View", color = Tx, fontSize = 18.sp)
                            }
                            if (showRightPanel) {
                                RightPanel(
                                    selectedAgent = selectedAgent, currentTab = rightTab, onTabChange = { rightTab = it },
                                    mcpServers = mcpServers, skills = skills,
                                    modifier = Modifier.width(320.dp).fillMaxHeight()
                                )
                            }
                        }
                        "activity" -> {
                            Box(Modifier.weight(1f).fillMaxHeight().background(Bg), contentAlignment = Alignment.Center) {
                                Text("Activity View", color = Tx, fontSize = 18.sp)
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
                }
            }
        }

        // 底部状态栏
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
