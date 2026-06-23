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
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
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
internal val TileAccents = listOf(Ac, AgentClaude, Gn, Or, Gd, Color(0xFF66bbff), Color(0xFFff66aa))

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
        is PluginItem.Skill -> if ((item.skill.source) == "MCP") "MCP" else "本地"
    }
    val icon = when (item) {
        is PluginItem.Mcp -> item.server.icon
        is PluginItem.Skill -> ""
    }
    val version = when (item) {
        is PluginItem.Mcp -> item.server.version
        is PluginItem.Skill -> ""
    }
    val category = when (item) {
        is PluginItem.Mcp -> item.server.categories.firstOrNull()
        is PluginItem.Skill -> item.skill.tags.firstOrNull()
    }
    val downloads = when (item) {
        is PluginItem.Mcp -> item.server.downloads
        is PluginItem.Skill -> ""
    }
    val rating = when (item) {
        is PluginItem.Mcp -> item.server.rating
        is PluginItem.Skill -> 0.0
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .hoverLift(RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(Bg2.withAlpha(0.5f), Bg1.withAlpha(0.3f))))
            .drawBehind { drawRect(accent, topLeft = Offset.Zero, size = Size(size.width, 3.dp.toPx())) }
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(14.dp)
    ) {
        // 图标 + 名称 + 标签
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Bg0.copy(alpha = 0.6f))
                    .border(1.dp, Line, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (icon.isNotEmpty()) icon else name.take(1).uppercase(),
                    color = if (icon.isNotEmpty()) Color.Unspecified else accent,
                    fontSize = if (icon.isNotEmpty()) 24.sp else 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = name,
                        color = Tx,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = Ellipsis
                    )
                    if (version.isNotEmpty()) {
                        Spacer(Modifier.width(6.dp))
                        Text("v$version", color = Tx3, fontSize = 10.sp, fontFamily = CodeFont)
                    }
                }
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    StatusChip(text = tag, color = accent)
                    if (category != null) StatusChip(text = category, color = Gd)
                }
            }
        }

        if (description.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = description,
                color = Tx2,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = Ellipsis,
                lineHeight = 16.sp
            )
        }

        Spacer(Modifier.height(10.dp))
        // 底部统计 + 状态
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (downloads.isNotEmpty()) {
                Text("⬇ $downloads", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                Spacer(Modifier.width(10.dp))
            }
            if (rating > 0) {
                Text("★ ${"%.1f".format(rating)}", color = Gd, fontSize = 10.sp, fontFamily = SansFont)
                Spacer(Modifier.width(10.dp))
            }
            Spacer(Modifier.weight(1f))
            StatusChip(text = "运行中", color = Gn)
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
        fontFamily = SansFont,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.withAlpha(0.12f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    )
}
