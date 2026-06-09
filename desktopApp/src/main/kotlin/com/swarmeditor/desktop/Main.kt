package com.swarmeditor.desktop

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.swarmeditor.desktop.theme.GeekColorScheme

fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "Swarm Editor",
    ) {
        MaterialTheme(colorScheme = GeekColorScheme) {
            App()
        }
    }
}
