package com.swarmeditor.desktop.ui.plugins

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

/** Sealed type for items displayed in the plugin grid. */
sealed interface PluginItem {
    data class Mcp(val server: McpServerDto) : PluginItem
    data class Skill(val skill: SkillDto) : PluginItem
}

/** Accent colors assigned to plugin tiles based on name hash. */
internal val TileAccents = listOf(Ac, Pr, Gn, Or, Gd, Color(0xFF66bbff), Color(0xFFff66aa))

internal fun accentFor(name: String): Color = TileAccents[name.hashCode().mod(TileAccents.size).let { if (it < 0) -it else it }]

@Composable
fun PluginTile(
    item: PluginItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = when (item) {
        is PluginItem.Mcp -> accentFor(item.server.name)
        is PluginItem.Skill -> accentFor(item.skill.name)
    }
    val name = when (item) {
        is PluginItem.Mcp -> item.server.name
        is PluginItem.Skill -> item.skill.name
    }
    val description = when (item) {
        is PluginItem.Mcp -> item.server.description
        is PluginItem.Skill -> item.skill.description
    }
    val tag = when (item) {
        is PluginItem.Mcp -> "MCP"
        is PluginItem.Skill -> "本地"
    }
    val downloads = when (item) {
        is PluginItem.Mcp -> item.server.downloads
        is PluginItem.Skill -> ""
    }
    val rating = when (item) {
        is PluginItem.Mcp -> item.server.rating
        is PluginItem.Skill -> 0.0
    }
    val toolsCount = when (item) {
        is PluginItem.Mcp -> item.server.tools.size
        is PluginItem.Skill -> 0
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Bg3)
            .border(1.dp, Bd, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
    ) {
        // Colored top bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .background(accent)
        )

        Column(modifier = Modifier.padding(14.dp)) {
            // Icon + Name + Tag row
            Row(verticalAlignment = Alignment.CenterVertically) {
                // 54px icon placeholder
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(accent.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = name.take(1).uppercase(),
                        color = accent,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = name,
                        color = Tx,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = Ellipsis
                    )
                    Spacer(Modifier.height(3.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        StatusChip(text = tag, color = accent)
                        if (item is PluginItem.Mcp && item.server.categories.isNotEmpty()) {
                            StatusChip(text = "MCP发现", color = Gd)
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Publisher + version (placeholder)
            Text(
                text = description,
                color = Tx2,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = Ellipsis,
                lineHeight = 16.sp
            )

            Spacer(Modifier.height(10.dp))

            // Bottom stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (downloads.isNotEmpty()) {
                    Text("⬇ $downloads", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
                    Spacer(Modifier.width(10.dp))
                }
                if (rating > 0) {
                    Text("★ ${"%.1f".format(rating)}", color = Gd, fontSize = 10.sp, fontFamily = MonoFont)
                    Spacer(Modifier.width(10.dp))
                }
                if (toolsCount > 0) {
                    Text("🔧 $toolsCount", color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
                    Spacer(Modifier.width(10.dp))
                }
                Spacer(Modifier.weight(1f))
                // Status chip — always show "active" for now
                StatusChip(text = "active", color = Gn)
            }
        }
    }
}

@Composable
fun StatusChip(
    text: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Medium,
        fontFamily = MonoFont,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    )
}
