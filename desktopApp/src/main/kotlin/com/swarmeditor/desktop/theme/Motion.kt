package com.swarmeditor.desktop.theme

import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.ui.unit.Dp

object Motion {
    // Mac 风格 spring 预设

    /** Default spring for Float animations */
    val floatDefault: SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow
    )

    /** Snappy spring for Float animations */
    val floatSnappy: SpringSpec<Float> = spring(
        dampingRatio = 0.7f,
        stiffness = 600f
    )

    /** Gentle spring for Float animations */
    val floatGentle: SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessLow
    )

    /** Default spring for Dp animations */
    val dpDefault: SpringSpec<Dp> = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow
    )
}
