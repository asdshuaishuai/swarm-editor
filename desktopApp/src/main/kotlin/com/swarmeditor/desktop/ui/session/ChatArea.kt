package com.swarmeditor.desktop.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MergeType
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
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

@Composable
fun ChatArea(
    selectedAgent: AgentInfo,
    messages: List<UiMessage>,
    isSending: Boolean,
    inputText: String,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    agents: List<AgentInfo> = emptyList(),
    sessionTitle: String = selectedAgent.name,
    onSelectAgent: (String) -> Unit = {},
    onMcpClick: () -> Unit = {},
    onSkillClick: () -> Unit = {}
) {
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionFilter by remember { mutableStateOf("") }
    var mentionStartIndex by remember { mutableStateOf(-1) }

    Column(modifier = modifier) {
        // ── Chat TopBar ───────────────────────────────────────────────
        ChatTopBar(
            selectedAgent = selectedAgent,
            agents = agents,
            messages = messages,
            sessionTitle = sessionTitle,
            onSelectAgent = onSelectAgent,
            modifier = Modifier.fillMaxWidth()
        )

        // 消息列表（新消息自动滚动到底部，符合 chat 阅读习惯）
        val scrollState = rememberScrollState()
        // 首次加载滚到顶部（展示用户消息+分析，对齐核心稿阅读流）；新消息再滚到底部
        var initialized by remember { mutableStateOf(false) }
        LaunchedEffect(messages) {
            if (messages.isEmpty()) return@LaunchedEffect
            if (!initialized) { scrollState.scrollTo(0); initialized = true }
            else scrollState.animateScrollTo(scrollState.maxValue)
        }
        Column(modifier = Modifier.weight(1f).verticalScroll(scrollState).padding(24.dp, 24.dp, 32.dp, 24.dp)) {
            if (messages.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 80.dp), contentAlignment = Alignment.Center) {
                    Text("选择一个 Agent 开始对话", color = Tx3, fontSize = 14.sp, fontFamily = SansFont)
                }
            }
            messages.forEach { msg ->
                if (msg.isUser) UserMessage(msg.text, msg.timestamp)
                else {
                    // 按消息归属的 Agent 显示头像/名字/配色（避免 QwenCode 消息套 Claude 头像）
                    val msgAgent = agents.find { it.id == msg.agentId } ?: selectedAgent
                    AssistantMessage(
                        sender = msgAgent.name,
                        text = msg.text.ifEmpty { null },
                        activities = msg.activities,
                        toolCards = msg.toolCards,
                        codeCards = msg.codeCards,
                        isThinking = msg.isThinking,
                        role = msg.role,
                        timestamp = msg.timestamp,
                        agentLetter = msgAgent.letter,
                        agentColor = msgAgent.color
                    )
                }
                Spacer(Modifier.height(22.dp))
            }
            if (isSending) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Brush.linearGradient(listOf(Ac, Ac2))),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("C", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(14.dp))
                    ThinkingIndicator()
                }
            }
        }

        // Composer wrap
        Column(modifier = Modifier.fillMaxWidth().background(Bg1.copy(alpha = 0.4f)).border(1.dp, Line).padding(10.dp, 32.dp, 14.dp)) {
            if (showMentionDropdown) {
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

            // Input field with focus-aware border
            val interactionSource = remember { MutableInteractionSource() }
            val isFocused by interactionSource.collectIsFocusedAsState()

            val composerBorder = if (isFocused) Ac else Line2
            val composerModifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.linearGradient(
                        listOf(Bg3.copy(alpha = 0.8f), Bg2.copy(alpha = 0.8f))
                    )
                )
                .border(1.dp, composerBorder, RoundedCornerShape(14.dp))
                .then(
                    if (isFocused) {
                        Modifier.shadow(
                            elevation = 8.dp,
                            shape = RoundedCornerShape(14.dp),
                            ambientColor = Ac.copy(alpha = 0.12f),
                            spotColor = Color.Transparent
                        )
                    } else Modifier
                )
                .padding(horizontal = 15.dp, vertical = 13.dp)

            Column(modifier = composerModifier) {
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
                    modifier = Modifier.fillMaxWidth().onPreviewKeyEvent { event ->
                        if (showMentionDropdown) {
                            if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false
                            }
                            if (event.key in listOf(Key.DirectionUp, Key.DirectionDown, Key.Escape) && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false
                            }
                        }
                        if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                            if (!event.isShiftPressed && inputText.isNotBlank() && !isSending) {
                                onSend()
                                true
                            } else false
                        } else false
                    },
                    textStyle = TextStyle(color = Tx, fontSize = 14.sp, fontFamily = SansFont, lineHeight = 20.sp),
                    cursorBrush = SolidColor(Ac),
                    interactionSource = interactionSource,
                    decorationBox = { innerTextField ->
                        Box {
                            if (inputText.isEmpty()) Text("告诉 Swarm 你想做什么…  可以 @agent 指派，或 #file 引用", color = Tx3, fontSize = 14.sp)
                            innerTextField()
                        }
                    }
                )
                Spacer(Modifier.height(10.dp))
                // composer-bar：chips 左 + 发送按钮右（对齐核心稿 .composer-bar）
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    ChipButton(Icons.Filled.AttachFile, "附件", onClick = { /* placeholder */ })
                    Spacer(Modifier.width(6.dp))
                    ChipButton(Icons.Filled.Settings, "MCP", onClick = onMcpClick)
                    Spacer(Modifier.width(6.dp))
                    ChipButton(Icons.Filled.Extension, "Skill", onClick = onSkillClick)
                    Spacer(Modifier.weight(1f))
                    // Send button
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(
                                if (inputText.isNotBlank() && !isSending) {
                                    Brush.linearGradient(listOf(Ac, Ac2))
                                } else {
                                    Brush.linearGradient(listOf(Ac.copy(alpha = 0.4f), Ac2.copy(alpha = 0.4f)))
                                }
                            )
                            .then(
                                if (inputText.isNotBlank() && !isSending) {
                                    Modifier.shadow(
                                        elevation = 8.dp,
                                        shape = RoundedCornerShape(8.dp),
                                        ambientColor = Ac.copy(alpha = 0.3f),
                                        spotColor = Ac.copy(alpha = 0.3f)
                                    ).clickable { onSend() }
                                } else Modifier
                            )
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "发送",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = SansFont
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Enter", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 发送", color = Tx3, fontSize = 11.sp)
                Spacer(Modifier.width(16.dp))
                Text("Shift+Enter", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 换行", color = Tx3, fontSize = 11.sp)
                Spacer(Modifier.width(16.dp))
                Text("@", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 指派", color = Tx3, fontSize = 11.sp)
                Spacer(Modifier.width(16.dp))
                Text("#", color = Tx3, fontSize = 10.sp, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 引用", color = Tx3, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                Text("Token: 1,247 / 128K", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
            }
        }
    }
}

@Composable
private fun ChipButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Bg3.copy(alpha = 0.8f))
            .border(1.dp, Line, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = Tx2,
            modifier = Modifier.size(12.dp)
        )
        Spacer(Modifier.width(4.dp))
        Text(label, color = Tx2, fontSize = 12.sp, fontFamily = SansFont)
    }
}

@Composable
private fun UserMessage(text: String, timestamp: String) {
    // 对齐核心稿：用户消息左对齐，头像 S 在左 + Swarmer + YOU + 时间
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.linearGradient(listOf(AgentClaude, AgentQwen))),
            contentAlignment = Alignment.Center
        ) {
            Text("S", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                Text(timestamp, color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
            }
            Spacer(Modifier.height(6.dp))
            AnnotatedText(text, color = Tx, fontSize = 14.sp)
        }
    }
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
                .background(Brush.linearGradient(listOf(agentColor, lerp(agentColor, Color.Black, 0.3f)))),
            contentAlignment = Alignment.Center
        ) {
            Text(agentLetter, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                                "ACP",
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
                Text(timestamp, color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
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
    val annotated = buildAnnotatedString {
        var remaining = text
        while (true) {
            val start = remaining.indexOf('`')
            if (start == -1) {
                append(remaining)
                break
            }
            append(remaining.substring(0, start))
            val end = remaining.indexOf('`', start + 1)
            if (end == -1) {
                append(remaining.substring(start))
                break
            }
            val code = remaining.substring(start + 1, end)
            withStyle(
                SpanStyle(
                    fontFamily = CodeFont,
                    background = Ac.withAlpha(0.12f),
                    color = AcLight,
                    fontSize = fontSize * 0.95f
                )
            ) {
                append(code)
            }
            remaining = remaining.substring(end + 1)
        }
    }
    Text(annotated, color = color, fontSize = fontSize, lineHeight = 21.sp, fontFamily = SansFont)
}

@Composable
private fun ChatTopBar(
    selectedAgent: AgentInfo,
    agents: List<AgentInfo>,
    messages: List<UiMessage>,
    sessionTitle: String,
    onSelectAgent: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Bg1.copy(alpha = 0.6f))
            .border(1.dp, Line)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Left icon (28px, rounded 7px, purple bg 15%)
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Ac.withAlpha(0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.MergeType,
                contentDescription = "Session",
                tint = Ac,
                modifier = Modifier.size(14.dp)
            )
        }
        Spacer(Modifier.width(10.dp))

        // Title + subtitle
        Column {
            Text(
                text = sessionTitle,
                color = Tx,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "使用官方 SDK 封装连接管理 · ${messages.size} 轮对话 · 3 个变更文件",
                color = Tx3,
                fontSize = 12.sp
            )
        }

        // Agent tabs
        if (agents.isNotEmpty()) {
            Spacer(Modifier.width(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                agents.take(3).forEach { agent ->
                    val isActive = agent.id == selectedAgent.id
                    val dotColor = when (agent.id) {
                        "claude-code" -> AgentClaude
                        "qwencode" -> AgentQwen
                        "gemini-cli" -> AgentGemini
                        "kimi-code" -> AgentKimi
                        "opencode" -> AgentOpenCode
                        else -> Ac
                    }
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isActive) Ac.withAlpha(0.12f) else Color.Transparent)
                            .border(1.dp, if (isActive) Ac.withAlpha(0.2f) else Color.Transparent, RoundedCornerShape(8.dp))
                            .clickable { onSelectAgent(agent.id) }
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(RoundedCornerShape(3.5.dp))
                                .background(if (agent.isConnected) dotColor else Tx3)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            agent.name.removeSuffix(" CLI"),
                            color = if (isActive) AcLight else Tx3,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }

        Spacer(Modifier.weight(1f))

        // Action icons
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { /* branch */ },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.AccountTree,
                    contentDescription = "Branch",
                    tint = Tx3,
                    modifier = Modifier.size(14.dp)
                )
            }
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { /* share */ },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = "Share",
                    tint = Tx3,
                    modifier = Modifier.size(14.dp)
                )
            }
        }
    }
}
