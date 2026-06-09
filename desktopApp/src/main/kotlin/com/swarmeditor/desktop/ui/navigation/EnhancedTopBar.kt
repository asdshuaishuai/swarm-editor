package com.swarmeditor.desktop.ui.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

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
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(Bg2.copy(alpha = 0.85f))
            .border(1.dp, Bd)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Logo: conic-gradient ring + "Swarm Editor" + MVP badge
        ConicGradientLogo(size = 24.dp, strokeWidth = 2.5f)
        Spacer(Modifier.width(8.dp))
        Text(
            "Swarm Editor",
            color = Tx,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = (-0.3).sp
        )
        Spacer(Modifier.width(6.dp))
        // MVP badge
        Box(
            modifier = Modifier
                .height(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Ac.copy(alpha = 0.12f))
                .padding(horizontal = 5.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "MVP",
                color = Ac,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        Spacer(Modifier.width(16.dp))

        // Separator
        Box(Modifier.width(1.dp).height(20.dp).background(Bd))

        Spacer(Modifier.width(12.dp))

        // Project switcher: "swarm-editor · main"
        Box(
            modifier = Modifier
                .height(26.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Bg3)
                .border(1.dp, Bd, RoundedCornerShape(6.dp))
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    projectName,
                    color = Tx2,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    " · ",
                    color = Tx4,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    branchName,
                    color = Gn,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(Modifier.width(16.dp))

        // Separator
        Box(Modifier.width(1.dp).height(20.dp).background(Bd))

        Spacer(Modifier.width(12.dp))

        // Swarm status: agent avatars + "5 Agents" + online count
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Agent avatar stack (first letter + gradient bg)
            val avatarColors = listOf(
                listOf(Ac, Color(0xFF0088ff)),
                listOf(Pr, Color(0xFF6633cc)),
                listOf(Gn, Color(0xFF009955)),
                listOf(Or, Color(0xFFcc5500)),
                listOf(Gd, Color(0xFFcc9900))
            )
            val avatarLetters = listOf("C", "G", "K", "Q", "O")

            avatarLetters.take(minOf(3, agentCount)).forEachIndexed { i, letter ->
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .offset(x = ((-i) * 6).dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(avatarColors[i])
                        )
                        .border(1.5.dp, Bg2, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        letter,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
            // Overflow indicator if more than 3 agents
            if (agentCount > 3) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .offset(x = (-18).dp)
                        .clip(CircleShape)
                        .background(Bg4)
                        .border(1.5.dp, Bg2, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "+${agentCount - 3}",
                        color = Tx2,
                        fontSize = 7.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(Modifier.width(8.dp))

            Text(
                "$agentCount Agents",
                color = Tx2,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )

            Spacer(Modifier.width(6.dp))

            // Online count dot + number
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Gn)
                )
                Spacer(Modifier.width(3.dp))
                Text(
                    "$onlineCount",
                    color = Gn,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(Modifier.weight(1f))

        // CmdK trigger: search box style
        Box(
            modifier = Modifier
                .height(28.dp)
                .width(180.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Bg3)
                .border(1.dp, Bd, RoundedCornerShape(6.dp))
                .clickable(onClick = onCmdK)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Search",
                    color = Tx3,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "⌘K",
                    color = Tx4,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Notification bell
        NotificationBell(
            count = unreadNotifications,
            onClick = onNotifications
        )

        Spacer(Modifier.width(4.dp))

        // Settings gear
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onSettings),
            contentAlignment = Alignment.Center
        ) {
            Text("⚙️", color = Tx3, fontSize = 15.sp)
        }

        Spacer(Modifier.width(4.dp))

        // User avatar "S"
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Ac, Pr)))
                .clickable(onClick = onUserAvatar),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "S",
                color = Bg,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun ConicGradientLogo(
    size: androidx.compose.ui.unit.Dp,
    strokeWidth: Float
) {
    val sizePx = size.value
    Canvas(modifier = Modifier.size(size)) {
        val center = Offset(sizePx / 2, sizePx / 2)
        val radius = (sizePx / 2) - strokeWidth
        val colors = listOf(
            Color(0xFFaa66ff), // purple
            Color(0xFF0088ff), // blue
            Color(0xFF00ff88), // green
            Color(0xFFffcc00), // yellow
            Color(0xFFff8800), // orange
            Color(0xFFaa66ff)  // back to purple
        )

        val sweepAngle = 360f / (colors.size - 1)
        for (i in 0 until colors.size - 1) {
            val startAngle = i * sweepAngle - 90f
            drawArc(
                color = colors[i],
                startAngle = startAngle,
                sweepAngle = sweepAngle + 2f, // slight overlap to avoid gaps
                useCenter = false,
                topLeft = Offset(center.x - radius, center.y - radius),
                size = Size(radius * 2, radius * 2),
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )
        }
    }
}

@Composable
private fun NotificationBell(
    count: Int,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text("🔔", color = Tx3, fontSize = 15.sp)
        if (count > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(Rd),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (count > 9) "9+" else count.toString(),
                    color = Color.White,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}
