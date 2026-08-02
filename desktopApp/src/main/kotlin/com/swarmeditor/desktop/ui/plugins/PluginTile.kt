package com.swarmeditor.desktop.ui.plugins

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticPluginIconSpec

/** Sealed type for items displayed in the plugin grid. */
sealed interface PluginItem {
    data class Mcp(val server: McpServerDto) : PluginItem
    data class Skill(val skill: SkillDto) : PluginItem
}

/** Accent colors assigned to plugin tiles based on name hash. */
internal val TileAccents = listOf(Ac, Ac2, AgentClaude, AgentQwen, AgentGemini, AgentKimi, AgentOpenCode, Warn)

internal fun accentFor(name: String): Color = TileAccents[name.hashCode().mod(TileAccents.size).let { if (it < 0) -it else it }]

@Composable
fun PluginTile(
    item: PluginItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
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
    val iconSpec = semanticPluginIconSpec(name, isSkill = item is PluginItem.Skill)
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
    val (statusLabel, statusColor) = when (item) {
        is PluginItem.Mcp -> mcpRuntimeLabel(item.server.runtimeStatus) to mcpRuntimeColor(item.server.runtimeStatus)
        is PluginItem.Skill -> {
            val enabled = item.skill.enabledAgents.isEmpty() || item.skill.enabledAgents.values.any { it }
            (if (enabled) "已启用" else "未启用") to (if (enabled) AgentGemini else Tx3)
        }
    }
    val surface by androidx.compose.animation.animateColorAsState(
        if (hovered) accent.withAlpha(0.065f) else Bg2,
        Motion.colorDefault,
        label = "pluginTileSurface",
    )
    val outline by androidx.compose.animation.animateColorAsState(
        if (hovered) accent.withAlpha(0.32f) else Line,
        Motion.colorDefault,
        label = "pluginTileOutline",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (hovered) 1.07f else 1f,
        animationSpec = Motion.floatState,
        label = "pluginTileIconScale",
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .clip(AppShapes.md)
            .background(surface)
            .drawBehind { drawRect(accent, topLeft = Offset.Zero, size = Size(size.width, 3.dp.toPx())) }
            .border(1.dp, outline, AppShapes.md)
            .padding(Spacing.md)
    ) {
        // 图标 + 名称 + 标签
        Row(verticalAlignment = Alignment.CenterVertically) {
            SemanticIconBadge(
                spec = iconSpec.copy(accent = accent),
                contentDescription = "$name 图标",
                size = 44.dp,
                modifier = Modifier.graphicsLayer {
                    scaleX = iconScale
                    scaleY = iconScale
                },
            )
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
                    if (category != null) StatusChip(text = category, color = Warn)
                }
            }
            Spacer(Modifier.width(Spacing.sm))
            StatusChip(text = statusLabel, color = statusColor)
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

        if (downloads.isNotEmpty() || rating > 0) {
            Spacer(Modifier.height(Spacing.sm))
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (downloads.isNotEmpty()) {
                Text("⬇ $downloads", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                Spacer(Modifier.width(10.dp))
            }
            if (rating > 0) {
                Text("★ ${"%.1f".format(rating)}", color = Warn, fontSize = 10.sp, fontFamily = SansFont)
                Spacer(Modifier.width(10.dp))
            }
            }
        }
    }
}

internal fun mcpRuntimeLabel(status: McpRuntimeStatus): String = when (status) {
    McpRuntimeStatus.DISABLED -> "已停用"
    McpRuntimeStatus.BRIDGED -> "已桥接"
    McpRuntimeStatus.CONFIGURED -> "已配置"
    McpRuntimeStatus.UNSUPPORTED -> "HTTP 暂不支持"
    McpRuntimeStatus.FAILED -> "加载失败"
}

internal fun mcpRuntimeColor(status: McpRuntimeStatus): Color = when (status) {
    McpRuntimeStatus.DISABLED -> Warn
    McpRuntimeStatus.BRIDGED -> AgentGemini
    McpRuntimeStatus.CONFIGURED -> AcLight
    McpRuntimeStatus.UNSUPPORTED -> Warn
    McpRuntimeStatus.FAILED -> Err
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
            .clip(AppShapes.xs)
            .background(color.withAlpha(0.12f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    )
}
