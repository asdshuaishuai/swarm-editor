package com.swarmeditor.desktop

import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.swarmeditor.desktop.navigation.RootComponent
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.GeekColorScheme

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun main() = application {
    val root = remember { RootComponent() }

    Window(
        onCloseRequest = ::exitApplication,
        title = "Swarm Editor",
        state = rememberWindowState(size = DpSize(1280.dp, 960.dp)),
        resizable = true,
        undecorated = true
    ) {
        val awtWindow = window
        MaterialTheme(colorScheme = GeekColorScheme) {
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
                ),
                LocalRippleConfiguration provides null
            ) {
                App(
                    root = root,
                    onClose = ::exitApplication,
                    onMinimize = { (awtWindow as? java.awt.Frame)?.extendedState = java.awt.Frame.ICONIFIED },
                    onMaximizeToggle = {
                        val frame = awtWindow as? java.awt.Frame
                        if (frame != null) {
                            frame.extendedState = if (frame.extendedState and java.awt.Frame.MAXIMIZED_BOTH != 0)
                                java.awt.Frame.NORMAL else java.awt.Frame.MAXIMIZED_BOTH
                        }
                    },
                    onDragWindow = { dx, dy ->
                        awtWindow.location = java.awt.Point(
                            awtWindow.location.x + dx.toInt(),
                            awtWindow.location.y + dy.toInt()
                        )
                    }
                )
            }
        }
    }
}
