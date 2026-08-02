package com.swarmeditor.desktop.ui.common

import kotlin.test.Test
import kotlin.test.assertNotEquals
import kotlin.test.assertEquals
import kotlin.test.assertSame

class SemanticIconsTest {
    @Test
    fun `source image and data files use distinct semantic icons`() {
        assertNotEquals(
            semanticFileIcon("Main.kt").name,
            semanticFileIcon("preview.png").name,
        )
        assertNotEquals(
            semanticFileIcon("preview.png").name,
            semanticFileIcon("schema.json").name,
        )
    }

    @Test
    fun `directories share the directory icon regardless of name`() {
        assertSame(
            semanticFileIcon("src", isDirectory = true),
            semanticFileIcon("build", isDirectory = true),
        )
    }

    @Test
    fun `plugin and agent keywords select specialized icons`() {
        assertNotEquals(
            semanticPluginIcon("github", isSkill = false).name,
            semanticPluginIcon("postgres database", isSkill = false).name,
        )
        assertNotEquals(
            semanticAgentIcon("代码审查", "review-agent").name,
            semanticAgentIcon("界面设计", "ui-agent").name,
        )
    }

    @Test
    fun `file badges expose language identity beyond a generic code glyph`() {
        assertEquals("KT", semanticFileIconSpec("Main.kt").badge)
        assertEquals("JAVA", semanticFileIconSpec("Main.java").badge)
        assertEquals("{}", semanticFileIconSpec("settings.json").badge)
        assertNotEquals(
            semanticFileIconSpec("Main.kt").accent,
            semanticFileIconSpec("Main.java").accent,
        )
    }

    @Test
    fun `plugin and agent badges reflect runtime roles`() {
        assertEquals("DB", semanticPluginIconSpec("postgres database", isSkill = false).badge)
        assertEquals("LSP", semanticPluginIconSpec("kotlin lsp", isSkill = false).badge)
        assertEquals("QA", semanticAgentIconSpec("代码审查", "review-agent").badge)
    }
}
