package com.swarmeditor.desktop.theme

import kotlin.test.Test
import kotlin.test.assertNotNull

class CodeFontTest {
    @Test
    fun `JetBrains Mono resources are bundled with the desktop application`() {
        val classLoader = Thread.currentThread().contextClassLoader ?: ClassLoader.getSystemClassLoader()

        assertNotNull(classLoader.getResource("fonts/JetBrainsMono.ttf"))
        assertNotNull(classLoader.getResource("fonts/JetBrainsMono-Italic.ttf"))
        assertNotNull(classLoader.getResource("licenses/JetBrainsMono-OFL.txt"))
    }
}
