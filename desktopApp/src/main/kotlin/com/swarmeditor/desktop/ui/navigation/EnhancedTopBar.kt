package com.swarmeditor.desktop.ui.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import kotlin.math.min

@Composable
fun EnhancedTopBar(
    projectName: String = "swarm-editor",
    branchName: String = "main",
    agentCount: Int = 5,
    onlineCount: Int = 2,
    unreadNotifications: Int = 3,
    onCmdK: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onSettings: () -> Unit = {},
    onUserAvatar: () -> Unit = {},
    onProjectSwitcher: () -> Unit = {},
    onSwarmStatus: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(
                Brush.linearGradient(
                    listOf(Bg2.copy(alpha = 0.9f), Bg1.copy(alpha = 0.9f))
                )
            )
            .border(1.dp, Line)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Logo（conic 五色渐变 + 内挖 + 白点，对齐核心稿 .logo-mark）
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.matchParentSize().background(Brush.sweepGradient(listOf(AgentClaude, AgentQwen, AgentGemini, AgentKimi, AgentOpenCode, AgentClaude))))
            Box(Modifier.size(14.dp).clip(RoundedCornerShape(3.dp)).background(Bg1))
            Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White))
        }
        Spacer(Modifier.width(8.dp))
        Text(
            "Swarm Editor",
            color = Tx,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont,
            letterSpacing = 0.2.sp
        )
        Spacer(Modifier.width(6.dp))
        // MVP badge
        Box(
            modifier = Modifier
                .height(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Ac.withAlpha(0.15f))
                .padding(horizontal = 5.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "MVP",
                color = AcLight,
                fontSize = 8.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont
            )
        }

        Spacer(Modifier.width(14.dp))
        Box(Modifier.width(1.dp).height(18.dp).background(Line))
        Spacer(Modifier.width(10.dp))

        // Project switcher
        Box(
            modifier = Modifier
                .height(26.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(Bg3.copy(alpha = 0.5f))
                .border(1.dp, Line, RoundedCornerShape(7.dp))
                .clickable(onClick = onProjectSwitcher)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    projectName,
                    color = Tx2,
                    fontSize = 12.sp,
                    fontFamily = SansFont,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    " · ",
                    color = Tx3,
                    fontSize = 12.sp,
                    fontFamily = SansFont
                )
                Text(
                    branchName,
                    color = OkLight,
                    fontSize = 12.sp,
                    fontFamily = SansFont,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(Modifier.width(14.dp))
        Box(Modifier.width(1.dp).height(18.dp).background(Line))
        Spacer(Modifier.width(10.dp))

        HoverTipBox("查看 Swarm 状态") {
        // Swarm status: agent avatars（点击 → Agent 编排台）
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(7.dp))
                .clickable(onClick = onSwarmStatus)
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val avatarColors = listOf(
                listOf(AgentClaude, Ac2),
                listOf(AgentQwen, Ac2),
                listOf(AgentGemini, Ac2)
            )
            val avatarLetters = listOf("C", "Q", "G")

            avatarLetters.take(minOf(3, agentCount)).forEachIndexed { i, letter ->
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .offset(x = if (i > 0) ((-6).dp) else 0.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(avatarColors[i])
                        )
                        .border(2.dp, Bg1, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        letter,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = SansFont
                    )
                }
            }
            if (agentCount > 3) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .offset(x = ((-6).dp))
                        .clip(CircleShape)
                        .background(Bg3)
                        .border(2.dp, Bg1, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "+${agentCount - 3}",
                        color = Tx2,
                        fontSize = 7.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = SansFont
                    )
                }
            }

            Spacer(Modifier.width(8.dp))
            Text(
                "$agentCount Agents",
                color = Tx2,
                fontSize = 12.sp,
                fontFamily = SansFont
            )
            Spacer(Modifier.width(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                PulseDot(OkLight, dotSize = 6.dp)
                Spacer(Modifier.width(3.dp))
                Text(
                    "$onlineCount",
                    color = OkLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont
                )
            }
        }
        }

        Spacer(Modifier.width(14.dp))

        // CmdK trigger
        Box(
            modifier = Modifier
                .height(28.dp)
                .width(340.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Bg3.copy(alpha = 0.6f))
                .border(1.dp, Line, RoundedCornerShape(8.dp))
                .clickable(onClick = onCmdK)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = "Search",
                    tint = Tx3,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    "搜索命令、文件、Agent…",
                    color = Tx3,
                    fontSize = 12.sp,
                    fontFamily = SansFont
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "⌘K",
                    color = Tx3,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = SansFont
                )
            }
        }

        Spacer(Modifier.weight(1f))

        // Notification bell
        HoverTipBox("通知") {
            NotificationBell(
                count = unreadNotifications,
                onClick = onNotifications
            )
        }

        Spacer(Modifier.width(4.dp))

        // Settings gear
        val settingsInteraction = remember { MutableInteractionSource() }
        val settingsHovered by settingsInteraction.collectIsHoveredAsState()
        HoverTipBox("设置") {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (settingsHovered) Bg3.copy(alpha = 0.6f) else Color.Transparent)
                    .hoverable(settingsInteraction)
                    .clickable(onClick = onSettings),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = "Settings",
                    tint = if (settingsHovered) Tx2 else Tx3,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        Spacer(Modifier.width(4.dp))

        // User avatar
        HoverTipBox("Swarmer") {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(Ac, AgentQwen)))
                    .clickable(onClick = onUserAvatar),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "S",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont
                )
            }
        }
    }
}

@Composable
private fun NotificationBell(
    count: Int,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(if (isHovered) Bg3.copy(alpha = 0.6f) else Color.Transparent)
            .hoverable(interactionSource)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Filled.Notifications,
            contentDescription = "Notifications",
            tint = if (isHovered) Tx2 else Tx3,
            modifier = Modifier.size(18.dp)
        )
        if (count > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(Err),
            )
        }
    }
}
