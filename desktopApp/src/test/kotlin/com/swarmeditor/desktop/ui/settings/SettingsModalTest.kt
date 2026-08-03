package com.swarmeditor.desktop.ui.settings

import kotlin.test.Test
import kotlin.test.assertEquals

class SettingsModalTest {
    @Test
    fun `unknown settings tab falls back to agent profiles`() {
        assertEquals("agent", normalizeSettingsTab(null))
        assertEquals("agent", normalizeSettingsTab("unknown"))
    }

    @Test
    fun `known settings tabs remain addressable`() {
        listOf(
            "agent",
            "models",
            "mcp",
            "skills",
            "code-intelligence",
            "general",
            "appearance",
            "shortcuts",
            "about",
        ).forEach { tabId ->
            assertEquals(tabId, normalizeSettingsTab(tabId))
        }
    }
}
