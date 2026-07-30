package com.swarmeditor.desktop.ui.navigation

import kotlin.test.Test
import kotlin.test.assertEquals

class NotificationAccessibilityTest {
    @Test
    fun `describes the unread notification count`() {
        assertEquals("通知，3 条未读", notificationDescription(3))
    }

    @Test
    fun `describes an empty notification state`() {
        assertEquals("通知，无未读消息", notificationDescription(0))
    }
}
