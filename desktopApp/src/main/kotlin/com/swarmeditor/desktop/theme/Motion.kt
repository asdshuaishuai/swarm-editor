package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize

object Motion {
    const val ToastExitMillis = 110L
    val appleEaseOut = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

    fun toastMotionOffsetPx(width: Int): Int {
        if (width <= 0) return 0
        val minimum = minOf(width, 24)
        val maximum = minOf(width, 48)
        return (width / 6).coerceIn(minimum, maximum)
    }

    val alphaEnter: TweenSpec<Float> = tween(
        durationMillis = 180,
        easing = appleEaseOut,
    )
    val alphaExit: TweenSpec<Float> = tween(
        durationMillis = ToastExitMillis.toInt(),
        easing = appleEaseOut,
    )
    val floatPress: FiniteAnimationSpec<Float> = snap()
    val floatRelease: SpringSpec<Float> = spring(
        dampingRatio = 0.86f,
        stiffness = 560f,
    )
    val floatDefault: SpringSpec<Float> = spring(
        dampingRatio = 0.86f,
        stiffness = 460f,
    )
    val floatState: TweenSpec<Float> = tween(
        durationMillis = 170,
        easing = appleEaseOut,
    )
    val floatSnappy: SpringSpec<Float> = spring(
        dampingRatio = 0.92f,
        stiffness = 760f,
    )
    val floatGentle: SpringSpec<Float> = spring(
        dampingRatio = 0.9f,
        stiffness = 240f,
    )
    val dpDefault: SpringSpec<Dp> = spring(
        dampingRatio = 0.9f,
        stiffness = 460f,
    )
    val colorDefault: SpringSpec<Color> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = 620f,
    )
    val intSizeGentle: SpringSpec<IntSize> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = 360f,
    )
    val intSizeExpand: TweenSpec<IntSize> = tween(
        durationMillis = 220,
        easing = appleEaseOut,
    )
    val intSizeCollapse: TweenSpec<IntSize> = tween(
        durationMillis = 150,
        easing = appleEaseOut,
    )
    val intOffsetEnter: SpringSpec<IntOffset> = spring(
        dampingRatio = 0.9f,
        stiffness = 430f,
    )
    val intOffsetExit: SpringSpec<IntOffset> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = 820f,
    )
}
