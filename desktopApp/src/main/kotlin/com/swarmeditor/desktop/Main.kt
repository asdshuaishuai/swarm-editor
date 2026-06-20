package com.swarmeditor.desktop

import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.GeekColorScheme

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "Swarm Editor",
        state = rememberWindowState(size = DpSize(1280.dp, 960.dp)),
        resizable = true,
        undecorated = true
    ) {
        MaterialTheme(colorScheme = GeekColorScheme) {
            CompositionLocalProvider(
                // 细滚动条
                LocalScrollbarStyle provides ScrollbarStyle(
                    minimalHeight = 16.dp,
                    thickness = 8.dp,
                    shape = RoundedCornerShape(4.dp),
                    hoverDurationMillis = 300,
                    unhoverColor = Color(0xFF1a1f2c),
                    hoverColor = Color(0xFF2a3040)
                ),
                // 紫色选区
                LocalTextSelectionColors provides TextSelectionColors(
                    handleColor = Ac,
                    backgroundColor = Ac.copy(alpha = 0.3f)
                ),
                // 禁用默认 ripple（深色背景上白涟漪闪烁）
                LocalRippleConfiguration provides null
            ) {
                App(onClose = ::exitApplication)
            }
        }
    }
}
