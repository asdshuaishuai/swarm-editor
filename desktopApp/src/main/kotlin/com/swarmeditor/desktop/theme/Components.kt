package com.swarmeditor.desktop.theme

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// 等宽字体
val MonoFont = FontFamily.Monospace

// 状态指示灯
@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(color)
    )
}

// Agent 图标（左侧栏）
@Composable
fun AgentIcon(
    emoji: String,
    isActive: Boolean,
    statusColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(42.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isActive) Surface else Color.Transparent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(emoji, fontSize = 20.sp)
        StatusDot(
            color = statusColor,
            modifier = Modifier.align(Alignment.BottomEnd)
        )
    }
}

// 会话卡片（左侧栏）
@Composable
fun SessionCard(
    title: String,
    agentEmoji: String,
    agentColor: Color,
    agentName: String,
    timeAgo: String,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = when {
        isActive -> Surface
        else -> Color.Transparent
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Text(
            text = title,
            color = Tx,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1
        )
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(agentColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Text(agentEmoji, fontSize = 8.sp)
            }
            Spacer(Modifier.width(6.dp))
            Text(agentName, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
            Text(" · ", color = Tx4, fontSize = 11.sp)
            Text(timeAgo, color = Tx3, fontSize = 11.sp)
        }
    }
}

// 消息气泡
@Composable
fun MessageBubble(
    isUser: Boolean,
    sender: String,
    content: @Composable () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        if (!isUser) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(AcD),
                contentAlignment = Alignment.Center
            ) {
                Text("C", color = Ac, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(12.dp))
        }
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            if (!isUser) {
                Text(
                    text = sender,
                    color = Tx3,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = MonoFont,
                    letterSpacing = 0.5.sp
                )
                Spacer(Modifier.height(4.dp))
            }
            content()
        }
        if (isUser) {
            Spacer(Modifier.width(12.dp))
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(PrD),
                contentAlignment = Alignment.Center
            ) {
                Text("U", color = Pr, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// 活动日志条目
@Composable
fun ActivityEntry(
    time: String,
    actor: String,
    action: String,
    resource: String,
    actionColor: Color = Tx2,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(time, color = Tx4, fontSize = 10.sp, fontFamily = MonoFont)
        Spacer(Modifier.width(6.dp))
        Text(actor, color = Ac, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont)
        Spacer(Modifier.width(4.dp))
        Text(action, color = actionColor, fontSize = 11.sp, fontFamily = MonoFont)
        Spacer(Modifier.width(4.dp))
        Text(resource, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
    }
}

// MCP/Skill 启用切换
@Composable
fun AgentToggle(
    name: String,
    enabled: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = if (enabled) AcD else Surface
    val border = if (enabled) Ac else Bd
    val textColor = if (enabled) Ac else Tx3
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(5.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(5.dp))
            .clickable(onClick = onToggle)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(if (enabled) Ac else Tx3)
        )
        Spacer(Modifier.width(4.dp))
        Text(name, color = textColor, fontSize = 10.sp, fontWeight = FontWeight.Medium, fontFamily = MonoFont)
    }
}

// 文件标签
@Composable
fun FileBadge(
    ext: String,
    fileName: String,
    extColor: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(5.dp))
            .background(Surface)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = ext.uppercase(),
            color = extColor,
            fontSize = 8.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = MonoFont,
            modifier = Modifier
                .clip(RoundedCornerShape(3.dp))
                .background(extColor.copy(alpha = 0.12f))
                .padding(horizontal = 4.dp, vertical = 1.dp)
        )
        Spacer(Modifier.width(4.dp))
        Text(fileName, color = Tx2, fontSize = 11.sp, fontFamily = MonoFont)
    }
}
