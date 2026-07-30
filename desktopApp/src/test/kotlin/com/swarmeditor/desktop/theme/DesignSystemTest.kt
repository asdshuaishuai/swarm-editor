package com.swarmeditor.desktop.theme

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DesignSystemTest {
    private val typeScale = listOf(
        AppType.micro,
        AppType.caption,
        AppType.bodySm,
        AppType.body,
        AppType.bodyMd,
        AppType.title,
        AppType.headline,
        AppType.display,
    )

    @Test
    fun `type scale uses the documented font sizes`() {
        assertEquals(
            listOf(10f, 11f, 12f, 13f, 14f, 15f, 18f, 24f),
            typeScale.map { it.fontSize.value },
        )
    }

    @Test
    fun `type scale provides readable line height`() {
        typeScale.forEach { style ->
            assertTrue(style.lineHeight.value > style.fontSize.value)
            assertEquals(SansFont, style.fontFamily)
        }
    }
}
