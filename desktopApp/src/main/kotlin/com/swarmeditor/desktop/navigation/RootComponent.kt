package com.swarmeditor.desktop.navigation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.bringToFront
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.slot.ChildSlot
import com.arkivanov.decompose.router.slot.SlotNavigation
import com.arkivanov.decompose.router.slot.activate
import com.arkivanov.decompose.router.slot.childSlot
import com.arkivanov.decompose.router.slot.dismiss
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.doOnDestroy
import com.swarmeditor.desktop.viewmodel.AgentViewModel
import com.swarmeditor.desktop.viewmodel.SessionViewModel
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.KotlinLspRuntimeViewModel
import com.swarmeditor.desktop.viewmodel.McpViewModel
import com.swarmeditor.desktop.viewmodel.SkillViewModel
import com.swarmeditor.desktop.viewmodel.ProjectViewModel
import com.swarmeditor.desktop.viewmodel.GitViewModel
import com.swarmeditor.desktop.viewmodel.WorkspaceViewModel
import com.swarmeditor.desktop.viewmodel.ToastData
import com.swarmeditor.desktop.viewmodel.ToastType
import com.swarmeditor.desktop.viewmodel.SwarmViewModel
import com.swarmeditor.desktop.viewmodel.WasmPluginViewModel
import com.swarmeditor.desktop.theme.AppThemeMode
import com.swarmeditor.desktop.theme.ThemePreferences
import com.swarmeditor.backend.agentService
import com.swarmeditor.backend.conversationService
import com.swarmeditor.backend.mcpService
import com.swarmeditor.backend.modelService
import com.swarmeditor.backend.sessionService
import com.swarmeditor.backend.skillService
import com.swarmeditor.backend.projectService
import com.swarmeditor.backend.gitService
import com.swarmeditor.backend.projectRoot
import com.swarmeditor.backend.workspaceService
import com.swarmeditor.backend.piRuntimeManager
import com.swarmeditor.backend.swarmService
import com.swarmeditor.backend.wasmPluginService
import com.swarmeditor.backend.kotlinLspRuntimeService
import com.swarmeditor.backend.lspService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.serializer

class RootComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val agentVm = AgentViewModel(agentService, scope)
    val sessionVm = SessionViewModel(sessionService, conversationService, scope)
    val settingsVm = SettingsViewModel(agentService, mcpService, skillService, scope, modelService)
    val mcpVm = McpViewModel(mcpService, sessionVm.runtimeState, scope)
    val skillVm = SkillViewModel(skillService, scope)
    val wasmPluginVm = WasmPluginViewModel(wasmPluginService, scope)
    val kotlinLspRuntimeVm = KotlinLspRuntimeViewModel(kotlinLspRuntimeService, lspService, scope)
    val gitVm = GitViewModel(gitService, scope)
    val projectVm = ProjectViewModel(projectService, scope, gitStatus = gitVm.status)
    val workspaceVm = WorkspaceViewModel(
        service = workspaceService,
        projectRoot = projectRoot,
        scope = scope,
        onWorkspaceChanged = {
            sessionVm.resetForWorkspace()
            piRuntimeManager.closeAll()
            projectVm.load()
            gitVm.refresh()
            gitVm.refreshHistory()
        },
    )
    val swarmVm = SwarmViewModel(swarmService, scope)
    private val _themeMode = MutableStateFlow(ThemePreferences.load())
    val themeMode: StateFlow<AppThemeMode> = _themeMode.asStateFlow()

    init {
        lifecycle.doOnDestroy { scope.cancel() }
        System.getProperty("swarm.file")
            ?.takeIf(String::isNotBlank)
            ?.let(projectVm::selectFile)
    }
    private val _toastChannel = Channel<ToastData>(Channel.BUFFERED)
    val toastEvents: Flow<ToastData> = _toastChannel.receiveAsFlow()

    fun showToast(message: String, type: ToastType = ToastType.INFO) {
        scope.launch { _toastChannel.send(ToastData(message = message, type = type)) }
    }

    fun setTheme(theme: AppThemeMode) {
        _themeMode.value = theme
        ThemePreferences.save(theme)
    }

    // ── Navigation: childStack ──
    private val nav = StackNavigation<MainConfig>()

    val stack: Value<ChildStack<MainConfig, MainChild>> = childStack(
        source = nav,
        serializer = serializer<MainConfig>(),
        initialConfiguration = initialConfig(),
        handleBackButton = false,
        childFactory = { config, _ -> createChild(config) }
    )

    private fun initialConfig(): MainConfig = when (System.getProperty("swarm.view")) {
        "agents" -> MainConfig.Agents
        "plugins" -> MainConfig.Plugins
        "files" -> MainConfig.Files
        "activity" -> MainConfig.Activity
        else -> MainConfig.Chat
    }

    private fun createChild(config: MainConfig): MainChild = when (config) {
        MainConfig.Chat -> MainChild.Chat(agentVm, sessionVm, mcpVm, skillVm)
        MainConfig.Agents -> MainChild.Agents(agentVm)
        MainConfig.Plugins -> MainChild.Plugins(mcpVm, skillVm, wasmPluginVm)
        MainConfig.Files -> MainChild.Files
        MainConfig.Activity -> MainChild.Activity
    }

    fun switchView(config: MainConfig) { nav.bringToFront(config) }

    fun switchView(viewName: String) {
        val config = when (viewName) {
            "chat" -> MainConfig.Chat
            "agents" -> MainConfig.Agents
            "plugins" -> MainConfig.Plugins
            "files" -> MainConfig.Files
            "activity" -> MainConfig.Activity
            else -> MainConfig.Chat
        }
        nav.bringToFront(config)
    }

    // ── Dialogs: primary + detail layers ──
    private val dialogNav = SlotNavigation<DialogConfig>()
    private val detailDialogNav = SlotNavigation<DialogConfig>()

    val dialog: Value<ChildSlot<DialogConfig, DialogChild>> = childSlot(
        source = dialogNav,
        serializer = serializer<DialogConfig>(),
        key = "PrimaryDialogSlot",
        handleBackButton = true,
        childFactory = { config, _ -> createDialogChild(config) }
    )

    val detailDialog: Value<ChildSlot<DialogConfig, DialogChild>> = childSlot(
        source = detailDialogNav,
        serializer = serializer<DialogConfig>(),
        key = "DetailDialogSlot",
        handleBackButton = true,
        childFactory = { config, _ -> createDialogChild(config) },
    )

    private fun createDialogChild(config: DialogConfig): DialogChild = when (config) {
        is DialogConfig.Settings -> DialogChild.Settings(settingsVm, agentVm, mcpVm, skillVm)
        is DialogConfig.AgentConfig -> DialogChild.AgentConfig(config.agentId, agentVm)
        is DialogConfig.McpConfig -> DialogChild.McpConfig(config.serverId, mcpVm)
        is DialogConfig.CommandPalette -> DialogChild.CommandPalette(agentVm)
        DialogConfig.WorkspaceCreate -> DialogChild.WorkspaceCreate(workspaceVm)
    }

    fun openDialog(config: DialogConfig) {
        when (config) {
            DialogConfig.Settings,
            DialogConfig.CommandPalette,
            DialogConfig.WorkspaceCreate -> dialogNav.activate(config)
            is DialogConfig.AgentConfig,
            is DialogConfig.McpConfig -> detailDialogNav.activate(config)
        }
    }
    fun closeDialog() { dialogNav.dismiss {} }
    fun closeDetailDialog() { detailDialogNav.dismiss {} }
    fun showSettingsDialog() { openDialog(DialogConfig.Settings) }
    fun showAgentConfigDialog(agentId: String) { openDialog(DialogConfig.AgentConfig(agentId)) }
    fun showMcpConfigDialog(serverId: String) { openDialog(DialogConfig.McpConfig(serverId)) }
    fun showCmdKDialog() { openDialog(DialogConfig.CommandPalette) }
    fun showWorkspaceCreateDialog() { openDialog(DialogConfig.WorkspaceCreate) }
    fun hideCmdKDialog() { closeDialog() }
    fun dismissAgentConfigDialog() { closeDetailDialog() }
    fun dismissMcpConfigDialog() { closeDetailDialog() }
}

sealed class MainChild {
    data class Chat(val agentVm: AgentViewModel, val sessionVm: SessionViewModel, val mcpVm: McpViewModel, val skillVm: SkillViewModel) : MainChild()
    data class Agents(val agentVm: AgentViewModel) : MainChild()
    data class Plugins(
        val mcpVm: McpViewModel,
        val skillVm: SkillViewModel,
        val wasmPluginVm: WasmPluginViewModel,
    ) : MainChild()
    data object Files : MainChild()
    data object Activity : MainChild()
}

sealed class DialogChild {
    data class Settings(val settingsVm: SettingsViewModel, val agentVm: AgentViewModel, val mcpVm: McpViewModel, val skillVm: SkillViewModel) : DialogChild()
    data class AgentConfig(val agentId: String, val agentVm: AgentViewModel) : DialogChild()
    data class McpConfig(val serverId: String, val mcpVm: McpViewModel) : DialogChild()
    data class CommandPalette(val agentVm: AgentViewModel) : DialogChild()
    data class WorkspaceCreate(val workspaceVm: WorkspaceViewModel) : DialogChild()
}
