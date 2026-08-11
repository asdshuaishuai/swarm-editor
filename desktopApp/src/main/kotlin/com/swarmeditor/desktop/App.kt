package com.swarmeditor.desktop

import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.window.WindowDraggableArea
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.WindowScope
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
import com.swarmeditor.desktop.ui.dialog.PiExtensionUiModal
import com.swarmeditor.desktop.ui.session.RightPanel
import com.swarmeditor.desktop.ui.session.TokenUsageSummary
import com.swarmeditor.desktop.ui.chat.ChatArea
import com.swarmeditor.desktop.ui.AgentSideBar
import com.swarmeditor.desktop.ui.PluginSideBar
import com.swarmeditor.desktop.viewmodel.ToastType
import com.swarmeditor.backend.pi.PiQueuedMessageMode
import com.swarmeditor.desktop.ui.agents.AgentOrchestrationView
import com.swarmeditor.desktop.ui.plugins.PluginCenterView
import com.swarmeditor.desktop.ui.activity.ActivityLogView
import com.swarmeditor.desktop.ui.files.FileExplorerView
import com.swarmeditor.desktop.ui.files.DiffDrawer
import com.swarmeditor.desktop.ui.files.RecentFilesPopup
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.navigation.RootComponent
import com.swarmeditor.desktop.navigation.MainConfig
import com.swarmeditor.desktop.navigation.DialogConfig
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.active
import com.swarmeditor.desktop.navigation.MainChild
import com.swarmeditor.desktop.ui.layout.ShellLayout
import com.swarmeditor.desktop.viewmodel.toAgentDto
import com.swarmeditor.desktop.viewmodel.toConfig
import com.swarmeditor.desktop.viewmodel.UiImageAttachment
import com.swarmeditor.common.model.TokenUsage
import com.swarmeditor.backend.pi.PiSessionStats
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import java.awt.Toolkit
import java.awt.Desktop
import java.awt.datatransfer.StringSelection
import java.io.File
import java.util.UUID

@androidx.compose.runtime.Immutable
data class AgentInfo(
    val id: String, val name: String, val emoji: String, val color: Color,
    val isConnected: Boolean = false, val version: String = "",
    val letter: String = name.firstOrNull()?.toString() ?: "?",
    val description: String = "",
    val provider: String = "",
    val model: String = "",
    val enabled: Boolean = true
)

@Composable
fun WindowScope.App(
    root: RootComponent,
    onClose: () -> Unit = {},
    onMinimize: () -> Unit = {},
    onMaximizeToggle: () -> Unit = {},
    onPickImages: () -> List<File> = { emptyList() },
    onOpenWorkspace: () -> Unit = {},
    onCreateWorkspace: () -> Unit = {},
    droppedImageFiles: Flow<List<File>> = emptyFlow(),
    clipboardHasImages: () -> Boolean = { false },
    onReadClipboardImages: suspend () -> List<UiImageAttachment> = { emptyList() },
) {
    // ViewModels are now from RootComponent
    val agents by root.agentVm.agents.collectAsState()
    val swarmRuns by root.swarmVm.runs.collectAsState()
    val swarmArtifactReview by root.swarmVm.artifactReview.collectAsState()
    val swarmArtifactSelectionPreview by root.swarmVm.artifactSelectionPreview.collectAsState()
    val swarmArtifactActionRunning by root.swarmVm.artifactActionRunning.collectAsState()
    val sessions by root.sessionVm.sessions.collectAsState()
    val messages by root.sessionVm.messages.collectAsState()
    val conversationActivities by root.sessionVm.activities.collectAsState()
    val allActivities by root.sessionVm.allActivities.collectAsState()
    val piRuntimeState by root.sessionVm.runtimeState.collectAsState()
    val piRuntimeStats by root.sessionVm.runtimeStats.collectAsState()
    val piCommands by root.sessionVm.piCommands.collectAsState()
    val piModels by root.sessionVm.piModels.collectAsState()
    val piThinkingLevels by root.sessionVm.piThinkingLevels.collectAsState()
    val piSessionTree by root.sessionVm.piSessionTree.collectAsState()
    val sessionTreeLoading by root.sessionVm.sessionTreeLoading.collectAsState()
    val runtimeControlBusy by root.sessionVm.runtimeControlBusy.collectAsState()
    val queuedMessageBusy by root.sessionVm.queuedMessageBusy.collectAsState()
    val piExtensionUiRequest by root.sessionVm.piExtensionUiRequest.collectAsState()
    val piExtensionUiBusy by root.sessionVm.piExtensionUiBusy.collectAsState()
    val piExtensionStatuses by root.sessionVm.piExtensionStatuses.collectAsState()
    val piExtensionWidgets by root.sessionVm.piExtensionWidgets.collectAsState()
    val piExtensionTitle by root.sessionVm.piExtensionTitle.collectAsState()
    val isCompacting by root.sessionVm.isCompacting.collectAsState()
    val activitySessions by root.sessionVm.domainSessions.collectAsState()
    val isSending by root.sessionVm.isSending.collectAsState()
    val currentSessionId by root.sessionVm.currentSessionId.collectAsState()
    val mcpServers by root.mcpVm.servers.collectAsState()
    val skills by root.skillVm.skills.collectAsState()
    val wasmPluginState by root.wasmPluginVm.state.collectAsState()
    val wasmExecution by root.wasmPluginVm.execution.collectAsState()
    val kotlinLspRuntimeState by root.kotlinLspRuntimeVm.state.collectAsState()
    val projectTree by root.projectVm.tree.collectAsState()
    val isProjectLoading by root.projectVm.isLoading.collectAsState()
    val projectTreeError by root.projectVm.treeError.collectAsState()
    val projectFilePreview by root.projectVm.filePreview.collectAsState()
    val projectOpenFiles by root.projectVm.openFiles.collectAsState()
    val projectRecentFiles by root.projectVm.recentFiles.collectAsState()
    val projectDirtyPaths by root.projectVm.dirtyPaths.collectAsState()
    val themeMode by root.themeMode.collectAsState()
    val gitStatus by root.gitVm.status.collectAsState()
    val gitBusy by root.gitVm.isLoading.collectAsState()
    val gitCommitMessage by root.gitVm.commitMessage.collectAsState()
    val primaryModelId by root.settingsVm.primaryModelId.collectAsState()
    val agentConfigPath by root.settingsVm.configPath.collectAsState()
    val modelConfigs by root.settingsVm.models.collectAsState()
    val stackState by root.stack.subscribeAsState()
    val currentConfig = stackState.active.configuration
    val currentChild = stackState.active.instance
    val agentDtos = remember(agents) { agents.map { it.toAgentDto() } }
    // Toast: 从 Channel 收集到本地 mutableStateListOf（compose-skill Effect 模式）
    val toastList = remember { androidx.compose.runtime.mutableStateListOf<com.swarmeditor.desktop.viewmodel.ToastData>() }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        root.toastEvents.collect { toast ->
            toastList.add(toast)
        }
    }
    LaunchedEffect(Unit) {
        root.agentVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.swarmVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.swarmVm.artifactApplied.collect {
            root.gitVm.refresh()
            root.projectVm.load()
        }
    }
    LaunchedEffect(Unit) {
        root.sessionVm.errorEvents.collect { message -> root.showToast(message, ToastType.ERROR) }
    }
    LaunchedEffect(Unit) {
        root.sessionVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.settingsVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.mcpVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.skillVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.wasmPluginVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    LaunchedEffect(Unit) {
        root.kotlinLspRuntimeVm.events.collect { event -> root.showToast(event.message, event.type) }
    }
    val dialogSlot by root.dialog.subscribeAsState()
    val dialog = dialogSlot.child?.configuration
    val detailDialogSlot by root.detailDialog.subscribeAsState()
    val detailDialog = detailDialogSlot.child?.configuration
    var retainedAgentDialogId by remember { mutableStateOf<String?>(null) }
    var retainedMcpDialogId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(detailDialog) {
        when (detailDialog) {
            is DialogConfig.AgentConfig -> retainedAgentDialogId = detailDialog.agentId
            is DialogConfig.McpConfig -> retainedMcpDialogId = detailDialog.serverId
            else -> Unit
        }
    }
    LaunchedEffect(dialog) {
        when (dialog) {
            DialogConfig.CommandPalette -> root.sessionVm.refreshPiCommands()
            DialogConfig.Settings -> root.sessionVm.refreshPiModels()
            else -> Unit
        }
    }
    LaunchedEffect((detailDialog as? DialogConfig.AgentConfig)?.agentId) {
        if ((detailDialog as? DialogConfig.AgentConfig)?.agentId != null) {
            root.settingsVm.refreshPrimaryAgentConfig()
        }
    }
    LaunchedEffect(currentSessionId, piRuntimeState?.sessionId) {
        if (piRuntimeState != null) root.sessionVm.refreshPiModels()
    }
    LaunchedEffect(piModels) {
        if (piModels.isNotEmpty()) root.settingsVm.synchronizePiModelCatalog(piModels)
    }
    val hazeState = rememberHazeState()

    var showRightPanel by remember { mutableStateOf(true) }
    var rightTab by remember {
        mutableStateOf(
            System.getProperty("swarm.rightTab")
                ?.takeIf { it in setOf("changes", "inspector", "branches", "log", "tokens") }
                ?: "changes"
        )
    }
    var diffChange by remember { mutableStateOf<GitFileChangeDto?>(null) }
    var showRecentFiles by remember { mutableStateOf(System.getProperty("swarm.modal") == "recent-files") }
    var pluginSubTab by remember {
        mutableStateOf(
            System.getProperty("swarm.pluginTab")
                ?.takeIf { it in setOf("mcp", "skills", "wasm") }
                ?: "mcp"
        )
    }
    // 插件侧栏点击 → 切换到详情页（如 VS Code 插件页）
    var pluginSelectedItem by remember { mutableStateOf<com.swarmeditor.desktop.ui.plugins.PluginItem?>(null) }
    var requestedPluginDetail by remember { mutableStateOf(System.getProperty("swarm.pluginDetail")) }
    LaunchedEffect(requestedPluginDetail, mcpServers, skills, wasmPluginState.plugins) {
        val request = requestedPluginDetail ?: return@LaunchedEffect
        val item = when {
            request == "mcp:first" -> mcpServers.firstOrNull()?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Mcp)
            request == "skill:first" -> skills.firstOrNull()?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Skill)
            request == "wasm:first" -> wasmPluginState.plugins.firstOrNull()
                ?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Wasm)
            request.startsWith("mcp:") -> mcpServers.find { it.id == request.removePrefix("mcp:") }
                ?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Mcp)
            request.startsWith("skill:") -> skills.find { it.id == request.removePrefix("skill:") }
                ?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Skill)
            request.startsWith("wasm:") -> wasmPluginState.plugins.find { it.id == request.removePrefix("wasm:") }
                ?.let(com.swarmeditor.desktop.ui.plugins.PluginItem::Wasm)
            else -> null
        }
        if (item != null) {
            pluginSubTab = when (item) {
                is com.swarmeditor.desktop.ui.plugins.PluginItem.Mcp -> "mcp"
                is com.swarmeditor.desktop.ui.plugins.PluginItem.Skill -> "skills"
                is com.swarmeditor.desktop.ui.plugins.PluginItem.Wasm -> "wasm"
            }
            pluginSelectedItem = item
            requestedPluginDetail = null
        }
    }
    var inputText by remember { mutableStateOf("") }
    var imageAttachments by remember { mutableStateOf<List<UiImageAttachment>>(emptyList()) }
    var wasSending by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    LaunchedEffect(rightTab, currentSessionId) {
        if (rightTab == "branches") root.sessionVm.refreshPiSessionTree()
    }
    val latestImageAttachments by rememberUpdatedState(imageAttachments)
    val mcpExportJson = remember { Json { prettyPrint = true; encodeDefaults = true } }

    LaunchedEffect(Unit) {
        root.sessionVm.composerDraftEvents.collect { draft ->
            inputText = draft
            root.switchView("chat")
        }
    }
    LaunchedEffect(gitStatus.changes, diffChange?.path) {
        diffChange = diffChange?.let { selected -> gitStatus.changes.firstOrNull { it.path == selected.path } }
    }

    fun copyMcpConfiguration(server: McpServerDto) {
        runCatching {
            val content = mcpExportJson.encodeToString(server.toConfig())
            Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(content), null)
        }.fold(
            onSuccess = { root.showToast("MCP 配置已复制") },
            onFailure = { error -> root.showToast(error.message ?: "复制 MCP 配置失败", ToastType.ERROR) }
        )
    }

    fun editSkill(skill: com.swarmeditor.desktop.api.SkillDto) {
        runCatching {
            check(Desktop.isDesktopSupported()) { "当前环境不支持系统编辑器" }
            val path = File(skill.path)
            val definition = if (path.isDirectory) File(path, "SKILL.md") else path
            require(definition.isFile) { "未找到 ${definition.path}" }
            val desktop = Desktop.getDesktop()
            when {
                desktop.isSupported(Desktop.Action.EDIT) -> desktop.edit(definition)
                desktop.isSupported(Desktop.Action.OPEN) -> desktop.open(definition)
                else -> error("系统不支持打开文件")
            }
        }.fold(
            onSuccess = { root.showToast("已在系统编辑器打开 ${skill.name}") },
            onFailure = { error -> root.showToast(error.message ?: "无法打开 Skill", ToastType.ERROR) }
        )
    }

    fun addPreparedImages(added: List<UiImageAttachment>) {
        root.sessionVm.mergeImageAttachments(latestImageAttachments, added).fold(
            onSuccess = { imageAttachments = it },
            onFailure = { error -> root.showToast(error.message ?: "无法添加图片", ToastType.ERROR) },
        )
    }

    fun addImageFiles(files: List<File>) {
        root.sessionVm.prepareImageAttachments(files.map(File::getAbsolutePath)).fold(
            onSuccess = ::addPreparedImages,
            onFailure = { error -> root.showToast(error.message ?: "无法添加图片", ToastType.ERROR) },
        )
    }

    LaunchedEffect(Unit) {
        root.agentVm.load()
        root.sessionVm.loadSessions()
        root.mcpVm.load()
        root.skillVm.load()
        root.wasmPluginVm.load()
        root.kotlinLspRuntimeVm.load()
        root.projectVm.load()
        root.gitVm.refresh()
        // 截图/测试用：启动时打开指定浮层
        when (System.getProperty("swarm.modal")) {
            "settings" -> root.showSettingsDialog()
            "agent" -> root.showAgentConfigDialog(PRIMARY_AGENT_ID)
            "mcp" -> root.showMcpConfigDialog("github")
            "cmdk" -> root.showCmdKDialog()
        }
    }
    LaunchedEffect(isSending) {
        if (wasSending && !isSending) {
            root.gitVm.refresh()
            root.projectVm.load()
        }
        wasSending = isSending
    }
    LaunchedEffect(currentSessionId) {
        imageAttachments = emptyList()
    }
    LaunchedEffect(droppedImageFiles) {
        droppedImageFiles.collect { files ->
            if (files.isNotEmpty()) addImageFiles(files)
        }
    }
    LaunchedEffect(Unit) {
        root.gitVm.errorEvents.collect { message -> root.showToast(message, ToastType.ERROR) }
    }
    LaunchedEffect(Unit) {
        root.gitVm.successEvents.collect { message -> root.showToast(message, ToastType.SUCCESS) }
    }

    val selectedAgent = root.agentVm.selectedAgent.collectAsState().value
        ?: AgentInfo("", "主智能体未就绪", "", AgentClaude, false, "", "—")
    val derivedOnlineCount by root.agentVm.onlineCount.collectAsState()
    val derivedSessionTitle by root.sessionVm.currentSessionTitle.collectAsState()
    val contextUsageText = piRuntimeStats?.let { stats ->
        val used = stats.contextUsage?.tokens ?: stats.tokens.total
        val window = stats.contextUsage?.contextWindow?.takeIf { it > 0 }
            ?: piRuntimeState?.contextWindow?.takeIf { it > 0 }
        if (window == null) "上下文：${formatTokenCount(used)}" else {
            "上下文：${formatTokenCount(used)} / ${formatTokenCount(window.toLong())}"
        }
    } ?: "上下文：—"
    val tokenUsageSummary = remember(activitySessions, swarmRuns, currentSessionId, piRuntimeStats) {
        val currentStats = piRuntimeStats
        val sessionUsage = activitySessions.fold(TokenUsage()) { total, session ->
            val usage = if (session.id == currentSessionId && currentStats != null) {
                currentStats.toTokenUsage()
            } else {
                session.tokenUsage
            }
            total + usage
        }
        val swarmUsage = swarmRuns
            .flatMap { it.tasks }
            .fold(TokenUsage()) { total, task -> total + task.tokenUsage }
        TokenUsageSummary(total = sessionUsage + swarmUsage, sessions = sessionUsage, swarm = swarmUsage)
    }
    val createSession: () -> Unit = {
        if (selectedAgent.id.isBlank()) root.showToast("主智能体尚未就绪", ToastType.ERROR)
        else root.sessionVm.createSession(selectedAgent.id)
    }

    val handleCommand: (Command) -> Unit = { cmd ->
        when (cmd.id) {
            "new-session" -> createSession()
            "open-workspace" -> onOpenWorkspace()
            "create-workspace" -> onCreateWorkspace()
            "recent-files" -> { showRecentFiles = true }
            "open-settings" -> { root.showSettingsDialog() }
            "view-chat" -> root.switchView("chat")
            "view-agents" -> root.switchView("agents")
            "view-plugins" -> root.switchView("plugins")
            "view-files" -> root.switchView("files")
            "view-activity" -> root.switchView("activity")
            else -> if (cmd.id.startsWith("agent-config:")) {
                root.showAgentConfigDialog(cmd.id.removePrefix("agent-config:"))
            } else if (cmd.id.startsWith("pi-command:")) {
                inputText = "/${cmd.id.removePrefix("pi-command:")} "
                root.switchView("chat")
            }
        }
    }
    val overlayActive = showRecentFiles || diffChange != null || dialog == DialogConfig.Settings || detailDialog != null
    val workspaceScale by animateFloatAsState(
        targetValue = if (overlayActive) 0.994f else 1f,
        animationSpec = Motion.floatGentle,
        label = "workspaceDepthScale",
    )
    val workspaceAlpha by animateFloatAsState(
        targetValue = if (overlayActive) 0.955f else 1f,
        animationSpec = Motion.alphaEnter,
        label = "workspaceDepthAlpha",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when {
                    (keyEvent.isCtrlPressed || keyEvent.isMetaPressed) &&
                        keyEvent.key == Key.V && currentConfig == MainConfig.Chat && clipboardHasImages() -> {
                        coroutineScope.launch {
                            try {
                                addPreparedImages(onReadClipboardImages())
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Throwable) {
                                root.showToast(error.message ?: "无法读取剪贴板图片", ToastType.ERROR)
                            }
                        }
                        true
                    }
                    (keyEvent.isCtrlPressed || keyEvent.isMetaPressed) && keyEvent.key == Key.K -> {
                        showRecentFiles = false
                        root.showCmdKDialog()
                        true
                    }
                    (keyEvent.isCtrlPressed || keyEvent.isMetaPressed) && keyEvent.key == Key.Comma -> {
                        showRecentFiles = false
                        root.showSettingsDialog()
                        true
                    }
                    (keyEvent.isCtrlPressed || keyEvent.isMetaPressed) && keyEvent.key == Key.E -> {
                        if (dialog == null && detailDialog == null && diffChange == null) {
                            showRecentFiles = !showRecentFiles
                            true
                        } else {
                            false
                        }
                    }
                    keyEvent.isCtrlPressed || keyEvent.isMetaPressed -> when (keyEvent.key) {
                        Key.One -> { root.switchView("chat"); true }
                        Key.Two -> { root.switchView("agents"); true }
                        Key.Three -> { root.switchView("plugins"); true }
                        Key.Four -> { root.switchView("files"); true }
                        Key.Five -> { root.switchView("activity"); true }
                        Key.N -> { createSession(); true }
                        Key.B -> { showRightPanel = !showRightPanel; true }
                        else -> false
                    }
                    keyEvent.key == Key.Escape -> when {
                        showRecentFiles -> { showRecentFiles = false; true }
                        detailDialog is DialogConfig.AgentConfig -> { root.closeDetailDialog(); true }
                        detailDialog is DialogConfig.McpConfig -> { root.closeDetailDialog(); true }
                        dialog == DialogConfig.CommandPalette -> { root.closeDialog(); true }
                        dialog == DialogConfig.Settings -> { root.closeDialog(); true }
                        else -> false
                    }
                    else -> false
                }
            }
    ) {
        // Background effects (z-index: 0)
        BackgroundEffects()

    Column(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                scaleX = workspaceScale
                scaleY = workspaceScale
                alpha = workspaceAlpha
            }
            .hazeSource(hazeState)
            .background(Bg0)
    ) {
        // Enhanced TopBar — spans full width
        WindowDraggableArea(Modifier.fillMaxWidth()) {
            EnhancedTopBar(
                projectName = File(root.projectVm.projectPath).name,
                branchName = gitStatus.branch.ifBlank { "—" },
                workspaceLabel = when (currentConfig) {
                    MainConfig.Chat -> "会话"
                    MainConfig.Agents -> "智能体"
                    MainConfig.Plugins -> "插件"
                    MainConfig.Files -> "文件"
                    MainConfig.Activity -> "活动"
                },
                currentAgentName = selectedAgent.name,
                currentAgentId = selectedAgent.id,
                currentAgentColor = selectedAgent.color,
                currentAgentOnline = selectedAgent.isConnected,
                onCmdK = { root.showCmdKDialog() },
                onSettings = { root.showSettingsDialog() },
                onAgent = {
                    if (selectedAgent.id.isBlank()) root.showSettingsDialog()
                    else root.showAgentConfigDialog(selectedAgent.id)
                },
                onProjectSwitcher = { root.switchView("files") },
                onClose = onClose,
                onMinimize = onMinimize,
                onMaximizeToggle = onMaximizeToggle,
            )
        }

        // Main content: Rail | SessionPanel | Center | RightPanel
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val shellLayout = ShellLayout.forWidth(maxWidth.value.toInt())
            Row(Modifier.fillMaxSize()) {
                RailNavigation(
                    currentView = when (currentConfig) {
                        MainConfig.Chat -> "chat"
                        MainConfig.Agents -> "agents"
                        MainConfig.Plugins -> "plugins"
                        MainConfig.Files -> "files"
                        MainConfig.Activity -> "activity"
                    },
                    onSwitchView = { root.switchView(it) },
                    onOpenGit = { root.switchView("files") },
                    modifier = Modifier.fillMaxHeight()
                )

                if (shellLayout.showLeftSidebar && currentConfig in setOf(MainConfig.Chat, MainConfig.Plugins)) {
                    Box(Modifier.width(shellLayout.leftSidebarWidth.dp).fillMaxHeight()) {
                        when (currentConfig) {
                            MainConfig.Chat -> SessionPanel(
                                selectedAgent = selectedAgent,
                                sessions = sessions,
                                currentSessionId = currentSessionId,
                                onSelectSession = { root.sessionVm.selectSession(it) },
                                onCreateSession = createSession,
                                modifier = Modifier.fillMaxSize(),
                                agents = agents,
                            )
                            MainConfig.Plugins -> PluginSideBar(
                                mcpServers = mcpServers,
                                skills = skills,
                                wasmPlugins = wasmPluginState.plugins,
                                wasmRuntime = wasmPluginState.runtime,
                                onSelectMcp = { pluginSelectedItem = com.swarmeditor.desktop.ui.plugins.PluginItem.Mcp(it) },
                                onSelectSkill = { pluginSelectedItem = com.swarmeditor.desktop.ui.plugins.PluginItem.Skill(it) },
                                onSelectWasm = { pluginSelectedItem = com.swarmeditor.desktop.ui.plugins.PluginItem.Wasm(it) },
                                onAdd = {
                                    when (pluginSubTab) {
                                        "mcp" -> root.showMcpConfigDialog(UUID.randomUUID().toString())
                                        "skills" -> root.skillVm.scan()
                                        "wasm" -> root.wasmPluginVm.openPluginDirectory()
                                    }
                                },
                                activeTab = pluginSubTab,
                                onTabChange = { tab ->
                                    pluginSubTab = tab
                                    pluginSelectedItem = null
                                },
                                selectedMcpId = (pluginSelectedItem as? com.swarmeditor.desktop.ui.plugins.PluginItem.Mcp)?.server?.id,
                                selectedSkillId = (pluginSelectedItem as? com.swarmeditor.desktop.ui.plugins.PluginItem.Skill)?.skill?.id,
                                selectedWasmId = (pluginSelectedItem as? com.swarmeditor.desktop.ui.plugins.PluginItem.Wasm)?.plugin?.id,
                                modifier = Modifier.fillMaxSize(),
                            )
                            else -> Unit
                        }
                    }
                }

                Row(Modifier.weight(1f).fillMaxHeight()) {
                    Box(Modifier.weight(1f).fillMaxHeight()) {
                        when (currentConfig) {
                            MainConfig.Chat -> ChatArea(
                                selectedAgent = selectedAgent,
                                messages = messages,
                                isSending = isSending,
                                inputText = inputText,
                                attachments = imageAttachments,
                                onInputChange = { inputText = it },
                                onSend = {
                                    when {
                                        selectedAgent.id.isBlank() -> root.showToast("主智能体尚未就绪", ToastType.ERROR)
                                        !selectedAgent.isConnected -> root.showToast("请先连接 ${selectedAgent.name}", ToastType.ERROR)
                                        root.sessionVm.sendMessage(inputText, selectedAgent.id, imageAttachments) -> {
                                            inputText = ""
                                            imageAttachments = emptyList()
                                        }
                                    }
                                },
                                onSteer = {
                                    if (root.sessionVm.sendQueuedMessage(
                                            inputText,
                                            imageAttachments,
                                            PiQueuedMessageMode.STEER,
                                        )) {
                                        inputText = ""
                                        imageAttachments = emptyList()
                                    }
                                },
                                onFollowUp = {
                                    if (root.sessionVm.sendQueuedMessage(
                                            inputText,
                                            imageAttachments,
                                            PiQueuedMessageMode.FOLLOW_UP,
                                        )) {
                                        inputText = ""
                                        imageAttachments = emptyList()
                                    }
                                },
                                onAttach = {
                                    runCatching { onPickImages() }
                                        .onFailure { root.showToast(it.message ?: "选择图片失败", ToastType.ERROR) }
                                        .onSuccess { files ->
                                            if (files.isNotEmpty()) addImageFiles(files)
                                        }
                                },
                                onRemoveAttachment = { id ->
                                    imageAttachments = imageAttachments.filterNot { it.id == id }
                                },
                                onCancel = root.sessionVm::cancelSending,
                                modifier = Modifier.fillMaxSize(),
                                agents = agents,
                                sessionTitle = derivedSessionTitle ?: selectedAgent.name,
                                contextUsageText = contextUsageText,
                                mcpServers = mcpServers,
                                piCommands = piCommands,
                                canQueueMessage = piRuntimeState?.isStreaming == true,
                                queuedMessageBusy = queuedMessageBusy,
                            )
                            MainConfig.Agents -> AgentOrchestrationView(
                                agents = agentDtos,
                                swarmRuns = swarmRuns,
                                onStartSwarm = { objective ->
                                    root.swarmVm.createAndStart(objective, selectedAgent.id)
                                },
                                onCancelSwarm = root.swarmVm::cancel,
                                onRetrySwarm = root.swarmVm::retry,
                                artifactReview = swarmArtifactReview,
                                artifactSelectionPreview = swarmArtifactSelectionPreview,
                                artifactActionRunning = swarmArtifactActionRunning,
                                onReviewArtifact = root.swarmVm::reviewArtifact,
                                onApplyArtifact = root.swarmVm::applyArtifact,
                                onRejectArtifact = root.swarmVm::rejectArtifact,
                                onPreviewArtifactSelection = root.swarmVm::previewArtifactSelection,
                                onArtifactReviewViewportChanged = root.swarmVm::observeArtifactReviewViewport,
                                onCloseArtifactReview = root.swarmVm::closeArtifactReview,
                                onRefresh = { root.agentVm.scan() },
                                onConfigClick = { root.showAgentConfigDialog(it.config.id) },
                                modifier = Modifier.fillMaxSize()
                            )
                            MainConfig.Plugins -> PluginCenterView(
                                mcpServers = mcpServers,
                                skills = skills,
                                wasmPlugins = wasmPluginState.plugins,
                                wasmRuntime = wasmPluginState.runtime,
                                wasmValidationErrors = wasmPluginState.validationErrors,
                                wasmPluginDirectory = wasmPluginState.pluginDirectory,
                                wasmExecution = wasmExecution,
                                wasmInstallingRuntime = wasmPluginState.isInstallingRuntime,
                                agents = agents,
                                modifier = Modifier.fillMaxSize(),
                                activeTab = pluginSubTab,
                                selectedItem = pluginSelectedItem,
                                onSelectedItemChange = { pluginSelectedItem = it },
                                onRefresh = {
                                    when (pluginSubTab) {
                                        "mcp" -> root.mcpVm.reload()
                                        "skills" -> root.skillVm.scan()
                                        "wasm" -> root.wasmPluginVm.refresh()
                                    }
                                },
                                onAddMcp = {
                                    root.showMcpConfigDialog(UUID.randomUUID().toString())
                                },
                                onOpenWasmDirectory = root.wasmPluginVm::openPluginDirectory,
                                onInstallWasmRuntime = root.wasmPluginVm::installRuntime,
                                onWasmInputChange = root.wasmPluginVm::updateTestInput,
                                onExecuteWasm = root.wasmPluginVm::execute,
                                onConfigureMcp = root::showMcpConfigDialog,
                                onCopyMcp = ::copyMcpConfiguration,
                                onDeleteMcp = root.mcpVm::delete,
                                onEditSkill = ::editSkill,
                            )
                            MainConfig.Files -> FileExplorerView(
                                tree = projectTree,
                                isLoading = isProjectLoading,
                                error = projectTreeError,
                                onRefresh = { root.projectVm.load() },
                                gitStatus = gitStatus,
                                filePreview = projectFilePreview,
                                openFiles = projectOpenFiles,
                                dirtyPaths = projectDirtyPaths,
                                onSelectFile = root.projectVm::selectFile,
                                onCloseFile = root.projectVm::closeFile,
                                onOpenDiff = { diffChange = it },
                                onOpenWorkspace = onOpenWorkspace,
                                onCreateWorkspace = onCreateWorkspace,
                                onInspectPosition = root.projectVm::inspectPosition,
                                onOpenDefinition = root.projectVm::openDefinition,
                                onDismissPositionInsight = root.projectVm::clearPositionInsight,
                                onBeginEdit = root.projectVm::beginEditing,
                                onDraftChange = root.projectVm::updateDraft,
                                onSaveEdit = root.projectVm::saveEditing,
                                onCancelEdit = root.projectVm::cancelEditing,
                                projectPath = root.projectVm.projectPath,
                                modifier = Modifier.fillMaxSize()
                            )
                            MainConfig.Activity -> ActivityLogView(
                                sessions = activitySessions,
                                activities = allActivities,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }

                    if (shellLayout.shouldMountRightPanel(showRightPanel, currentConfig == MainConfig.Chat)) {
                        RightPanel(
                            currentTab = rightTab,
                            onTabChange = { rightTab = it },
                            gitStatus = gitStatus,
                            gitBusy = gitBusy,
                            gitCommitMessage = gitCommitMessage,
                            activities = conversationActivities,
                            piRuntimeState = piRuntimeState,
                            piRuntimeStats = piRuntimeStats,
                            piModels = piModels,
                            piThinkingLevels = piThinkingLevels,
                            piSessionTree = piSessionTree,
                            sessionTreeLoading = sessionTreeLoading,
                            runtimeControlBusy = runtimeControlBusy,
                            isCompacting = isCompacting,
                            tokenUsageSummary = tokenUsageSummary,
                            onCompactContext = root.sessionVm::compactCurrentSession,
                            onRefreshModels = root.sessionVm::refreshPiModels,
                            onSetModel = root.sessionVm::setPiModel,
                            onSetThinkingLevel = root.sessionVm::setPiThinkingLevel,
                            onSetAutoCompaction = root.sessionVm::setPiAutoCompaction,
                            onSetAutoRetry = root.sessionVm::setPiAutoRetry,
                            onAbortRetry = root.sessionVm::abortPiRetry,
                            onSetSteeringMode = root.sessionVm::setPiSteeringMode,
                            onSetFollowUpMode = root.sessionVm::setPiFollowUpMode,
                            onRefreshSessionTree = root.sessionVm::refreshPiSessionTree,
                            onForkSession = root.sessionVm::forkPiSession,
                            onCloneSession = root.sessionVm::clonePiSession,
                            onSynchronizeSession = root.sessionVm::synchronizePiSession,
                            onExportSession = root.sessionVm::exportPiSessionHtml,
                            onStageFile = root.gitVm::stage,
                            onStageAll = root.gitVm::stageAll,
                            onUnstageFile = root.gitVm::unstage,
                            onUnstageAll = root.gitVm::unstageAll,
                            onGitRefresh = root.gitVm::refresh,
                            onGitCommitMessageChange = root.gitVm::setCommitMessage,
                            onGitCommit = root.gitVm::commit,
                            onOpenDiff = { diffChange = it },
                            modifier = Modifier.width(shellLayout.rightPanelWidth.dp).fillMaxHeight()
                        )
                    }
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
            branch = gitStatus.branch.ifBlank { "—" },
            gitStagedAdd = gitStatus.staged,
            gitStagedDel = 0,
            gitModified = gitStatus.modified,
            gitUntracked = gitStatus.untracked
        )
    }

    DiffDrawer(
        change = diffChange,
        onDismiss = { diffChange = null },
        onStage = root.gitVm::stage,
        onUnstage = root.gitVm::unstage,
    )

    AnimatedVisibility(
        visible = showRecentFiles,
        enter = Motion.modalEnter(OverlayDepth.PRIMARY),
        exit = Motion.modalExit(OverlayDepth.PRIMARY),
    ) {
        RecentFilesPopup(
            recentFiles = projectRecentFiles,
            currentPath = projectFilePreview.path,
            dirtyPaths = projectDirtyPaths,
            onDismiss = { showRecentFiles = false },
            onOpenFile = { path ->
                root.switchView("files")
                root.projectVm.selectFile(path)
                showRecentFiles = false
            },
        )
    }

    AnimatedVisibility(
        visible = dialog == DialogConfig.Settings,
        enter = Motion.modalEnter(OverlayDepth.PRIMARY),
        exit = Motion.modalExit(OverlayDepth.PRIMARY),
    ) {
        SettingsModal(
            agents = agents.ifEmpty { listOf(selectedAgent) },
            settingsVm = root.settingsVm,
            onClose = { root.closeDialog() },
            mcpServers = mcpServers,
            skills = skills,
            themeMode = themeMode,
            onThemeChange = root::setTheme,
            projectPath = root.projectVm.projectPath,
            kotlinLspState = kotlinLspRuntimeState,
            onRefreshKotlinLsp = root.kotlinLspRuntimeVm::refresh,
            onInstallKotlinLsp = root.kotlinLspRuntimeVm::install,
            onProbeKotlinLsp = root.kotlinLspRuntimeVm::probe,
            onOpenKotlinLspDirectory = root.kotlinLspRuntimeVm::openRuntimeDirectory,
            piModels = piModels,
            onRefreshPiModels = root.sessionVm::refreshPiModels,
            onRefreshMcp = root.mcpVm::reload,
            onAddMcp = { root.showMcpConfigDialog(UUID.randomUUID().toString()) },
            onEditMcp = root::showMcpConfigDialog
        )
    }

    AnimatedVisibility(
        visible = detailDialog is DialogConfig.AgentConfig,
        enter = Motion.modalEnter(OverlayDepth.SECONDARY),
        exit = Motion.modalExit(OverlayDepth.SECONDARY),
    ) {
        AgentConfigModal(
            agentId = retainedAgentDialogId,
            agents = agents,
            models = modelConfigs,
            primaryModelId = primaryModelId,
            configPath = agentConfigPath,
            onSave = { modelId ->
                root.settingsVm.setPrimaryModel(modelId)
            },
            onConnect = { root.agentVm.connect(it) },
            onDisconnect = { root.agentVm.disconnect(it) },
            onDismiss = { root.closeDetailDialog() }
        )
    }

    AnimatedVisibility(
        visible = detailDialog is DialogConfig.McpConfig,
        enter = Motion.modalEnter(OverlayDepth.SECONDARY),
        exit = Motion.modalExit(OverlayDepth.SECONDARY),
    ) {
        McpConfigModal(
            serverId = retainedMcpDialogId,
            servers = mcpServers,
            agents = agents,
            onSave = root.mcpVm::upsert,
            onDelete = root.mcpVm::delete,
            onDismiss = { root.closeDetailDialog() }
        )
    }

    CommandPalette(
        isVisible = dialog == DialogConfig.CommandPalette,
        hazeState = hazeState,
        onDismiss = { root.closeDialog() },
        onCommand = handleCommand,
        agents = agents,
        piCommands = piCommands,
    )

    PiExtensionStatusOverlay(
        title = piExtensionTitle,
        statuses = piExtensionStatuses,
        widgets = piExtensionWidgets.values.toList(),
    )

    piExtensionUiRequest?.let { request ->
        PiExtensionUiModal(
            request = request,
            busy = piExtensionUiBusy,
            onRespond = root.sessionVm::respondToPiExtensionUi,
        )
    }

    ToastHost(
        toasts = toastList,
        onDismiss = { toastList.removeAll { t -> t.id == it } }
    )
    }
}

@Composable
private fun PiExtensionStatusOverlay(
    title: String?,
    statuses: Map<String, String>,
    widgets: List<com.swarmeditor.desktop.viewmodel.PiExtensionWidget>,
) {
    if (title == null && statuses.isEmpty() && widgets.isEmpty()) return
    Box(Modifier.fillMaxSize().padding(top = 54.dp, end = 18.dp), contentAlignment = Alignment.TopEnd) {
        Column(
            modifier = Modifier
                .width(320.dp)
                .layeredSurface(OverlayDepth.PRIMARY, bg = Bg2, border = Line2, shape = AppShapes.lg)
                .padding(14.dp),
        ) {
            Text(title ?: "Pi Extension", color = Tx, style = AppType.body, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
            statuses.values.forEach { status ->
                Text(status, color = Tx2, style = AppType.bodySm, modifier = Modifier.padding(top = 5.dp))
            }
            widgets.forEach { widget ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 9.dp)
                        .surfaceCard(bg = Bg3, border = Line, shape = AppShapes.md)
                        .padding(10.dp),
                ) {
                    widget.lines.forEach { line -> Text(line, color = Tx2, style = AppType.bodySm) }
                }
            }
        }
    }
}

private fun formatTokenCount(tokens: Long): String = when {
    tokens >= 1_000_000 -> "%.1fM".format(tokens / 1_000_000.0)
    tokens >= 1_000 -> "%.1fK".format(tokens / 1_000.0)
    else -> tokens.toString()
}

private fun PiSessionStats.toTokenUsage() = TokenUsage(
    input = tokens.input,
    output = tokens.output,
    cacheRead = tokens.cacheRead,
    cacheWrite = tokens.cacheWrite,
    total = tokens.total,
    cost = cost,
)
