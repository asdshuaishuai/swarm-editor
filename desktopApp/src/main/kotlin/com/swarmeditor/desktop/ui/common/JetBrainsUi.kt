package com.swarmeditor.desktop.ui.common

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.fluidClickable
import com.swarmeditor.desktop.theme.withAlpha
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.ChevronRight

object IdeUiMetrics {
    val toolWindowHeaderHeight = 34.dp
    val tabHeight = 32.dp
    val toolbarHeight = 30.dp
    val rowHeight = 28.dp
    val iconButtonSize = 26.dp
    val selectionShape = RoundedCornerShape(4.dp)
    val controlShape = RoundedCornerShape(5.dp)
}

data class IdeToolWindowTab(
    val id: String,
    val label: String,
    val count: Int = 0,
)

@Composable
fun IdeToolWindowHeader(
    title: String,
    modifier: Modifier = Modifier,
    detail: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IdeUiMetrics.toolWindowHeaderHeight)
            .background(Bg2)
            .border(width = 1.dp, color = Line)
            .padding(start = 10.dp, end = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
        if (!detail.isNullOrBlank()) {
            Spacer(Modifier.width(7.dp))
            Text(
                detail,
                color = Tx3,
                style = AppType.caption,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.weight(1f))
        actions()
    }
}

@Composable
fun IdeToolWindowTabs(
    tabs: List<IdeToolWindowTab>,
    selectedId: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().height(IdeUiMetrics.tabHeight).background(Bg0).border(1.dp, Line),
        verticalAlignment = Alignment.Bottom,
    ) {
        tabs.forEach { tab ->
            val selected = tab.id == selectedId
            val interaction = remember(tab.id) { MutableInteractionSource() }
            val hovered by interaction.collectIsHoveredAsState()
            val background by animateColorAsState(
                targetValue = when {
                    selected -> Bg2
                    hovered -> Bg3.withAlpha(0.58f)
                    else -> Color.Transparent
                },
                animationSpec = Motion.colorDefault,
                label = "ideTabBackground",
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(IdeUiMetrics.tabHeight)
                    .fluidClickable(interactionSource = interaction) { onSelected(tab.id) }
                    .background(background)
                    .semantics {
                        this.selected = selected
                        contentDescription = if (tab.count > 0) "${tab.label}，${tab.count} 项" else tab.label
                    },
            ) {
                Row(
                    modifier = Modifier.align(Alignment.Center).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        tab.label,
                        color = if (selected) Tx else Tx3,
                        style = AppType.caption,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                    compactBadgeLabel(tab.count)?.let { label ->
                        Spacer(Modifier.width(5.dp))
                        Text(label, color = if (selected) Tx2 else Tx3, style = AppType.micro)
                    }
                }
                if (selected) {
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(2.dp).background(Ac))
                }
            }
        }
    }
}

@Composable
fun IdeActionButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    enabled: Boolean = true,
    tint: Color = Tx2,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val background by animateColorAsState(
        targetValue = when {
            selected -> Ac.withAlpha(0.2f)
            pressed -> Bg3
            hovered -> Bg3.withAlpha(0.8f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "ideActionBackground",
    )
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = if (pressed) Motion.floatPress else Motion.floatRelease,
        label = "ideActionScale",
    )
    Box(
        modifier = modifier
            .size(IdeUiMetrics.iconButtonSize)
            .clip(IdeUiMetrics.controlShape)
            .background(background)
            .semantics {
                role = Role.Button
                this.contentDescription = contentDescription
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .fluidClickable(enabled = enabled, interactionSource = interaction, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = if (enabled) tint else Tx3.withAlpha(0.55f), modifier = Modifier.size(15.dp))
    }
}

@Composable
fun IdeSectionHeader(
    title: String,
    count: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IdeUiMetrics.rowHeight)
            .fluidClickable(interactionSource = interaction, onClick = onToggle)
            .background(if (hovered) Bg3.withAlpha(0.46f) else Bg2)
            .padding(horizontal = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (expanded) Feather.ChevronDown else Feather.ChevronRight,
            null,
            tint = Tx3,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(3.dp))
        Text(title, color = Tx2, style = AppType.caption, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(5.dp))
        Text(count.toString(), color = Tx3, style = AppType.micro)
        Spacer(Modifier.weight(1f))
        actions()
    }
}

@Composable
fun IdeListRow(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    rowHeight: Dp = IdeUiMetrics.rowHeight,
    leading: @Composable RowScope.() -> Unit = {},
    content: @Composable RowScope.() -> Unit,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = when {
            selected -> Ac.withAlpha(0.2f)
            hovered -> Bg3.withAlpha(0.58f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "ideListRowBackground",
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(rowHeight)
            .padding(horizontal = 3.dp, vertical = 1.dp)
            .clip(IdeUiMetrics.selectionShape)
            .background(background)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 6.dp)
            .semantics { this.selected = selected },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        content()
        trailing()
    }
}

internal fun compactBadgeLabel(count: Int): String? = when {
    count <= 0 -> null
    count > 99 -> "99+"
    else -> count.toString()
}
