package com.swarmeditor.desktop.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.swarmeditor.desktop.ui.common.semanticAgentIconSpec
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.viewmodel.WorkspaceOption
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Activity
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.FileText
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.Grid
import com.woowla.compose.icon.collections.feather.feather.MessageSquare
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.Settings
import com.woowla.compose.icon.collections.feather.feather.Users
import com.woowla.compose.icon.collections.feather.feather.X
import org.jetbrains.compose.resources.painterResource

internal fun notificationDescription(count: Int): String =
    if (count > 0) "通知，$count 条未读" else "通知，无未读消息"

internal data class TopBarPresentation(
    val showBranch: Boolean,
    val showContext: Boolean,
    val showAgentLabel: Boolean,
    val searchLabel: String,
    val showShortcut: Boolean,
    val horizontalPadding: Int,
    val searchMinWidth: Int,
    val searchMaxWidth: Int,
    val projectMaxWidth: Int,
)

internal fun topBarPresentation(widthDp: Int): TopBarPresentation = when {
    widthDp < 900 -> TopBarPresentation(
        showBranch = false,
        showContext = false,
        showAgentLabel = false,
        searchLabel = "",
        showShortcut = false,
        horizontalPadding = 8,
        searchMinWidth = 40,
        searchMaxWidth = 72,
        projectMaxWidth = 120,
    )
    widthDp < 1180 -> TopBarPresentation(
        showBranch = true,
        showContext = true,
        showAgentLabel = false,
        searchLabel = "搜索命令…",
        showShortcut = false,
        horizontalPadding = 10,
        searchMinWidth = 140,
        searchMaxWidth = 260,
        projectMaxWidth = 170,
    )
    else -> TopBarPresentation(
        showBranch = true,
        showContext = true,
        showAgentLabel = true,
        searchLabel = "搜索命令、文件与能力…",
        showShortcut = true,
        horizontalPadding = 12,
        searchMinWidth = 220,
        searchMaxWidth = 460,
        projectMaxWidth = 210,
    )
}

@Composable
fun EnhancedTopBar(
    projectName: String = "swarm-editor",
    branchName: String = "main",
    workspaceOptions: List<WorkspaceOption> = emptyList(),
    activeWorkspaceId: String? = null,
    onWorkspaceSelected: (String) -> Unit = {},
    workspaceLabel: String = "会话",
    currentAgentName: String = "主智能体",
    currentAgentId: String = "pi-main",
    currentAgentColor: Color = Ac,
    currentAgentOnline: Boolean = false,
    onCmdK: () -> Unit = {},
    onSettings: () -> Unit = {},
    onAgent: () -> Unit = {},
    onProjectSwitcher: () -> Unit = {},
    onClose: () -> Unit = {},
    onMinimize: () -> Unit = {},
    onMaximizeToggle: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .background(Bg1)
            .border(1.dp, Line),
    ) {
        val presentation = topBarPresentation(maxWidth.value.toInt())
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(horizontal = presentation.horizontalPadding.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(Res.drawable.swarm_editor),
                contentDescription = "Swarm Editor",
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(7.dp))
            WorkspaceSelector(
                projectName = projectName,
                branchName = branchName,
                showBranch = presentation.showBranch,
                projectMaxWidth = presentation.projectMaxWidth,
                options = workspaceOptions,
                activeWorkspaceId = activeWorkspaceId,
                onWorkspaceSelected = onWorkspaceSelected,
                onFallbackClick = onProjectSwitcher,
            )

            if (presentation.showContext) {
                Spacer(Modifier.width(8.dp))
                Icon(Feather.ChevronRight, null, tint = Tx3, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(7.dp))
                WorkspaceBreadcrumb(workspaceLabel)
            }

            Spacer(Modifier.width(12.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                SearchLauncher(
                    label = presentation.searchLabel,
                    showShortcut = presentation.showShortcut,
                    minWidth = presentation.searchMinWidth,
                    maxWidth = presentation.searchMaxWidth,
                    onClick = onCmdK,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.width(10.dp))

            AgentRuntimeChip(
                name = currentAgentName,
                id = currentAgentId,
                color = currentAgentColor,
                online = currentAgentOnline,
                showLabel = presentation.showAgentLabel,
                onClick = onAgent,
            )
            Spacer(Modifier.width(4.dp))
            IdeActionButton(
                icon = Feather.Settings,
                contentDescription = "设置",
                onClick = onSettings,
            )
            Spacer(Modifier.width(8.dp))
            WindowControlButton("最小化", onMinimize) {
                Box(Modifier.width(10.dp).height(1.5.dp).background(Tx3))
            }
            Spacer(Modifier.width(2.dp))
            WindowControlButton("最大化或还原", onMaximizeToggle) {
                Box(Modifier.size(10.dp).border(1.5.dp, Tx3, RoundedCornerShape(1.dp)))
            }
            Spacer(Modifier.width(2.dp))
            WindowControlButton("关闭", onClose, hoverBackground = ControlRed.withAlpha(0.18f)) {
                Icon(Feather.X, null, tint = Tx3, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun WorkspaceSelector(
    projectName: String,
    branchName: String,
    showBranch: Boolean,
    projectMaxWidth: Int,
    options: List<WorkspaceOption>,
    activeWorkspaceId: String?,
    onWorkspaceSelected: (String) -> Unit,
    onFallbackClick: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        ProjectContextChip(
            projectName = projectName,
            branchName = branchName,
            showBranch = showBranch,
            projectMaxWidth = projectMaxWidth,
            onClick = {
                if (options.isEmpty()) onFallbackClick() else expanded = true
            },
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(Bg2).border(1.dp, Line2, AppShapes.xs),
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(
                                option.label,
                                color = if (option.id == activeWorkspaceId) Ac else Tx,
                                style = AppType.bodySm,
                                fontWeight = if (option.id == activeWorkspaceId) FontWeight.SemiBold else FontWeight.Normal,
                            )
                            Text(
                                option.cwd,
                                color = Tx3,
                                style = AppType.micro,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    },
                    leadingIcon = {
                        Icon(
                            if (option.branch.isNullOrBlank()) Feather.Folder else Feather.GitBranch,
                            contentDescription = null,
                            tint = if (option.id == activeWorkspaceId) Ac else Tx3,
                            modifier = Modifier.size(15.dp),
                        )
                    },
                    onClick = {
                        expanded = false
                        onWorkspaceSelected(option.id)
                    },
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 5.dp),
                )
            }
        }
    }
}

@Composable
private fun ProjectContextChip(
    projectName: String,
    branchName: String,
    showBranch: Boolean,
    projectMaxWidth: Int,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        if (hovered) Bg3.withAlpha(0.8f) else Color.Transparent,
        Motion.colorDefault,
        label = "projectContextBackground",
    )
    val border by animateColorAsState(
        if (hovered) Line2 else Color.Transparent,
        Motion.colorDefault,
        label = "projectContextBorder",
    )
    Row(
        modifier = Modifier
            .height(30.dp)
            .clip(AppShapes.sm)
            .background(background)
            .border(1.dp, border, AppShapes.sm)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Feather.Folder, "切换项目", tint = Tx2, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            projectName,
            color = Tx,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = projectMaxWidth.dp),
        )
        if (showBranch) {
            Spacer(Modifier.width(8.dp))
            Box(Modifier.width(1.dp).height(14.dp).background(Line2))
            Spacer(Modifier.width(7.dp))
            Icon(Feather.GitBranch, null, tint = Tx3, modifier = Modifier.size(12.dp))
            Spacer(Modifier.width(4.dp))
            Text(
                branchName,
                color = Tx2,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 72.dp),
            )
        }
    }
}

@Composable
private fun WorkspaceBreadcrumb(label: String) {
    val icon = workspaceIcon(label)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Tx3, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, color = Tx2, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

private fun workspaceIcon(label: String): ImageVector = when (label) {
    "智能体" -> Feather.Users
    "插件" -> Feather.Grid
    "文件" -> Feather.FileText
    "活动" -> Feather.Activity
    else -> Feather.MessageSquare
}

@Composable
private fun SearchLauncher(
    label: String,
    showShortcut: Boolean,
    minWidth: Int,
    maxWidth: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        if (hovered) Bg3.withAlpha(0.86f) else Bg0.withAlpha(0.78f),
        Motion.colorDefault,
        label = "topBarSearchBackground",
    )
    val border by animateColorAsState(
        if (hovered) Line2 else Line,
        Motion.colorDefault,
        label = "topBarSearchBorder",
    )
    Row(
        modifier = modifier
            .widthIn(min = minWidth.dp, max = maxWidth.dp)
            .height(30.dp)
            .clip(AppShapes.sm)
            .background(background)
            .border(1.dp, border, AppShapes.sm)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Feather.Search, "搜索", tint = Tx3, modifier = Modifier.size(14.dp))
        if (label.isNotEmpty()) {
            Spacer(Modifier.width(7.dp))
            Text(
                label,
                color = Tx3,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (showShortcut) {
            Text(
                "Ctrl K",
                color = Tx3,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(AppShapes.xs)
                    .background(Bg0.copy(alpha = 0.58f))
                    .border(1.dp, Line, AppShapes.xs)
                    .padding(horizontal = 5.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun AgentRuntimeChip(
    name: String,
    id: String,
    color: Color,
    online: Boolean,
    showLabel: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        if (hovered) Bg3.withAlpha(0.8f) else Color.Transparent,
        Motion.colorDefault,
        label = "agentRuntimeBackground",
    )
    Row(
        modifier = Modifier
            .height(30.dp)
            .clip(AppShapes.sm)
            .background(background)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = if (showLabel) 7.dp else 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            val spec = semanticAgentIconSpec(name, id)
            Icon(spec.imageVector, "$name 配置", tint = color, modifier = Modifier.size(16.dp))
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (online) ControlGreen else Tx3)
                    .border(1.dp, Bg1, CircleShape),
            )
        }
        if (showLabel) {
            Spacer(Modifier.width(7.dp))
            Text(
                name.ifBlank { "主智能体" },
                color = Tx2,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 110.dp),
            )
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
        if (hovered) hoverBackground else Color.Transparent,
        Motion.colorDefault,
        label = "windowControlBackground",
    )
    val scale by animateFloatAsState(
        if (pressed) 0.975f else 1f,
        if (pressed) Motion.floatPress else Motion.floatRelease,
        label = "windowControlScale",
    )
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(4.dp))
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
