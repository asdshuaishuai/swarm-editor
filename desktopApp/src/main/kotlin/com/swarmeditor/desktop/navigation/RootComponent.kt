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
import com.swarmeditor.desktop.viewmodel.AgentViewModel
import com.swarmeditor.desktop.viewmodel.SessionViewModel
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.McpViewModel
import com.swarmeditor.desktop.viewmodel.SkillViewModel
import com.swarmeditor.desktop.viewmodel.ToastData
import com.swarmeditor.desktop.viewmodel.ToastType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.serializer

class RootComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    val agentVm = AgentViewModel()
    val sessionVm = SessionViewModel()
    val settingsVm = SettingsViewModel()
    val mcpVm = McpViewModel()
    val skillVm = SkillViewModel()

    private val scope = CoroutineScope(Dispatchers.Default)
    private val _toastChannel = Channel<ToastData>(Channel.BUFFERED)
    val toastEvents: Flow<ToastData> = _toastChannel.receiveAsFlow()

    fun showToast(message: String, type: ToastType = ToastType.INFO) {
        scope.launch { _toastChannel.send(ToastData(message = message, type = type)) }
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
        MainConfig.Plugins -> MainChild.Plugins(mcpVm, skillVm)
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

    // ── Dialogs: childSlot ──
    private val dialogNav = SlotNavigation<DialogConfig>()

    val dialog: Value<ChildSlot<DialogConfig, DialogChild>> = childSlot(
        source = dialogNav,
        serializer = serializer<DialogConfig>(),
        handleBackButton = true,
        childFactory = { config, _ -> createDialogChild(config) }
    )

    private fun createDialogChild(config: DialogConfig): DialogChild = when (config) {
        is DialogConfig.Settings -> DialogChild.Settings(settingsVm, agentVm, mcpVm, skillVm)
        is DialogConfig.AgentConfig -> DialogChild.AgentConfig(config.agentId, agentVm)
        is DialogConfig.McpConfig -> DialogChild.McpConfig(config.serverId, mcpVm)
        is DialogConfig.CommandPalette -> DialogChild.CommandPalette(agentVm)
    }

    fun openDialog(config: DialogConfig) { dialogNav.activate(config) }
    fun closeDialog() { dialogNav.dismiss {} }
    fun showSettingsDialog() { openDialog(DialogConfig.Settings) }
    fun showAgentConfigDialog(agentId: String) { openDialog(DialogConfig.AgentConfig(agentId)) }
    fun showMcpConfigDialog(serverId: String) { openDialog(DialogConfig.McpConfig(serverId)) }
    fun showCmdKDialog() { openDialog(DialogConfig.CommandPalette) }
    fun hideCmdKDialog() { closeDialog() }
    fun dismissAgentConfigDialog() { closeDialog() }
    fun dismissMcpConfigDialog() { closeDialog() }
}

sealed class MainChild {
    data class Chat(val agentVm: AgentViewModel, val sessionVm: SessionViewModel, val mcpVm: McpViewModel, val skillVm: SkillViewModel) : MainChild()
    data class Agents(val agentVm: AgentViewModel) : MainChild()
    data class Plugins(val mcpVm: McpViewModel, val skillVm: SkillViewModel) : MainChild()
    data object Files : MainChild()
    data object Activity : MainChild()
}

sealed class DialogChild {
    data class Settings(val settingsVm: SettingsViewModel, val agentVm: AgentViewModel, val mcpVm: McpViewModel, val skillVm: SkillViewModel) : DialogChild()
    data class AgentConfig(val agentId: String, val agentVm: AgentViewModel) : DialogChild()
    data class McpConfig(val serverId: String, val mcpVm: McpViewModel) : DialogChild()
    data class CommandPalette(val agentVm: AgentViewModel) : DialogChild()
}
