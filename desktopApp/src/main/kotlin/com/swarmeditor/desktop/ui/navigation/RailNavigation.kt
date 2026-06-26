package com.swarmeditor.desktop.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Activity
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.Grid
import com.woowla.compose.icon.collections.feather.feather.MessageSquare
import com.woowla.compose.icon.collections.feather.feather.Terminal
import com.woowla.compose.icon.collections.feather.feather.Users
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import com.swarmeditor.desktop.theme.*

private data class RailItem(
    val key: String,
    val icon: ImageVector,
    val label: String,
    val tip: String,
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
        RailItem("chat", Feather.MessageSquare, "Chat", "会话"),
        RailItem("agents", Feather.Users, "Agents", "Agent 编排"),
        RailItem("plugins", Feather.Grid, "Plugins", "插件"),
        RailItem("files", Feather.Folder, "Files", "文件"),
        RailItem("activity", Feather.Activity, "Activity", "活动日志")
    )

    Column(
        modifier = modifier
            .width(52.dp)
            .fillMaxHeight()
            .background(Bg0)
            .border(1.dp, Line)
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Navigation items
        items.forEach { item ->
            val isActive = currentView == item.key
            RailNavItem(
                item = item,
                isActive = isActive,
                onClick = { onSwitchView(item.key) }
            )
            Spacer(Modifier.height(2.dp))
        }

        Spacer(Modifier.weight(1f))

        // Divider before bottom buttons
        Box(
            modifier = Modifier
                .width(20.dp)
                .height(1.dp)
                .background(Line)
                .padding(vertical = 6.dp)
        )

        // Git button
        RailButton(
            icon = Feather.GitBranch,
            label = "Git",
            isActive = false,
            onClick = onOpenGit
        )

        Spacer(Modifier.height(2.dp))

        // Terminal button
        RailButton(
            icon = Feather.Terminal,
            label = "Terminal",
            isActive = false,
            onClick = onOpenTerminal
        )
    }
}

@Composable
private fun RailNavItem(
    item: RailItem,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    var showTip by remember { mutableStateOf(false) }
    LaunchedEffect(isHovered) {
        if (isHovered) { kotlinx.coroutines.delay(300); showTip = true } else { showTip = false }
    }
    val bgColor = when {
        isActive -> Ac.withAlpha(0.1f)
        isHovered -> Bg3.copy(alpha = 0.6f)
        else -> Color.Transparent
    }
    val animatedBg by androidx.compose.animation.animateColorAsState(
        targetValue = bgColor,
        animationSpec = Motion.colorDefault,
        label = "railBg"
    )
    val targetIconColor = if (isActive) Ac else if (isHovered) Tx2 else Tx3
    val animatedIconColor by androidx.compose.animation.animateColorAsState(
        targetValue = targetIconColor,
        animationSpec = Motion.colorDefault,
        label = "railIcon"
    )

    // Scale animation on hover (spring to 1.1f)
    val animatedScale by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (isHovered) 1.1f else 1f,
        animationSpec = Motion.floatDefault,
        label = "railIconScale"
    )

    Box(
        modifier = Modifier
            .width(38.dp)
            .height(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(animatedBg)
            .hoverable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        // Active left indicator bar
        if (isActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = (-7).dp)
                    .width(2.dp)
                    .height(20.dp)
                    .clip(RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp))
                    .background(Ac)
                    .shadow(
                        elevation = 4.dp,
                        shape = RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp),
                        ambientColor = Ac,
                        spotColor = Ac
                    )
            )
        }

        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = animatedIconColor,
            modifier = Modifier
                .size(17.dp)
                .graphicsLayer { scaleX = animatedScale; scaleY = animatedScale }
        )

        // Badge
        if (item.badge > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(Ac2),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (item.badge > 9) "9+" else item.badge.toString(),
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont
                )
            }
        }

        // 悬停 tooltip（对齐核心稿 data-tip，显示在按钮右侧）
        if (showTip) {
            Popup(alignment = Alignment.CenterEnd, offset = IntOffset(60, 0)) {
                RailTip(item.tip)
            }
        }
    }
}

@Composable
private fun RailTip(text: String) {
    Text(
        text, color = Tx, fontSize = 11.sp, fontFamily = SansFont,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Color(0xFF0a0c14))
            .border(1.dp, Line2, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    )
}

@Composable
private fun RailButton(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    var showTip by remember { mutableStateOf(false) }
    LaunchedEffect(isHovered) {
        if (isHovered) { kotlinx.coroutines.delay(300); showTip = true } else { showTip = false }
    }
    val bgColor = when {
        isActive -> Ac.withAlpha(0.1f)
        isHovered -> Bg3.copy(alpha = 0.6f)
        else -> Color.Transparent
    }
    val animatedBg by androidx.compose.animation.animateColorAsState(
        targetValue = bgColor,
        animationSpec = Motion.colorDefault,
        label = "railBtnBg"
    )
    val targetIconColor = if (isActive) Ac else if (isHovered) Tx2 else Tx3
    val animatedIconColor by androidx.compose.animation.animateColorAsState(
        targetValue = targetIconColor,
        animationSpec = Motion.colorDefault,
        label = "railBtnIcon"
    )

    Box(
        modifier = Modifier
            .width(38.dp)
            .height(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(animatedBg)
            .hoverable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = animatedIconColor,
            modifier = Modifier.size(17.dp)
        )

        if (showTip) {
            Popup(alignment = Alignment.CenterEnd, offset = IntOffset(60, 0)) {
                RailTip(label)
            }
        }
    }
}
