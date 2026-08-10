package com.swarmeditor.desktop.ui.common

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Activity
import com.woowla.compose.icon.collections.feather.feather.BookOpen
import com.woowla.compose.icon.collections.feather.feather.Box
import com.woowla.compose.icon.collections.feather.feather.Code
import com.woowla.compose.icon.collections.feather.feather.Command
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.Grid
import com.woowla.compose.icon.collections.feather.feather.Plus
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.Settings
import com.woowla.compose.icon.collections.feather.feather.Users
import com.woowla.compose.icon.collections.feather.feather.Zap
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
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
    if (!isVisible) return

    Box(
        modifier = modifier
            .fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .overlayBackdrop(OverlayDepth.PRIMARY)
                .pointerInput(onDismiss) {
                    detectTapGestures(onTap = { onDismiss() })
                },
        )
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
    val groupedCommands = remember(filteredCommands) { filteredCommands.groupBy { it.group } }
    val commandIndexes = remember(filteredCommands) {
        filteredCommands.mapIndexed { index, command -> command.id to index }.toMap()
    }

    // Reset selection when filter changes
    LaunchedEffect(filteredCommands.size) {
        selectedIndex = 0
    }

    // Focus input on appear
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    val modalShape = AppShapes.sm

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
            .background(Bg1.copy(alpha = 0.98f))
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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(42.dp)
                .padding(horizontal = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(16.dp))
            Spacer(Modifier.size(8.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (searchQuery.text.isEmpty()) {
                    Text("搜索操作、文件或 Pi 命令", color = Tx3, fontSize = 13.sp)
                }
                BasicTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester),
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontSize = 13.sp,
                    color = Tx
                ),
                cursorBrush = SolidColor(Ac),
                )
            }
            Spacer(Modifier.size(8.dp))
            Box(
                modifier = Modifier
                    .background(Bg2, AppShapes.xs)
                    .border(1.dp, Line, AppShapes.xs)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text("ESC", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.Medium)
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Line)
        )

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
                .heightIn(max = 380.dp)
                .padding(horizontal = 3.dp, vertical = 3.dp)
        ) {
            groupedCommands.forEach { (group, cmds) ->
                item(key = "header_$group") {
                    Text(
                        text = group.uppercase(Locale.ROOT),
                        color = Tx3,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.6.sp,
                        modifier = Modifier.padding(start = 9.dp, top = 7.dp, bottom = 3.dp)
                    )
                }

                itemsIndexed(
                    items = cmds,
                    key = { _, cmd -> cmd.id }
                ) { indexInGroup, cmd ->
                    val absoluteIndex = commandIndexes[cmd.id] ?: -1
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

            if (filteredCommands.isEmpty()) {
                item(key = "empty") {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("没有匹配的操作", color = Tx3, fontSize = 12.sp)
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
    IdeListRow(
        onClick = onClick,
        selected = isSelected,
        rowHeight = 30.dp,
        leading = {
            Icon(commandVector(command), null, tint = if (isSelected) Tx2 else Tx3, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(8.dp))
        },
        content = {
            Text(command.name, color = if (isSelected) Tx else Tx2, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
        },
        trailing = {
            if (command.shortcut.isNotBlank()) {
                Text(command.shortcut, color = Tx3, fontSize = 10.sp)
            }
        },
    )
}

private fun commandVector(command: Command): ImageVector = when {
    command.id == "new-session" -> Feather.Plus
    command.id.contains("workspace") -> Feather.Folder
    command.id == "open-settings" -> Feather.Settings
    command.group == "主智能体配置" -> Feather.Users
    command.group == "Pi Skills" -> Feather.Zap
    command.group == "Pi Prompt Templates" -> Feather.BookOpen
    command.group == "Pi Extensions" -> Feather.Box
    command.id.contains("activity") -> Feather.Activity
    command.id.contains("plugins") -> Feather.Box
    command.id.contains("files") -> Feather.Folder
    command.id.contains("agents") -> Feather.Users
    command.id.contains("chat") -> Feather.Code
    command.group == "视图" -> Feather.Grid
    else -> Feather.Command
}

internal fun buildCommands(agents: List<AgentInfo>, piCommands: List<PiCommandInfo> = emptyList()): List<Command> {
    val commands = mutableListOf<Command>()

    // 命令
    commands.add(Command("new-session", "新建会话", "命令", "⌘N"))
    commands.add(Command("open-workspace", "打开项目文件夹", "工作区", "⌘O"))
    commands.add(Command("create-workspace", "新建项目", "工作区"))
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
