package com.swarmeditor.desktop.theme

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CodeFontTest {
    @Test
    fun `JetBrains Mono is only selected when the system exposes it`() {
        val available = arrayOf("Noto Sans", "JetBrains Mono", "DejaVu Sans Mono")

        assertTrue(isSystemFontAvailable("JetBrains Mono", available))
        assertFalse(isSystemFontAvailable("JetBrains Mono", arrayOf("Noto Sans")))
    }
}
