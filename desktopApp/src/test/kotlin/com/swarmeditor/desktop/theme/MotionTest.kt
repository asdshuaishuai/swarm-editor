package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.Spring
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MotionTest {
    @Test
    fun `press feedback is immediate and release remains spring driven`() {
        assertTrue(Motion.floatPress is SnapSpec<Float>)
        assertTrue(Motion.floatRelease.stiffness > 0f)
        assertEquals(Spring.DampingRatioNoBouncy, Motion.floatRelease.dampingRatio)
    }

    @Test
    fun `exit fades finish faster than entrances`() {
        assertTrue(Motion.alphaExit.durationMillis < Motion.alphaEnter.durationMillis)
        assertEquals(Motion.ToastExitMillis.toInt(), Motion.alphaExit.durationMillis)
    }

    @Test
    fun `toast motion remains visible without crossing the full surface`() {
        assertEquals(0, Motion.toastMotionOffsetPx(0))
        assertEquals(12, Motion.toastMotionOffsetPx(12))
        assertEquals(24, Motion.toastMotionOffsetPx(120))
        assertEquals(40, Motion.toastMotionOffsetPx(240))
        assertEquals(48, Motion.toastMotionOffsetPx(600))
    }
}
