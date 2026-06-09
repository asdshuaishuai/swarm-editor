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

val MonoFont = FontFamily.Monospace

fun Modifier.glassBg(): Modifier = this.background(Glass)

fun Modifier.cardBg(): Modifier = this
    .clip(RoundedCornerShape(RR))
    .background(Surface)
    .border(1.dp, Bd, RoundedCornerShape(RR))

val sectionLabel: @Composable (String) -> Unit = { text ->
    Text(
        text = text.uppercase(),
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        color = Tx3,
        letterSpacing = 0.8.sp
    )
}

@Composable
fun StatusDot(
    color: Color,
    modifier: Modifier = Modifier,
    glow: Boolean = false
) {
    Box(
        modifier = modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(color)
    )
}

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
            .clip(RoundedCornerShape(RR))
            .background(if (isActive) Glass2 else Color.Transparent)
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
    Column(
        modifier = modifier
            .fillMaxWidth()
            .cardBg()
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

@Composable
fun GlowButton(
    text: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = if (active) AcD else Surface
    val textColor = if (active) Ac else Tx2
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(RR))
            .background(bg)
            .border(1.dp, if (active) Ac else Bd, RoundedCornerShape(RR))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = textColor, fontSize = 11.sp, fontWeight = FontWeight.Medium, fontFamily = MonoFont)
    }
}

@Composable
fun FilterChip(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(RR2))
            .background(if (active) AcD else Surface)
            .border(1.dp, if (active) Ac else Bd, RoundedCornerShape(RR2))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (active) Ac else Tx3,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = MonoFont
        )
    }
}
