package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.isSecondaryPressed
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Tx2

data class IdeContextMenuItem(
    val label: String,
    val onClick: () -> Unit,
)

@Composable
@OptIn(ExperimentalComposeUiApi::class)
fun IdeContextMenuArea(
    items: () -> List<IdeContextMenuItem>,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(
        modifier = modifier.onPointerEvent(PointerEventType.Press) { event ->
            if (event.buttons.isSecondaryPressed) {
                expanded = true
                event.changes.forEach { it.consume() }
            }
        },
    ) {
        content()
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(Bg2).border(1.dp, Line2, AppShapes.xs),
        ) {
            items().forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.label, color = Tx2, style = AppType.caption) },
                    onClick = {
                        expanded = false
                        item.onClick()
                    },
                    modifier = Modifier.height(30.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp),
                )
            }
        }
    }
}
