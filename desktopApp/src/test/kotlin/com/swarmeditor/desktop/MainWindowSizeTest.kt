package com.swarmeditor.desktop

import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals

class MainWindowSizeTest {
    @Test
    fun `window size uses defaults for missing or invalid values`() {
        assertEquals(DpSize(1280.dp, 960.dp), initialWindowSize(null, "invalid"))
    }

    @Test
    fun `window size clamps visual review dimensions to supported bounds`() {
        assertEquals(DpSize(760.dp, 1600.dp), initialWindowSize("320", "2400"))
    }
}
