package com.swarmeditor.desktop.ui.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ChatAreaTest {
    @Test
    fun `inline code annotation strips paired delimiters and preserves spans`() {
        val annotated = annotateInlineCode(
            text = "Use `foo()` then `bar`.",
            fontSize = 14.sp,
            codeColor = Color.Red,
            codeBackground = Color.Blue,
        )

        assertEquals("Use foo() then bar.", annotated.text)
        assertEquals(2, annotated.spanStyles.size)
        assertEquals(4, annotated.spanStyles[0].start)
        assertEquals(9, annotated.spanStyles[0].end)
        assertEquals(Color.Red, annotated.spanStyles[0].item.color)
        assertEquals(Color.Blue, annotated.spanStyles[0].item.background)
        assertEquals(15, annotated.spanStyles[1].start)
        assertEquals(18, annotated.spanStyles[1].end)
    }

    @Test
    fun `inline code annotation preserves unmatched delimiters`() {
        val annotated = annotateInlineCode(
            text = "Use `unfinished",
            fontSize = 14.sp,
            codeColor = Color.Red,
            codeBackground = Color.Blue,
        )

        assertEquals("Use `unfinished", annotated.text)
        assertTrue(annotated.spanStyles.isEmpty())
    }

    @Test
    fun `timeline follows only when the bottom anchor is visible`() {
        assertFalse(isTimelineNearEnd(lastVisibleItemIndex = -1, totalItemsCount = 0))
        assertFalse(isTimelineNearEnd(lastVisibleItemIndex = 7, totalItemsCount = 9))
        assertTrue(isTimelineNearEnd(lastVisibleItemIndex = 8, totalItemsCount = 9))
        assertTrue(isTimelineNearEnd(lastVisibleItemIndex = 9, totalItemsCount = 9))
    }

    @Test
    fun `timeline end index includes stable thinking slot`() {
        assertEquals(5, timelineEndIndex(messageCount = 4))
    }

    @Test
    fun `timeline end index rejects invalid message counts`() {
        assertFailsWith<IllegalArgumentException> {
            timelineEndIndex(messageCount = -1)
        }
    }

    @Test
    fun `message timestamp uses compact local labels`() {
        val zone = ZoneId.of("Asia/Shanghai")
        val now = Instant.parse("2026-07-30T04:00:00Z")

        assertEquals("00:56", formatMessageTimestamp("2026-07-29T16:56:56Z", now, zone))
        assertEquals("昨天 20:15", formatMessageTimestamp("2026-07-29T12:15:00Z", now, zone))
        assertEquals("07-27 18:30", formatMessageTimestamp("2026-07-27T10:30:00Z", now, zone))
        assertEquals("刚刚", formatMessageTimestamp("刚刚", now, zone))
    }

    @Test
    fun `compact height removes persistent shortcut row`() {
        val density = chatLayoutDensity(520)

        assertFalse(density.showShortcutHints)
        assertEquals(34, density.inputMinHeight)
        assertEquals(7, density.composerOuterPadding)
    }

    @Test
    fun `medium height retains hints with reduced input footprint`() {
        val density = chatLayoutDensity(640)

        assertTrue(density.showShortcutHints)
        assertEquals(40, density.inputMinHeight)
        assertEquals(8, density.composerInnerPadding)
    }
}
