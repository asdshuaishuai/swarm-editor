package com.swarmeditor.desktop.navigation

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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/**
 * Root component that manages navigation and all ViewModels.
 * This replaces MainViewModel's navigation duties and holds all app state.
 *
 * Note: ComponentContext will be added later for proper lifecycle management.
 * For now, we use a simple constructor without lifecycle.
 */
class RootComponent {

    // All ViewModels - instantiated here instead of in App.kt
    val agentVm = AgentViewModel()
    val sessionVm = SessionViewModel()
    val settingsVm = SettingsViewModel()
    val mcpVm = McpViewModel()
    val skillVm = SkillViewModel()

    // Toast system (from MainViewModel)
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _toastChannel = Channel<ToastData>(Channel.BUFFERED)
    val toastEvents: Flow<ToastData> = _toastChannel.receiveAsFlow()

    fun showToast(message: String, type: ToastType = ToastType.INFO) {
        scope.launch {
            _toastChannel.send(
                ToastData(
                    message = message,
                    type = type
                )
            )
        }
    }

    // Navigation state
    private val _stack = MutableStateFlow<MainConfig>(
        when (System.getProperty("swarm.view")) {
            "agents" -> MainConfig.Agents
            "plugins" -> MainConfig.Plugins
            "files" -> MainConfig.Files
            "activity" -> MainConfig.Activity
            else -> MainConfig.Chat
        }
    )
    val stack: StateFlow<MainConfig> = _stack

    private val _dialog = MutableStateFlow<DialogConfig?>(null)
    val dialog: StateFlow<DialogConfig?> = _dialog

    // Navigation methods
    fun switchView(config: MainConfig) {
        _stack.value = config
    }

    fun switchView(viewName: String) {
        val config = when (viewName) {
            "chat" -> MainConfig.Chat
            "agents" -> MainConfig.Agents
            "plugins" -> MainConfig.Plugins
            "files" -> MainConfig.Files
            "activity" -> MainConfig.Activity
            else -> MainConfig.Chat
        }
        switchView(config)
    }

    // Dialog methods
    fun openDialog(config: DialogConfig) {
        _dialog.value = config
    }

    fun closeDialog() {
        _dialog.value = null
    }

    // Convenience methods for specific dialogs
    fun showSettingsDialog() {
        openDialog(DialogConfig.Settings)
    }

    fun showAgentConfigDialog(agentId: String) {
        openDialog(DialogConfig.AgentConfig(agentId))
    }

    fun showMcpConfigDialog(serverId: String) {
        openDialog(DialogConfig.McpConfig(serverId))
    }

    fun showCmdKDialog() {
        openDialog(DialogConfig.CommandPalette)
    }

    fun hideCmdKDialog() {
        if (_dialog.value == DialogConfig.CommandPalette) {
            closeDialog()
        }
    }

    fun dismissAgentConfigDialog() {
        if (_dialog.value is DialogConfig.AgentConfig) {
            closeDialog()
        }
    }

    fun dismissMcpConfigDialog() {
        if (_dialog.value is DialogConfig.McpConfig) {
            closeDialog()
        }
    }
}

/**
 * Child component for main views.
 * Each child wraps the ViewModels it needs.
 */
sealed class MainChild {
    data class Chat(
        val agentVm: AgentViewModel,
        val sessionVm: SessionViewModel,
        val mcpVm: McpViewModel,
        val skillVm: SkillViewModel
    ) : MainChild()

    data class Agents(
        val agentVm: AgentViewModel
    ) : MainChild()

    data class Plugins(
        val mcpVm: McpViewModel,
        val skillVm: SkillViewModel
    ) : MainChild()

    data object Files : MainChild()

    data object Activity : MainChild()
}

/**
 * Child component for dialogs.
 */
sealed class DialogChild {
    data class Settings(
        val settingsVm: SettingsViewModel,
        val agentVm: AgentViewModel,
        val mcpVm: McpViewModel,
        val skillVm: SkillViewModel
    ) : DialogChild()

    data class AgentConfig(
        val agentId: String,
        val agentVm: AgentViewModel
    ) : DialogChild()

    data class McpConfig(
        val serverId: String,
        val mcpVm: McpViewModel
    ) : DialogChild()

    data class CommandPalette(
        val agentVm: AgentViewModel
    ) : DialogChild()

    // Empty state when no dialog is shown
    data object None : DialogChild()
}
