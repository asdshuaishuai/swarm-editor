package com.swarmeditor.desktop.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

private data class RailItem(
    val key: String,
    val icon: String,
    val label: String,
    val badge: Int = 0
)

@Composable
fun RailNavigation(
    currentView: String,
    onSwitchView: (String) -> Unit,
    onOpenTerminal: () -> Unit = {},
    onOpenGit: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val items = listOf(
        RailItem("chat", "💬", "Chat", badge = 6),
        RailItem("agents", "🤖", "Agents"),
        RailItem("plugins", "🧩", "Plugins"),
        RailItem("files", "📁", "Files"),
        RailItem("activity", "📊", "Activity")
    )

    Column(
        modifier = modifier
            .width(52.dp)
            .fillMaxHeight()
            .background(Color.Black.copy(alpha = 0.3f))
            .border(1.dp, Bd),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(14.dp))

        // Logo icon at top
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    brush = androidx.compose.ui.graphics.Brush.linearGradient(
                        listOf(Ac, Pr)
                    )
                )
                .shadow(
                    elevation = 4.dp,
                    shape = RoundedCornerShape(8.dp),
                    ambientColor = Ac.copy(alpha = 0.3f),
                    spotColor = Ac.copy(alpha = 0.3f)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "S",
                color = Bg,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = FontFamily.Monospace
            )
        }

        Spacer(Modifier.height(10.dp))

        // Separator
        Box(
            modifier = Modifier
                .width(22.dp)
                .height(1.dp)
                .background(Bd)
        )

        Spacer(Modifier.height(8.dp))

        // Navigation items
        items.forEach { item ->
            val isActive = currentView == item.key
            RailNavItem(
                item = item,
                isActive = isActive,
                onClick = { onSwitchView(item.key) }
            )
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.weight(1f))

        // Bottom section: Git + Terminal buttons
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .border(1.dp, Bd, RoundedCornerShape(10.dp))
                .clickable(onClick = onOpenGit),
            contentAlignment = Alignment.Center
        ) {
            Text("🔀", fontSize = 15.sp)
        }

        Spacer(Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .border(1.dp, Bd, RoundedCornerShape(10.dp))
                .clickable(onClick = onOpenTerminal),
            contentAlignment = Alignment.Center
        ) {
            Text("⌨", fontSize = 15.sp)
        }

        Spacer(Modifier.height(14.dp))
    }
}

@Composable
private fun RailNavItem(
    item: RailItem,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val bgColor = if (isActive) Pr.copy(alpha = 0.12f) else Color.Transparent
    val iconColor = if (isActive) Pr else Tx2
    val glowColor = if (isActive) Pr.copy(alpha = 0.3f) else Color.Transparent

    Box(
        modifier = Modifier
            .width(44.dp)
            .height(42.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .then(
                if (isActive) Modifier.shadow(
                    elevation = 6.dp,
                    shape = RoundedCornerShape(10.dp),
                    ambientColor = glowColor,
                    spotColor = glowColor
                ) else Modifier
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        // Active left bar indicator
        if (isActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = (-2).dp)
                    .width(2.dp)
                    .height(20.dp)
                    .background(Pr, RoundedCornerShape(1.dp))
            )
        }

        // Icon
        Text(
            item.icon,
            fontSize = 18.sp,
            color = iconColor
        )

        // Badge
        if (item.badge > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(Rd),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (item.badge > 9) "9+" else item.badge.toString(),
                    color = Color.White,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}
