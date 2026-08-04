package com.swarmeditor.desktop.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Folder
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import java.util.Locale
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.backend.pi.PiCommandInfo

@androidx.compose.runtime.Immutable
data class Command(
    val id: String,
    val name: String,
    val group: String,
    val shortcut: String = "",
    val icon: String = ""
)

internal fun commandPaletteLazyIndex(commands: List<Command>, selectedIndex: Int): Int {
    if (selectedIndex !in commands.indices) return 0

    var lazyIndex = 0
    var previousGroup: String? = null
    commands.forEachIndexed { commandIndex, command ->
        if (command.group != previousGroup) {
            lazyIndex += 1
            previousGroup = command.group
        }
        if (commandIndex == selectedIndex) return lazyIndex
        lazyIndex += 1
    }
    return 0
}

@Composable
fun CommandPalette(
    isVisible: Boolean,
    hazeState: HazeState,
    onDismiss: () -> Unit,
    onCommand: (Command) -> Unit,
    agents: List<AgentInfo> = emptyList(),
    piCommands: List<PiCommandInfo> = emptyList(),
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        AnimatedVisibility(
            visible = isVisible,
            enter = fadeIn(Motion.alphaEnter),
            exit = fadeOut(Motion.alphaExit),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .overlayBackdrop(OverlayDepth.PRIMARY)
                    .pointerInput(onDismiss) {
                        detectTapGestures(onTap = { onDismiss() })
                    },
            )
        }
        AnimatedVisibility(
            visible = isVisible,
            enter = Motion.modalEnter(OverlayDepth.PRIMARY),
            exit = Motion.modalExit(OverlayDepth.PRIMARY),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = 640.dp)
                        .fillMaxWidth()
                        .pointerInput(Unit) { detectTapGestures(onTap = {}) },
                ) {
                    CommandPaletteModal(
                        hazeState = hazeState,
                        agents = agents,
                        piCommands = piCommands,
                        onDismiss = onDismiss,
                        onCommand = onCommand,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CommandPaletteModal(
    hazeState: HazeState,
    agents: List<AgentInfo>,
    piCommands: List<PiCommandInfo>,
    onDismiss: () -> Unit,
    onCommand: (Command) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }
    var selectedIndex by remember { mutableIntStateOf(0) }

    // Build command list
    val commands = remember(agents, piCommands) { buildCommands(agents, piCommands) }

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

    val modalShape = AppShapes.lg

    Column(
        modifier = modifier
            .shadow(
                elevation = OverlayDepth.PRIMARY.elevation,
                shape = modalShape,
                clip = false,
                ambientColor = Scrim.copy(alpha = 0.42f),
                spotColor = Scrim.copy(alpha = 0.64f),
            )
            .clip(modalShape)
            .hazeEffect(hazeState)
            .background(Bg1.copy(alpha = 0.94f))
            .border(1.dp, Line2, modalShape)
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
                    Text("输入命令或搜索…", color = Tx3, fontSize = 14.sp)
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
                    .background(Bg3, RoundedCornerShape(4.dp))
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
                .background(Line)
        )

        // Command list
        val listState = rememberLazyListState()

        // Scroll to selected item
        LaunchedEffect(selectedIndex, filteredCommands) {
            if (filteredCommands.isNotEmpty() && selectedIndex in filteredCommands.indices) {
                val targetIndex = commandPaletteLazyIndex(filteredCommands, selectedIndex)
                val visibleRange = listState.layoutInfo.visibleItemsInfo
                if (visibleRange.none { it.index == targetIndex }) {
                    listState.scrollToItem(targetIndex)
                }
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
    val tone = commandTone(command)
    val bgColor by androidx.compose.animation.animateColorAsState(
        if (isSelected) tone.withAlpha(0.14f) else Color.Transparent,
        Motion.colorDefault,
        label = "commandBackground",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor, RoundedCornerShape(6.dp))
            .fluidClickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Icon / letter circle
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (isSelected) tone.withAlpha(0.18f) else Bg3),
            contentAlignment = Alignment.Center
        ) {
            if (command.icon.isNotBlank()) {
                if (command.icon == "📁") {
                    Icon(imageVector = Feather.Folder, contentDescription = "Files", modifier = Modifier.size(14.dp), tint = Tx2)
                } else {
                    Text(command.icon, fontSize = 13.sp)
                }
            } else {
                Text(
                    command.name.first().uppercase(),
                    color = if (isSelected) tone else Tx2,
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
                    .background(Bg3, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(command.shortcut, color = Tx3, fontSize = 10.sp)
            }
        }
    }
}

private fun commandTone(command: Command): Color = when {
    command.group == "命令" -> ControlBlue
    command.group == "主智能体配置" -> ControlPurple
    command.group == "Pi Skills" -> ControlGreen
    command.group == "Pi Prompt Templates" -> ControlOrange
    command.group == "Pi Extensions" -> ControlPurple
    command.group == "视图" && command.id.contains("activity") -> ControlRed
    command.group == "视图" && command.id.contains("plugins") -> ControlOrange
    command.group == "视图" && command.id.contains("files") -> ControlGreen
    command.group == "视图" && command.id.contains("agents") -> ControlPurple
    else -> ControlBlue
}

internal fun buildCommands(agents: List<AgentInfo>, piCommands: List<PiCommandInfo> = emptyList()): List<Command> {
    val commands = mutableListOf<Command>()

    // 命令
    commands.add(Command("new-session", "新建会话", "命令", "⌘N"))
    commands.add(Command("open-settings", "打开设置", "命令", "⌘,"))

    // Agent 配置
    agents.forEach { agent ->
        commands.add(
            Command(
                id = "agent-config:${agent.id}",
                name = "配置 ${agent.name}",
                group = "主智能体配置"
            )
        )
    }

    piCommands.forEach { command ->
        commands.add(
            Command(
                id = "pi-command:${command.name}",
                name = "/${command.name}${command.description.takeIf(String::isNotBlank)?.let { "  $it" }.orEmpty()}",
                group = when (command.source) {
                    "skill" -> "Pi Skills"
                    "prompt" -> "Pi Prompt Templates"
                    else -> "Pi Extensions"
                },
                icon = when (command.source) {
                    "skill" -> "S"
                    "prompt" -> "P"
                    else -> "π"
                },
            )
        )
    }

    // 视图（id 保持英文以兼容路由，显示名中文）
    val views = listOf(
        "Chat" to "会话" to "⌘1",
        "蜂群" to "子智能体编排" to "⌘2",
        "Plugins" to "插件" to "⌘3",
        "Files" to "文件" to "⌘4",
        "Activity" to "活动日志" to "⌘5"
    )
    views.forEach { (keyAndLabel, shortcut) ->
        val (key, label) = keyAndLabel
        commands.add(
            Command(
                id = "view-${key.lowercase()}",
                name = label,
                group = "视图",
                shortcut = shortcut,
                icon = when (key) {
                    "Chat" -> "💬"
                    "蜂群" -> "群"
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
