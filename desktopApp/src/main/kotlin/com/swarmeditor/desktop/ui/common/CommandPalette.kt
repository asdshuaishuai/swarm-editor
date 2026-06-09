package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import java.util.Locale

data class Command(
    val id: String,
    val name: String,
    val group: String,
    val shortcut: String = "",
    val icon: String = ""
)

@Composable
fun CommandPalette(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    onCommand: (Command) -> Unit,
    agentNames: List<String> = emptyList(),
    modifier: Modifier = Modifier
) {
    if (!isVisible) return

    // Semi-transparent overlay — click to dismiss
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable { onDismiss() },
        contentAlignment = Alignment.Center
    ) {
        // Stop click propagation on the modal itself
        Box(
            modifier = Modifier
                .clickable(enabled = false) { /* consume */ }
        ) {
            CommandPaletteModal(
                agentNames = agentNames,
                onDismiss = onDismiss,
                onCommand = onCommand
            )
        }
    }
}

@Composable
private fun CommandPaletteModal(
    agentNames: List<String>,
    onDismiss: () -> Unit,
    onCommand: (Command) -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }
    var selectedIndex by remember { mutableIntStateOf(0) }

    // Build command list
    val commands = remember(agentNames) { buildCommands(agentNames) }

    // Filter commands by search
    val filteredCommands = remember(commands, searchQuery.text) {
        val q = searchQuery.text.lowercase(Locale.ROOT)
        if (q.isBlank()) commands
        else commands.filter { it.name.lowercase(Locale.ROOT).contains(q) }
    }

    // Reset selection when filter changes
    LaunchedEffect(filteredCommands.size) {
        selectedIndex = 0
    }

    // Focus input on appear
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    val modalShape = RoundedCornerShape(RR2)

    Column(
        modifier = Modifier
            .width(580.dp)
            .clip(modalShape)
            .background(Glass)
            .border(1.dp, Bd, modalShape)
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false

                when (keyEvent.key) {
                    Key.Escape -> {
                        onDismiss()
                        true
                    }
                    Key.DirectionDown -> {
                        if (filteredCommands.isNotEmpty()) {
                            selectedIndex = (selectedIndex + 1) % filteredCommands.size
                        }
                        true
                    }
                    Key.DirectionUp -> {
                        if (filteredCommands.isNotEmpty()) {
                            selectedIndex = (selectedIndex - 1).coerceAtLeast(0)
                        }
                        true
                    }
                    Key.Enter -> {
                        val cmd = filteredCommands.getOrNull(selectedIndex)
                        if (cmd != null) {
                            onCommand(cmd)
                            onDismiss()
                        } else {
                            onDismiss()
                        }
                        true
                    }
                    else -> false
                }
            }
    ) {
        // Search input row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("🔍", fontSize = 14.sp)
            Spacer(Modifier.size(10.dp))
            TextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester),
                placeholder = {
                    Text("Type a command...", color = Tx3, fontSize = 14.sp)
                },
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    cursorColor = Ac,
                    focusedTextColor = Tx,
                    unfocusedTextColor = Tx
                ),
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontSize = 14.sp,
                    color = Tx
                )
            )
            Spacer(Modifier.size(8.dp))
            // ESC label
            Box(
                modifier = Modifier
                    .background(Surface2, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text("ESC", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.Medium)
            }
        }

        // Divider
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Bd)
        )

        // Command list
        val listState = rememberLazyListState()

        // Scroll to selected item
        LaunchedEffect(selectedIndex) {
            if (filteredCommands.isNotEmpty() && selectedIndex in filteredCommands.indices) {
                listState.animateScrollToItem(selectedIndex)
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 360.dp)
                .padding(vertical = 6.dp)
        ) {
            // Group filtered commands
            val grouped = filteredCommands.groupBy { it.group }

            grouped.forEach { (group, cmds) ->
                // Group header
                item(key = "header_$group") {
                    Text(
                        text = group,
                        color = Tx3,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                }

                itemsIndexed(
                    items = cmds,
                    key = { _, cmd -> cmd.id }
                ) { indexInGroup, cmd ->
                    val absoluteIndex = filteredCommands.indexOf(cmd)
                    val isSelected = absoluteIndex == selectedIndex

                    CommandItem(
                        command = cmd,
                        isSelected = isSelected,
                        onClick = {
                            onCommand(cmd)
                            onDismiss()
                        }
                    )
                }
            }

            // Empty state
            if (filteredCommands.isEmpty()) {
                item(key = "empty") {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No matching commands", color = Tx3, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CommandItem(
    command: Command,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) Pr.copy(alpha = 0.12f) else Color.Transparent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor, RoundedCornerShape(6.dp))
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Icon / letter circle
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Bg3),
            contentAlignment = Alignment.Center
        ) {
            if (command.icon.isNotBlank()) {
                Text(command.icon, fontSize = 13.sp)
            } else {
                Text(
                    command.name.first().uppercase(),
                    color = Tx2,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Spacer(Modifier.size(10.dp))

        Text(
            text = command.name,
            color = if (isSelected) Tx else Tx2,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f)
        )

        // Shortcut badge
        if (command.shortcut.isNotBlank()) {
            Box(
                modifier = Modifier
                    .background(Surface2, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(command.shortcut, color = Tx3, fontSize = 10.sp)
            }
        }
    }
}

private fun buildCommands(agentNames: List<String>): List<Command> {
    val commands = mutableListOf<Command>()

    // Commands group
    commands.add(Command("new-session", "New Session", "Commands", "⌘N"))
    commands.add(Command("open-settings", "Open Settings", "Commands", "⌘,"))

    // Agents group
    val defaultAgents = listOf("Claude Code", "QwenCode", "Gemini CLI", "Kimi Code", "OpenCode")
    val agents = if (agentNames.isEmpty()) defaultAgents else agentNames
    agents.forEach { agent ->
        commands.add(
            Command(
                id = "cfg-${agent.lowercase(Locale.ROOT).replace(" ", "-")}",
                name = "Configure $agent",
                group = "Agents"
            )
        )
    }

    // Views group
    val views = listOf("Chat" to "⌘1", "Agents" to "⌘2", "Plugins" to "⌘3", "Files" to "⌘4", "Activity" to "⌘5")
    views.forEach { (name, shortcut) ->
        commands.add(
            Command(
                id = "view-${name.lowercase()}",
                name = name,
                group = "Views",
                shortcut = shortcut,
                icon = when (name) {
                    "Chat" -> "💬"
                    "Agents" -> "🤖"
                    "Plugins" -> "🧩"
                    "Files" -> "📁"
                    "Activity" -> "📋"
                    else -> ""
                }
            )
        )
    }

    return commands
}
