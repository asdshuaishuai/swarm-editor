package com.swarmeditor.desktop

import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
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

fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "Swarm Editor",
        state = rememberWindowState(size = DpSize(1280.dp, 960.dp)),
        resizable = true,
        undecorated = true
    ) {
        MaterialTheme(colorScheme = GeekColorScheme) {
            // 细滚动条样式（对齐核心稿 ::-webkit-scrollbar：8px、暗色 thumb）
            CompositionLocalProvider(
                LocalScrollbarStyle provides ScrollbarStyle(
                    minimalHeight = 16.dp,
                    thickness = 8.dp,
                    shape = RoundedCornerShape(4.dp),
                    hoverDurationMillis = 300,
                    unhoverColor = Color(0xFF1a1f2c),
                    hoverColor = Color(0xFF2a3040)
                ),
                LocalTextSelectionColors provides TextSelectionColors(
                    handleColor = Ac,
                    backgroundColor = Ac.copy(alpha = 0.3f)
                )
            ) {
                App()
            }
        }
    }
}
