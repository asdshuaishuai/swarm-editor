package com.swarmeditor.desktop.navigation

import kotlinx.serialization.Serializable

/**
 * Main navigation configs for the root stack.
 * These represent the 5 main views accessible via rail navigation.
 */
@Serializable
sealed interface MainConfig {
    @Serializable
    data object Chat : MainConfig

    @Serializable
    data object Agents : MainConfig

    @Serializable
    data object Plugins : MainConfig

    @Serializable
    data object Files : MainConfig

    @Serializable
    data object Activity : MainConfig
}

/**
 * Dialog configs for the modal slot.
 * These represent overlay dialogs and modals.
 */
@Serializable
sealed interface DialogConfig {
    @Serializable
    data object Settings : DialogConfig

    @Serializable
    data class AgentConfig(val agentId: String) : DialogConfig

    @Serializable
    data class McpConfig(val serverId: String) : DialogConfig

    @Serializable
    data object CommandPalette : DialogConfig
}
