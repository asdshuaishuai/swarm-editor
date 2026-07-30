package com.swarmeditor.desktop.viewmodel

import java.util.prefs.Preferences

interface AgentSelectionStore {
    fun load(): String?
    fun save(agentId: String)
}

object PreferencesAgentSelectionStore : AgentSelectionStore {
    private const val KEY_SELECTED_AGENT = "selectedAgent"
    private val preferences by lazy { Preferences.userNodeForPackage(PreferencesAgentSelectionStore::class.java) }

    override fun load(): String? = runCatching {
        preferences.get(KEY_SELECTED_AGENT, null)
    }.getOrNull()

    override fun save(agentId: String) {
        runCatching { preferences.put(KEY_SELECTED_AGENT, agentId) }
    }
}

internal fun resolveSelectedAgentId(preferredId: String?, availableIds: List<String>): String? {
    return preferredId?.takeIf { it in availableIds } ?: availableIds.firstOrNull()
}
