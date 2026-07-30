package com.swarmeditor.desktop.ui.plugins

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.fluidClickable
import com.swarmeditor.desktop.theme.withAlpha

@Composable
internal fun PluginDetailBackButton(
    accent: Color,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        if (hovered) accent.withAlpha(0.12f) else Color.Transparent,
        Motion.colorDefault,
        label = "pluginBackBackground",
    )
    Text(
        text = "← 返回",
        color = accent,
        style = AppType.bodySm,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(AppShapes.xs)
            .background(background)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 5.dp),
    )
}

@Composable
internal fun PluginDetailTabBar(
    tabs: List<String>,
    selectedIndex: Int,
    accent: Color,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Bg1.copy(alpha = 0.52f))
            .border(1.dp, Line)
            .padding(horizontal = 20.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        tabs.forEachIndexed { index, label ->
            val selected = index == selectedIndex
            val interaction = remember { MutableInteractionSource() }
            val hovered by interaction.collectIsHoveredAsState()
            val background by animateColorAsState(
                when {
                    selected -> accent.withAlpha(0.16f)
                    hovered -> accent.withAlpha(0.08f)
                    else -> Color.Transparent
                },
                Motion.colorDefault,
                label = "pluginTabBackground",
            )
            val foreground by animateColorAsState(
                if (selected || hovered) accent else Tx3,
                Motion.colorDefault,
                label = "pluginTabForeground",
            )
            Box(
                modifier = Modifier
                    .height(30.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(background)
                    .border(
                        width = 1.dp,
                        color = if (selected) accent.withAlpha(0.24f) else Color.Transparent,
                        shape = RoundedCornerShape(8.dp),
                    )
                    .fluidClickable(interactionSource = interaction) { onSelect(index) }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = foreground,
                    style = AppType.bodySm,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}
