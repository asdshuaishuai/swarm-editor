package com.swarmeditor.desktop.ui.chat

import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AgentClaude
import com.swarmeditor.desktop.theme.AgentGemini
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CodeCardTest {
    @Test
    fun `syntax highlighting preserves source and marks common token kinds`() {
        val highlighted = highlightSyntax("fun greet() = \"hello\"")

        assertEquals("fun greet() = \"hello\"", highlighted.text)
        assertTrue(highlighted.spanStyles.any { it.item.color == AgentClaude })
        assertTrue(highlighted.spanStyles.any { it.item.color == Ac })
        assertTrue(highlighted.spanStyles.any { it.item.color == AgentGemini })
    }

    @Test
    fun `syntax highlighting ignores diff marker without changing content`() {
        val highlighted = highlightSyntax("+val answer = 42")

        assertEquals("val answer = 42", highlighted.text)
        assertTrue(highlighted.spanStyles.any { it.item.color == AgentClaude })
    }
}
