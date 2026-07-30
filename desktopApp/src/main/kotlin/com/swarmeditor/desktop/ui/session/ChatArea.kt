package com.swarmeditor.desktop.ui.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.isShiftPressed
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.Grid
import com.woowla.compose.icon.collections.feather.feather.Paperclip
import com.woowla.compose.icon.collections.feather.feather.Settings
import com.woowla.compose.icon.collections.feather.feather.Share2
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.chat.CodeCard
import com.swarmeditor.desktop.ui.chat.MentionDropdown
import com.swarmeditor.desktop.ui.chat.ThinkingIndicator
import com.swarmeditor.desktop.ui.chat.ToolCard
import com.swarmeditor.desktop.viewmodel.UiActivity
import com.swarmeditor.desktop.viewmodel.UiMessage
import com.swarmeditor.desktop.viewmodel.UiImageAttachment
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.skia.Image as SkiaImage

internal data class ChatLayoutDensity(
    val topBarVerticalPadding: Int,
    val composerOuterPadding: Int,
    val composerInnerPadding: Int,
    val inputMinHeight: Int,
    val inputMaxHeight: Int,
    val actionHeight: Int,
    val showShortcutHints: Boolean,
)

internal fun chatLayoutDensity(heightDp: Int): ChatLayoutDensity = when {
    heightDp < 600 -> ChatLayoutDensity(6, 7, 7, 34, 104, 28, false)
    heightDp < 760 -> ChatLayoutDensity(7, 8, 8, 40, 132, 30, true)
    else -> ChatLayoutDensity(8, 10, 10, 44, 156, 30, true)
}

@Composable
fun ChatArea(
    selectedAgent: AgentInfo,
    messages: List<UiMessage>,
    isSending: Boolean,
    inputText: String,
    attachments: List<UiImageAttachment>,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onAttach: () -> Unit,
    onRemoveAttachment: (String) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    agents: List<AgentInfo> = emptyList(),
    sessionTitle: String = selectedAgent.name,
    contextUsageText: String = "上下文：—",
    onSelectAgent: (String) -> Unit = {},
    onMcpClick: () -> Unit = {},
    onSkillClick: () -> Unit = {}
) {
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionFilter by remember { mutableStateOf("") }
    var mentionStartIndex by remember { mutableStateOf(-1) }
    val composerFocusRequester = remember { FocusRequester() }

    BoxWithConstraints(modifier = modifier) {
        val layoutDensity = chatLayoutDensity(maxHeight.value.toInt())
        Column(modifier = Modifier.fillMaxSize()) {
        // ── Chat TopBar ───────────────────────────────────────────────
        ChatTopBar(
            selectedAgent = selectedAgent,
            agents = agents,
            messages = messages,
            sessionTitle = sessionTitle,
            onSelectAgent = onSelectAgent,
            verticalPadding = layoutDensity.topBarVerticalPadding,
            modifier = Modifier.fillMaxWidth(),
        )

        val listState = remember(sessionTitle) { LazyListState() }
        var initialized by remember(sessionTitle) { mutableStateOf(false) }
        var previousLastMessageId by remember(sessionTitle) { mutableStateOf<String?>(null) }
        var followLatest by remember(sessionTitle) { mutableStateOf(true) }
        var autoScrolling by remember(sessionTitle) { mutableStateOf(false) }
        val timelineScope = rememberCoroutineScope()
        val latestMessage = messages.lastOrNull()
        val showThinking = isSending && latestMessage?.isThinking != true
        val endAnchorIndex = timelineEndIndex(messages.size)

        LaunchedEffect(listState) {
            snapshotFlow { listState.isScrollInProgress to autoScrolling }
                .distinctUntilChanged()
                .collect { (isScrolling, isAutomatic) ->
                    if (isAutomatic) return@collect
                    followLatest = if (isScrolling) false else listState.isNearEnd()
                }
        }
        LaunchedEffect(latestMessage?.id, latestMessage?.text?.length, messages.size, showThinking) {
            if (messages.isEmpty()) return@LaunchedEffect

            if (!initialized) {
                previousLastMessageId = latestMessage?.id
                autoScrolling = true
                try {
                    listState.scrollToItem(endAnchorIndex)
                } finally {
                    autoScrolling = false
                }
                initialized = true
                followLatest = true
            } else if (latestMessage?.id != previousLastMessageId) {
                previousLastMessageId = latestMessage?.id
                followLatest = latestMessage?.isUser == true || followLatest || listState.isNearEnd()
                if (followLatest) {
                    autoScrolling = true
                    try {
                        if (isSending) {
                            listState.scrollToItem(endAnchorIndex)
                        } else {
                            listState.animateScrollToItem(endAnchorIndex)
                        }
                    } finally {
                        autoScrolling = false
                    }
                }
            } else if (isSending && followLatest) {
                withFrameNanos { }
                if (!followLatest) return@LaunchedEffect
                autoScrolling = true
                try {
                    listState.scrollBy(Float.MAX_VALUE)
                } finally {
                    autoScrolling = false
                }
            }
        }
        Box(modifier = Modifier.weight(1f)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 20.dp,
                    top = 16.dp,
                    end = 20.dp,
                    bottom = 20.dp,
                ),
                verticalArrangement = if (messages.isEmpty()) Arrangement.Center else Arrangement.Top
            ) {
                if (messages.isEmpty()) {
                    item(key = "empty-chat") {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            EmptyConversationLanding(
                                selectedAgent = selectedAgent,
                                onPromptSelected = { prompt ->
                                    onInputChange(prompt)
                                    composerFocusRequester.requestFocus()
                                },
                                modifier = Modifier.widthIn(max = 760.dp).fillMaxWidth()
                            )
                        }
                    }
                }
                items(messages, key = UiMessage::id) { message ->
                    ChatMessageItem(message = message, selectedAgent = selectedAgent, agents = agents)
                    Spacer(Modifier.height(16.dp))
                }
                item(key = "thinking-slot") {
                    androidx.compose.animation.AnimatedVisibility(
                        visible = showThinking,
                        enter = fadeIn(Motion.alphaEnter) + expandVertically(Motion.intSizeExpand),
                        exit = fadeOut(Motion.alphaExit) + shrinkVertically(Motion.intSizeCollapse),
                    ) {
                        ThinkingRow()
                    }
                }
                item(key = "timeline-end") {
                    Spacer(Modifier.height(1.dp))
                }
            }

            androidx.compose.animation.AnimatedVisibility(
                visible = messages.isNotEmpty() && !followLatest,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
                enter = fadeIn(Motion.alphaEnter) + slideInVertically(Motion.intOffsetEnter) { it / 2 },
                exit = fadeOut(Motion.alphaExit) + slideOutVertically(Motion.intOffsetExit) { it / 3 },
            ) {
                ActionButton(
                    text = "↓ 回到最新",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    compact = true,
                    onClick = {
                        followLatest = true
                        timelineScope.launch {
                            autoScrolling = true
                            try {
                                listState.animateScrollToItem(endAnchorIndex)
                            } finally {
                                autoScrolling = false
                            }
                        }
                    },
                )
            }
        }


        // Composer wrap
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Bg1.copy(alpha = 0.55f))
                .border(1.dp, Line)
                .padding(horizontal = 14.dp, vertical = layoutDensity.composerOuterPadding.dp),
        ) {
            AnimatedVisibility(
                visible = showMentionDropdown,
                enter = fadeIn(Motion.alphaEnter) + expandVertically(
                    expandFrom = Alignment.Bottom,
                    animationSpec = Motion.intSizeExpand,
                ),
                exit = fadeOut(Motion.alphaExit) + shrinkVertically(
                    shrinkTowards = Alignment.Bottom,
                    animationSpec = Motion.intSizeCollapse,
                ),
            ) {
                Box(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    MentionDropdown(
                        agents = agents.ifEmpty { listOf(selectedAgent) },
                        filter = mentionFilter,
                        onSelect = { agentName ->
                            val before = inputText.substring(0, mentionStartIndex)
                            val after = inputText.substring(
                                inputText.indexOf(' ', mentionStartIndex).let {
                                    if (it > mentionStartIndex) it + 1 else inputText.length
                                }
                            )
                            onInputChange("$before@$agentName $after")
                            showMentionDropdown = false
                            mentionFilter = ""
                            mentionStartIndex = -1
                        },
                        onDismiss = {
                            showMentionDropdown = false
                            mentionFilter = ""
                            mentionStartIndex = -1
                        }
                    )
                }
            }

            // Input field with focus-aware border (spring-animated color transition)
            val interactionSource = remember { MutableInteractionSource() }
            val isFocused by interactionSource.collectIsFocusedAsState()
            val composerBorderColor by androidx.compose.animation.animateColorAsState(
                targetValue = if (isFocused) ControlBlue.withAlpha(0.72f) else Line2,
                animationSpec = Motion.colorDefault,
                label = "composerBorder"
            )
            val composerSurfaceColor by animateColorAsState(
                targetValue = if (isFocused) ControlBlue.withAlpha(0.065f) else Bg2.copy(alpha = 0.92f),
                animationSpec = Motion.colorDefault,
                label = "composerSurface",
            )
            val composerModifier = Modifier
                .fillMaxWidth()
                .clip(AppShapes.lg)
                .background(composerSurfaceColor)
                .border(1.dp, composerBorderColor, AppShapes.lg)
                .padding(horizontal = 13.dp, vertical = layoutDensity.composerInnerPadding.dp)

            Column(modifier = composerModifier) {
                AnimatedVisibility(
                    visible = attachments.isNotEmpty(),
                    enter = fadeIn(Motion.alphaEnter) + expandVertically(
                        expandFrom = Alignment.Top,
                        animationSpec = Motion.intSizeExpand,
                    ),
                    exit = fadeOut(Motion.alphaExit) + shrinkVertically(
                        shrinkTowards = Alignment.Top,
                        animationSpec = Motion.intSizeCollapse,
                    ),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        attachments.forEach { attachment ->
                            AttachmentPill(attachment) { onRemoveAttachment(attachment.id) }
                        }
                    }
                }
                val canSend = inputText.isNotBlank() || attachments.isNotEmpty()
                BasicTextField(
                    value = inputText,
                    onValueChange = { newText ->
                        if (newText.length > inputText.length && newText.last() == '@') {
                            showMentionDropdown = true
                            mentionFilter = ""
                            mentionStartIndex = newText.lastIndex
                        } else if (showMentionDropdown) {
                            if (mentionStartIndex in newText.indices) {
                                val afterAt = newText.substring(mentionStartIndex + 1)
                                if (afterAt.contains(' ') || newText.getOrNull(mentionStartIndex) != '@') {
                                    showMentionDropdown = false
                                    mentionFilter = ""
                                } else {
                                    mentionFilter = afterAt
                                }
                            } else {
                                showMentionDropdown = false
                                mentionFilter = ""
                            }
                        }
                        onInputChange(newText)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(
                            min = layoutDensity.inputMinHeight.dp,
                            max = layoutDensity.inputMaxHeight.dp,
                        )
                        .focusRequester(composerFocusRequester)
                        .onPreviewKeyEvent { event ->
                        if (showMentionDropdown) {
                            if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false
                            }
                            if (event.key in listOf(Key.DirectionUp, Key.DirectionDown, Key.Escape) && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false
                            }
                        }
                        if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                            if (!event.isShiftPressed && canSend && !isSending) {
                                onSend()
                                true
                            } else false
                        } else false
                    },
                    textStyle = TextStyle(color = Tx, fontSize = 14.sp, fontFamily = SansFont, lineHeight = 20.sp),
                    cursorBrush = SolidColor(ControlBlue),
                    interactionSource = interactionSource,
                    decorationBox = { innerTextField ->
                        Box {
                            if (inputText.isEmpty()) Text("告诉 Swarm 你想做什么…  可以 @agent 指派，或 #file 引用", color = Tx3, fontSize = 14.sp)
                            innerTextField()
                        }
                    }
                )
                Spacer(Modifier.height(6.dp))
                // composer-bar：chips 左 + 发送按钮右（对齐核心稿 .composer-bar）
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    ChipButton(Feather.Paperclip, "附件", ControlBlue, onClick = onAttach)
                    Spacer(Modifier.width(6.dp))
                    ChipButton(Feather.Settings, "MCP", ControlPurple, onClick = onMcpClick)
                    Spacer(Modifier.width(6.dp))
                    ChipButton(Feather.Grid, "Skill", ControlOrange, onClick = onSkillClick)
                    Spacer(Modifier.weight(1f))
                    ActionButton(
                        text = if (isSending) "停止" else "发送",
                        tone = if (isSending) ActionTone.DESTRUCTIVE else ActionTone.PRIMARY,
                        enabled = isSending || canSend,
                        compact = true,
                        onClick = if (isSending) onCancel else onSend,
                        modifier = Modifier.height(layoutDensity.actionHeight.dp),
                    )
                }
            }
            if (layoutDensity.showShortcutHints) {
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Enter", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                    Text(" 发送", color = Tx3, fontSize = 11.sp)
                    Spacer(Modifier.width(12.dp))
                    Text("Shift+Enter", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                    Text(" 换行", color = Tx3, fontSize = 11.sp)
                    Spacer(Modifier.weight(1f))
                    Text(contextUsageText, color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                }
            }
        }
    }
    }
}

@Composable
private fun EmptyConversationLanding(
    selectedAgent: AgentInfo,
    onPromptSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(AppShapes.lg)
            .background(Brush.linearGradient(listOf(Bg2.copy(alpha = 0.9f), Bg1.copy(alpha = 0.72f))))
            .border(1.dp, Line2, AppShapes.lg)
            .padding(Spacing.section)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(AppShapes.md)
                    .background(Brush.linearGradient(listOf(Ac, Ac2))),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    selectedAgent.letter,
                    color = OnAccent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont
                )
            }
            Spacer(Modifier.width(13.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "PI-NATIVE WORKSPACE",
                    color = AcLight,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = CodeFont
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "从清晰意图开始，让 ${selectedAgent.name} 理解、执行并验证",
                    color = Tx,
                    fontSize = 18.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont
                )
            }
            MicroPill(label = "PI READY", color = OkLight)
        }

        Spacer(Modifier.height(18.dp))
        Text(
            "选择一个起点，内容会写入输入框供你继续补充。",
            color = Tx2,
            fontSize = 13.sp,
            lineHeight = 19.sp,
            fontFamily = SansFont
        )
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            PromptTile(
                index = "01",
                title = "理解项目",
                description = "梳理架构、数据流与风险",
                prompt = "请先读取项目结构，分析当前架构、关键数据流和主要风险，然后给出按优先级排序的改进计划。",
                onPromptSelected = onPromptSelected,
                modifier = Modifier.weight(1f)
            )
            PromptTile(
                index = "02",
                title = "审查变更",
                description = "验证功能、集成与数据连通性",
                prompt = "请对当前工作区变更做一次深度代码审查，重点检查功能正确性、模块集成、并发安全和数据连通性。",
                onPromptSelected = onPromptSelected,
                modifier = Modifier.weight(1f)
            )
            PromptTile(
                index = "03",
                title = "实现需求",
                description = "先确认边界，再编码和验证",
                prompt = "请基于当前项目上下文，先确认目标、约束和受影响模块，再实现并验证这个需求：",
                onPromptSelected = onPromptSelected,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun PromptTile(
    index: String,
    title: String,
    description: String,
    prompt: String,
    onPromptSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = if (hovered) Ac.withAlpha(0.12f) else Bg3.copy(alpha = 0.72f),
        animationSpec = Motion.colorDefault,
        label = "promptTileBackground"
    )
    val border by animateColorAsState(
        targetValue = if (hovered) Ac.withAlpha(0.42f) else Line,
        animationSpec = Motion.colorDefault,
        label = "promptTileBorder"
    )
    Column(
        modifier = modifier
            .height(TileMetrics.featureHeight)
            .clip(AppShapes.md)
            .background(background)
            .border(1.dp, border, AppShapes.md)
            .hoverable(interaction)
            .clickable(interactionSource = interaction, indication = null) { onPromptSelected(prompt) }
            .padding(TileMetrics.contentPadding),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            MicroPill(label = index, color = AcLight)
            Text(
                title,
                color = Tx,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont,
                maxLines = 1
            )
        }
        Text(description, color = Tx3, fontSize = 11.sp, lineHeight = 16.sp, fontFamily = SansFont)
    }
}

@Composable
private fun ChatMessageItem(
    message: UiMessage,
    selectedAgent: AgentInfo,
    agents: List<AgentInfo>
) {
    if (message.isUser) {
        UserMessage(message.text, message.attachments, message.timestamp)
    } else {
        val messageAgent = agents.find { it.id == message.agentId } ?: selectedAgent
        AssistantMessage(
            sender = messageAgent.name,
            text = message.text.ifEmpty { null },
            activities = message.activities,
            toolCards = message.toolCards,
            codeCards = message.codeCards,
            isThinking = message.isThinking,
            role = message.role,
            timestamp = message.timestamp,
            agentLetter = messageAgent.letter,
            agentColor = messageAgent.color
        )
    }
}

@Composable
private fun ThinkingRow() {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.linearGradient(listOf(Ac, Ac2))),
            contentAlignment = Alignment.Center
        ) {
            Text("C", color = OnAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(14.dp))
        ThinkingIndicator()
    }
}

private fun androidx.compose.foundation.lazy.LazyListState.isNearEnd(): Boolean =
    isTimelineNearEnd(
        lastVisibleItemIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1,
        totalItemsCount = layoutInfo.totalItemsCount
    )

internal fun isTimelineNearEnd(lastVisibleItemIndex: Int, totalItemsCount: Int): Boolean =
    totalItemsCount > 0 && lastVisibleItemIndex >= totalItemsCount - 1

internal fun timelineEndIndex(messageCount: Int): Int {
    require(messageCount >= 0) { "messageCount must not be negative" }
    return messageCount + 1
}

private val messageClockFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val messageDateFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")

internal fun formatMessageTimestamp(
    timestamp: String,
    now: Instant = Instant.now(),
    zoneId: ZoneId = ZoneId.systemDefault(),
): String {
    val instant = runCatching { Instant.parse(timestamp) }.getOrNull() ?: return timestamp
    val value = instant.atZone(zoneId)
    val today = now.atZone(zoneId).toLocalDate()
    return when (value.toLocalDate()) {
        today -> messageClockFormatter.format(value)
        today.minusDays(1) -> "昨天 ${messageClockFormatter.format(value)}"
        else -> messageDateFormatter.format(value)
    }
}

@Composable
private fun ChipButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tone: Color,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val chipBg by animateColorAsState(
        if (hovered) tone.withAlpha(0.17f) else tone.withAlpha(0.09f),
        Motion.colorDefault, label = "chipBg"
    )
    val chipBorder by animateColorAsState(
        if (hovered) tone.withAlpha(0.42f) else tone.withAlpha(0.22f),
        Motion.colorDefault, label = "chipBorder"
    )
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(chipBg)
            .border(1.dp, chipBorder, RoundedCornerShape(8.dp))
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .height(28.dp)
            .padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = tone,
            modifier = Modifier.size(12.dp)
        )
        Spacer(Modifier.width(4.dp))
        Text(label, color = if (hovered) tone else Tx2, fontSize = 12.sp, fontFamily = SansFont)
    }
}

@Composable
private fun UserMessage(text: String, attachments: List<UiImageAttachment>, timestamp: String) {
    // 对齐核心稿：用户消息左对齐，头像 S 在左 + Swarmer + YOU + 时间
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.linearGradient(listOf(AgentClaude, AgentQwen))),
            contentAlignment = Alignment.Center
        ) {
            Text("S", color = OnAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Swarmer", color = Tx3, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont, letterSpacing = 0.5.sp)
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Bg3)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text("YOU", color = Tx2, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont, letterSpacing = 0.5.sp)
                }
                Spacer(Modifier.weight(1f))
                Text(formatMessageTimestamp(timestamp), color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
            }
            Spacer(Modifier.height(6.dp))
            if (text.isNotBlank()) AnnotatedText(text, color = Tx, fontSize = 14.sp)
            if (attachments.isNotEmpty()) {
                if (text.isNotBlank()) Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    attachments.forEach { attachment -> AttachmentPill(attachment) }
                }
            }
        }
    }
}

@Composable
private fun AttachmentPill(attachment: UiImageAttachment, onRemove: (() -> Unit)? = null) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(7.dp))
            .background(Ac.withAlpha(0.1f))
            .border(1.dp, Ac.withAlpha(0.3f), RoundedCornerShape(7.dp))
            .padding(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AttachmentThumbnail(attachment)
        Spacer(Modifier.width(6.dp))
        Column(modifier = Modifier.width(92.dp)) {
            Text(
                attachment.name,
                color = Tx,
                fontSize = 10.sp,
                fontFamily = SansFont,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(formatFileSize(attachment.sizeBytes), color = Tx3, fontSize = 9.sp, fontFamily = SansFont)
        }
        if (onRemove != null) {
            Spacer(Modifier.width(7.dp))
            Icon(
                imageVector = Feather.X,
                contentDescription = "移除 ${attachment.name}",
                tint = Tx3,
                modifier = Modifier.size(12.dp).clickable(onClick = onRemove)
            )
        }
    }
}

@Composable
private fun AttachmentThumbnail(attachment: UiImageAttachment) {
    val bitmap by produceState<ImageBitmap?>(null, attachment.id) {
        value = try {
            val bytes = attachment.base64?.let { encoded ->
                withContext(Dispatchers.Default) { Base64.getDecoder().decode(encoded) }
            } ?: withContext(Dispatchers.IO) {
                File(attachment.path).readBytes()
            }
            withContext(Dispatchers.Default) {
                SkiaImage.makeFromEncoded(bytes).toComposeImageBitmap()
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }
    Box(
        modifier = Modifier
            .size(width = 52.dp, height = 40.dp)
            .clip(RoundedCornerShape(5.dp))
            .background(Bg3),
        contentAlignment = Alignment.Center,
    ) {
        bitmap?.let { image ->
            Image(
                bitmap = image,
                contentDescription = attachment.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } ?: Text("IMG", color = Ac, fontSize = 9.sp, fontWeight = FontWeight.Bold, fontFamily = SansFont)
    }
}

private fun formatFileSize(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> "%.1f MB".format(bytes / (1024.0 * 1024.0))
    bytes >= 1024L -> "%.1f KB".format(bytes / 1024.0)
    else -> "$bytes B"
}

@Composable
private fun AssistantMessage(
    sender: String,
    text: String?,
    activities: List<UiActivity>,
    toolCards: List<com.swarmeditor.desktop.ui.chat.ToolCardData>,
    codeCards: List<com.swarmeditor.desktop.ui.chat.CodeCardData>,
    isThinking: Boolean,
    role: String?,
    timestamp: String,
    agentLetter: String,
    agentColor: Color = Ac
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.linearGradient(listOf(agentColor, lerp(agentColor, Bg0, 0.3f)))),
            contentAlignment = Alignment.Center
        ) {
            Text(agentLetter, color = OnAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            // 头部：名称 + 角色徽标 + 标签 + 时间（单行，对齐核心稿 .msg-head）
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    sender,
                    color = Tx3,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont,
                    letterSpacing = 0.5.sp
                )
                if (role != null) {
                    val tagColor = when (role.uppercase()) {
                        "AGENT" -> Ac
                        "REVIEWING" -> AgentClaude
                        else -> Ac
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(tagColor.withAlpha(0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            role.uppercase(),
                            color = tagColor,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = SansFont,
                            letterSpacing = 0.5.sp
                        )
                    }
                    if (role.equals("AGENT", true)) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(Ac.withAlpha(0.15f))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text(
                                "智能执行",
                                color = AcLight,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = SansFont,
                                letterSpacing = 0.3.sp
                            )
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Text(formatMessageTimestamp(timestamp), color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
            }
            Spacer(Modifier.height(6.dp))

            // 对齐核心稿：文本 + 内联闪烁点（同一行）；纯思考态只显示点
            if (text != null && text.isNotEmpty() && isThinking) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AnnotatedText(text, color = Tx2, fontSize = 14.sp)
                    Spacer(Modifier.width(6.dp))
                    ThinkingIndicator()
                }
            } else {
                if (text != null && text.isNotEmpty()) AnnotatedText(text, color = Tx, fontSize = 14.sp)
                if (isThinking) ThinkingIndicator()
            }

            toolCards.forEachIndexed { index, card ->
                Spacer(Modifier.height(8.dp))
                ToolCard(card = card, defaultExpanded = index == 0)
            }

            codeCards.forEach { card ->
                Spacer(Modifier.height(8.dp))
                CodeCard(card = card)
            }

            activities.forEach { act ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp).clip(RoundedCornerShape(8.dp)).background(Bg3).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(act.icon, fontSize = 12.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(act.label, color = if (act.isOk) Ok else Tx2, fontSize = 12.sp)
                    Spacer(Modifier.width(4.dp))
                    Text(act.detail, color = Tx, fontSize = 12.sp, fontFamily = SansFont)
                }
            }
        }
    }
}

@Composable
private fun AnnotatedText(text: String, color: Color = Tx, fontSize: TextUnit = 14.sp) {
    val codeColor = AcLight
    val codeBackground = Ac.withAlpha(0.12f)
    val annotated = remember(text, fontSize, codeColor, codeBackground) {
        annotateInlineCode(text, fontSize, codeColor, codeBackground)
    }
    Text(annotated, color = color, fontSize = fontSize, lineHeight = 21.sp, fontFamily = SansFont)
}

internal fun annotateInlineCode(
    text: String,
    fontSize: TextUnit,
    codeColor: Color,
    codeBackground: Color,
): androidx.compose.ui.text.AnnotatedString = buildAnnotatedString {
    var cursor = 0
    while (cursor < text.length) {
        val start = text.indexOf('`', cursor)
        if (start == -1) {
            append(text.substring(cursor))
            break
        }
        append(text.substring(cursor, start))
        val end = text.indexOf('`', start + 1)
        if (end == -1) {
            append(text.substring(start))
            break
        }
        withStyle(
            SpanStyle(
                fontFamily = CodeFont,
                background = codeBackground,
                color = codeColor,
                fontSize = fontSize * 0.95f,
            )
        ) {
            append(text.substring(start + 1, end))
        }
        cursor = end + 1
    }
}

@Composable
private fun ChatTopBar(
    selectedAgent: AgentInfo,
    agents: List<AgentInfo>,
    messages: List<UiMessage>,
    sessionTitle: String,
    onSelectAgent: (String) -> Unit = {},
    verticalPadding: Int = 8,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Bg1.copy(alpha = 0.6f))
            .border(1.dp, Line)
            .padding(horizontal = 16.dp, vertical = verticalPadding.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Left icon (28px, rounded 7px, purple bg 15%)
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(ControlPurple.withAlpha(0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Feather.GitBranch,
                contentDescription = "Session",
                tint = ControlPurple,
                modifier = Modifier.size(14.dp)
            )
        }
        Spacer(Modifier.width(10.dp))

        // Title + subtitle
        Column {
            Text(
                text = sessionTitle,
                color = Tx,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "本地会话 · ${messages.size} 轮对话 · 智能工具协同",
                color = Tx3,
                fontSize = 12.sp
            )
        }

        // Agent tabs
        if (agents.isNotEmpty()) {
            Spacer(Modifier.width(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                agents.take(3).forEach { agent ->
                    AgentTab(
                        agent = agent,
                        isActive = agent.id == selectedAgent.id,
                        onClick = { onSelectAgent(agent.id) },
                    )
                }
                if (agents.size > 3) {
                    Text(
                        "+${agents.size - 3}",
                        color = Tx3,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 5.dp),
                    )
                }
            }
        }

        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun AgentTab(
    agent: AgentInfo,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val tone = agent.color
    val background by animateColorAsState(
        when {
            isActive -> tone.withAlpha(0.14f)
            hovered -> tone.withAlpha(0.08f)
            else -> Color.Transparent
        },
        Motion.colorDefault,
        label = "agentTabBackground",
    )
    val border by animateColorAsState(
        if (isActive) tone.withAlpha(0.3f) else Color.Transparent,
        Motion.colorDefault,
        label = "agentTabBorder",
    )
    Row(
        modifier = Modifier
            .clip(AppShapes.sm)
            .background(background)
            .border(1.dp, border, AppShapes.sm)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(RoundedCornerShape(3.5.dp))
                .background(if (agent.isConnected) tone else Tx3)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            agent.name.removeSuffix(" CLI"),
            color = if (isActive || hovered) tone else Tx3,
            fontSize = 12.sp,
            maxLines = 1,
            softWrap = false,
        )
    }
}
