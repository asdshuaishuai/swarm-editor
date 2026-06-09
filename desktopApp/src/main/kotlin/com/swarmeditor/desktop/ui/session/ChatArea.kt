package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
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
    onMcpClick: () -> Unit = {},
    onSkillClick: () -> Unit = {}
) {
    // Mention state
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionFilter by remember { mutableStateOf("") }
    var mentionStartIndex by remember { mutableStateOf(-1) }

    // Simple token estimate: ~4 chars per token
    val tokenEstimate = inputText.length / 4

    Column(modifier = modifier) {
        // 消息区
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp, 20.dp, 24.dp, 20.dp)) {
            if (messages.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 80.dp), contentAlignment = Alignment.Center) {
                    Text("选择 Agent 开始对话", color = Tx3, fontSize = 14.sp, fontFamily = MonoFont)
                }
            }
            messages.forEach { msg ->
                if (msg.isUser) UserMessage(msg.text)
                else AssistantMessage(
                    sender = selectedAgent.name,
                    text = msg.text.ifEmpty { null },
                    activities = msg.activities,
                    toolCards = msg.toolCards,
                    codeCards = msg.codeCards,
                    isThinking = msg.isThinking,
                    role = msg.role
                )
                Spacer(Modifier.height(18.dp))
            }
            if (isSending) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(AcD), contentAlignment = Alignment.Center) {
                        Text("C", color = Ac, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(12.dp))
                    ThinkingIndicator()
                }
            }
        }

        // 输入区
        Column(modifier = Modifier.fillMaxWidth().background(Glass2).border(1.dp, Bd).padding(12.dp, 12.dp, 16.dp, 12.dp)) {
            // Mention dropdown (shown above chips/input)
            if (showMentionDropdown) {
                Box(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    MentionDropdown(
                        agents = agents.ifEmpty { listOf(selectedAgent) },
                        filter = mentionFilter,
                        onSelect = { agentName ->
                            // Replace "@filter" with "@AgentName "
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

            // Chip buttons row
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Attachment chip (placeholder)
                ChipButton("📎 附件", onClick = { /* placeholder */ })
                Spacer(Modifier.width(6.dp))
                // MCP chip
                ChipButton("🔧 MCP", onClick = onMcpClick)
                Spacer(Modifier.width(6.dp))
                // Skill chip
                ChipButton("⚡ Skill", onClick = onSkillClick)
                Spacer(Modifier.weight(1f))
                // Token count
                Text("$tokenEstimate tokens", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
            }

            // Text input row
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(RR2)).background(Surface).border(1.dp, Bd, RoundedCornerShape(RR2)).padding(10.dp, 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    value = inputText,
                    onValueChange = { newText ->
                        // Detect "@" to trigger mention dropdown
                        if (newText.length > inputText.length && newText.last() == '@') {
                            showMentionDropdown = true
                            mentionFilter = ""
                            mentionStartIndex = newText.lastIndex
                        } else if (showMentionDropdown) {
                            // Update filter based on text after "@"
                            if (mentionStartIndex in newText.indices) {
                                val afterAt = newText.substring(mentionStartIndex + 1)
                                // If user typed a space or deleted the "@", dismiss
                                if (afterAt.contains(' ') || newText.getOrNull(mentionStartIndex) != '@') {
                                    showMentionDropdown = false
                                    mentionFilter = ""
                                } else {
                                    mentionFilter = afterAt
                                }
                            }
                        }
                        onInputChange(newText)
                    },
                    modifier = Modifier.weight(1f).onPreviewKeyEvent { event ->
                        if (showMentionDropdown) {
                            // Let MentionDropdown handle nav keys — pass through by returning false
                            // The dropdown's onPreviewKeyEvent handles Up/Down/Enter/Escape
                            if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false // let dropdown handle it
                            }
                            if (event.key in listOf(Key.DirectionUp, Key.DirectionDown, Key.Escape) && event.type == KeyEventType.KeyDown) {
                                return@onPreviewKeyEvent false // let dropdown handle
                            }
                        }
                        if (event.key == Key.Enter && event.type == KeyEventType.KeyDown) {
                            if (!event.isShiftPressed && inputText.isNotBlank() && !isSending) {
                                onSend()
                                true
                            } else false
                        } else false
                    },
                    textStyle = TextStyle(color = Tx, fontSize = 14.sp, fontFamily = MonoFont),
                    cursorBrush = SolidColor(Ac),
                    decorationBox = { innerTextField ->
                        Box {
                            if (inputText.isEmpty()) Text("输入消息...", color = Tx3, fontSize = 14.sp)
                            innerTextField()
                        }
                    }
                )
                Box(
                    modifier = Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(if (inputText.isNotBlank() && !isSending) Ac else Ac.copy(alpha = 0.4f))
                        .then(if (inputText.isNotBlank() && !isSending) Modifier.clickable { onSend() } else Modifier),
                    contentAlignment = Alignment.Center
                ) {
                    Text("↑", color = Bg, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row {
                Text("Enter", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Surface2).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 发送 · ", color = Tx4, fontSize = 11.sp)
                Text("Shift+Enter", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Surface2).padding(horizontal = 5.dp, vertical = 2.dp))
                Text(" 换行", color = Tx4, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun ChipButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(Surface2)
            .border(1.dp, Bd, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(label, color = Tx2, fontSize = 10.sp, fontFamily = MonoFont)
    }
}

@Composable
private fun UserMessage(text: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
            Text(text, color = Tx, fontSize = 14.sp, lineHeight = 22.sp)
        }
        Spacer(Modifier.width(12.dp))
        Box(modifier = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(PrD), contentAlignment = Alignment.Center) {
            Text("U", color = Pr, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
    role: String?
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(modifier = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(AcD), contentAlignment = Alignment.Center) {
            Text("C", color = Ac, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(sender, color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont, letterSpacing = 0.5.sp)
            Spacer(Modifier.height(4.dp))

            // Role tag
            if (role != null) {
                val tagColor = when (role.uppercase()) {
                    "AGENT" -> Ac
                    "REVIEWING" -> Pr
                    else -> Ac
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(tagColor.copy(alpha = 0.12f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        role.uppercase(),
                        color = tagColor,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = MonoFont,
                        letterSpacing = 0.5.sp
                    )
                }
                Spacer(Modifier.height(6.dp))
            }

            if (text != null && text.isNotEmpty()) Text(text, color = Tx, fontSize = 14.sp, lineHeight = 22.sp)

            // Thinking indicator
            if (isThinking) {
                if (text != null && text.isNotEmpty()) Spacer(Modifier.height(8.dp))
                ThinkingIndicator(text = "正在审查")
            }

            // Tool cards
            toolCards.forEachIndexed { index, card ->
                Spacer(Modifier.height(8.dp))
                ToolCard(card = card, defaultExpanded = index == 0)
            }

            // Code cards
            codeCards.forEach { card ->
                Spacer(Modifier.height(8.dp))
                CodeCard(card = card)
            }

            // Activities
            activities.forEach { act ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp).clip(RoundedCornerShape(7.dp)).background(Surface2).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(act.icon, fontSize = 12.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(act.label, color = if (act.isOk) Gn else Tx2, fontSize = 12.sp)
                    Spacer(Modifier.width(4.dp))
                    Text(act.detail, color = Tx, fontSize = 12.sp, fontFamily = MonoFont)
                }
            }
        }
    }
}
