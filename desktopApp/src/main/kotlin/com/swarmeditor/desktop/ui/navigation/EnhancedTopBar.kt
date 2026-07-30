package com.swarmeditor.desktop.ui.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import com.woowla.compose.icon.collections.feather.feather.Bell
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.resources.Res
import com.swarmeditor.desktop.resources.swarm_editor
import com.swarmeditor.desktop.theme.*
import kotlin.math.min
import org.jetbrains.compose.resources.painterResource

internal fun notificationDescription(count: Int): String =
    if (count > 0) "通知，$count 条未读" else "通知，无未读消息"

@androidx.compose.runtime.Immutable
data class TopBarAgentAvatar(val letter: String, val color: Color)

internal data class TopBarPresentation(
    val showBrand: Boolean,
    val searchLabel: String,
    val showShortcut: Boolean,
    val horizontalPadding: Int,
    val searchMinWidth: Int,
    val searchMaxWidth: Int,
)

internal fun topBarPresentation(widthDp: Int): TopBarPresentation = when {
    widthDp < 900 -> TopBarPresentation(false, "搜索", false, 12, 72, 108)
    widthDp < 1120 -> TopBarPresentation(true, "搜索命令…", false, 14, 112, 220)
    else -> TopBarPresentation(true, "搜索命令、文件与能力…", true, 16, 160, 340)
}

@Composable
fun EnhancedTopBar(
    projectName: String = "swarm-editor",
    branchName: String = "main",
    agentCount: Int = 5,
    onlineCount: Int = 2,
    agentAvatars: List<TopBarAgentAvatar> = emptyList(),
    currentAgentLetter: String = "?",
    currentAgentColor: Color = Ac,
    unreadNotifications: Int = 3,
    onCmdK: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onSettings: () -> Unit = {},
    onUserAvatar: () -> Unit = {},
    onProjectSwitcher: () -> Unit = {},
    onSwarmStatus: () -> Unit = {},
    onClose: () -> Unit = {},
    onMinimize: () -> Unit = {},
    onMaximizeToggle: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(Bg1.copy(alpha = 0.92f))
            .border(1.dp, Line),
    ) {
        val presentation = topBarPresentation(maxWidth.value.toInt())
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = presentation.horizontalPadding.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
        Image(
            painter = painterResource(Res.drawable.swarm_editor),
            contentDescription = "Swarm Editor",
            modifier = Modifier.size(26.dp),
        )
        if (presentation.showBrand) {
            Spacer(Modifier.width(8.dp))
            Text(
                "Swarm Editor",
                color = Tx,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont,
                letterSpacing = 0.2.sp,
            )
            Spacer(Modifier.width(12.dp))
            Box(Modifier.width(1.dp).height(18.dp).background(Line))
            Spacer(Modifier.width(10.dp))
        } else {
            Spacer(Modifier.width(8.dp))
        }

        // Project switcher
        Box(
            modifier = Modifier
                .height(30.dp)
                .clip(RoundedCornerShape(R6))
                .background(ControlBlue.withAlpha(0.09f))
                .border(1.dp, ControlBlue.withAlpha(0.24f), RoundedCornerShape(R6))
                .fluidClickable(onClick = onProjectSwitcher)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    projectName,
                    color = ControlBlue,
                    fontSize = 12.sp,
                    fontFamily = SansFont,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.widthIn(max = if (presentation.showBrand) 150.dp else 104.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    " · ",
                    color = Tx3,
                    fontSize = 12.sp,
                    fontFamily = SansFont
                )
                Text(
                    branchName,
                    color = ControlGreen,
                    fontSize = 12.sp,
                    fontFamily = SansFont,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.widthIn(max = 72.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Spacer(Modifier.width(if (presentation.showBrand) 14.dp else 8.dp))
        Box(Modifier.width(1.dp).height(18.dp).background(Line))
        Spacer(Modifier.width(10.dp))

        HoverTipBox("查看 Swarm 状态") {
        // Swarm status: agent avatars（点击 → Agent 编排台）
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(ControlGreen.withAlpha(0.07f))
                .fluidClickable(onClick = onSwarmStatus)
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            agentAvatars.take(3).forEachIndexed { i, avatar ->
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .offset(x = if (i > 0) ((-6).dp) else 0.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(listOf(avatar.color, avatar.color.withAlpha(0.65f)))
                        )
                        .border(2.dp, Bg1, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        avatar.letter,
                        color = OnAccent,
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
                if (agentCount == 1) "主智能体" else "$agentCount 个智能体",
                color = ControlGreen,
                fontSize = 12.sp,
                fontFamily = SansFont
            )
            Spacer(Modifier.width(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                PulseDot(ControlGreen, dotSize = 6.dp)
                Spacer(Modifier.width(3.dp))
                Text(
                    "$onlineCount",
                    color = ControlGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = SansFont
                )
            }
        }
        }

        Spacer(Modifier.width(if (presentation.showBrand) 14.dp else 8.dp))

        // CmdK trigger
        Box(
            modifier = Modifier
                .height(28.dp)
                .widthIn(
                    min = presentation.searchMinWidth.dp,
                    max = presentation.searchMaxWidth.dp,
                )
                .weight(1f, fill = true)
                .background(ControlPurple.withAlpha(0.07f))
                .border(1.dp, ControlPurple.withAlpha(0.22f), RoundedCornerShape(8.dp))
                .fluidClickable(onClick = onCmdK)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Feather.Search,
                    contentDescription = "Search",
                    tint = ControlPurple,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    presentation.searchLabel,
                    color = Tx3,
                    fontSize = 12.sp,
                    fontFamily = SansFont,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (presentation.showShortcut) {
                    Spacer(Modifier.weight(1f))
                    Text(
                        "Ctrl K",
                        color = Tx3,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = SansFont,
                    )
                }
            }
        }

        Spacer(Modifier.weight(1f))

        // Notification bell（去掉 tooltip，避免闪烁）
        NotificationBell(
            count = unreadNotifications,
            onClick = onNotifications
        )

        Spacer(Modifier.width(4.dp))

        // Settings gear
        val settingsInteraction = remember { MutableInteractionSource() }
        val settingsHovered by settingsInteraction.collectIsHoveredAsState()
        val settingsBackground by animateColorAsState(
            if (settingsHovered) ControlOrange.withAlpha(0.14f) else Color.Transparent,
            Motion.colorDefault,
            label = "settingsBackground",
        )
        val settingsTint by animateColorAsState(
            if (settingsHovered) ControlOrange else Tx3,
            Motion.colorDefault,
            label = "settingsTint",
        )
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(settingsBackground)
                .fluidClickable(interactionSource = settingsInteraction, onClick = onSettings),
            contentAlignment = Alignment.Center
        ) {
            Icon(imageVector = Feather.Settings, contentDescription = "Settings", tint = settingsTint, modifier = Modifier.size(18.dp))
        }

        Spacer(Modifier.width(4.dp))

        // User avatar
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(currentAgentColor, currentAgentColor.withAlpha(0.65f))))
                .fluidClickable(onClick = onUserAvatar),
            contentAlignment = Alignment.Center
        ) {
            Text(
                currentAgentLetter,
                color = OnAccent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = SansFont
            )
        }

        // 最小化按钮
        WindowControlButton(
            contentDescription = "最小化",
            onClick = onMinimize,
        ) {
            Box(Modifier.width(10.dp).height(1.5.dp).background(Tx3))
        }
        // 最大化按钮
        WindowControlButton(
            contentDescription = "最大化或还原",
            onClick = onMaximizeToggle,
        ) {
            Box(Modifier.size(10.dp).border(1.5.dp, Tx3, RoundedCornerShape(1.dp)))
        }
        // 关闭按钮
        WindowControlButton(
            contentDescription = "关闭",
            hoverBackground = ControlRed.withAlpha(0.18f),
            onClick = onClose,
        ) {
            Icon(imageVector = Feather.X, contentDescription = null, tint = Tx3, modifier = Modifier.size(16.dp))
        }
    }
    }
}

@Composable
private fun WindowControlButton(
    contentDescription: String,
    onClick: () -> Unit,
    hoverBackground: Color = Bg3.copy(alpha = 0.8f),
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val background by animateColorAsState(
        targetValue = if (hovered) hoverBackground else Color.Transparent,
        animationSpec = Motion.colorDefault,
        label = "windowControlBackground",
    )
    val scale by androidx.compose.animation.core.animateFloatAsState(
        targetValue = when {
            pressed -> 0.94f
            else -> 1f
        },
        animationSpec = if (pressed) Motion.floatPress else Motion.floatRelease,
        label = "windowControlScale",
    )

    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(background)
            .semantics {
                role = Role.Button
                this.contentDescription = contentDescription
            }
            .hoverable(interaction)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clickable(interactionSource = interaction, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun NotificationBell(
    count: Int,
    onClick: () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val bg by animateColorAsState(
        if (hovered) ControlBlue.withAlpha(0.13f) else Color.Transparent,
        Motion.colorDefault, label = "bellBg"
    )
    val tint by animateColorAsState(
        if (hovered) ControlBlue else Tx3,
        Motion.colorDefault, label = "bellTint"
    )
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(AppShapes.sm)
            .background(bg)
            .semantics {
                role = Role.Button
                contentDescription = notificationDescription(count)
            }
            .fluidClickable(interactionSource = interaction, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Feather.Bell,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp)
        )
        if (count > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(ControlRed),
            )
        }
    }
}
