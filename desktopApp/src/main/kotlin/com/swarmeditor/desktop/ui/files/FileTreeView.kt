package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec

/** Color for a file name based on its extension. */
private fun fileColor(name: String) = when {
    name.endsWith(".kt") -> Warn
    name.endsWith(".json") -> Warn
    name.endsWith(".md") -> Tx
    name.endsWith(".toml") || name.endsWith(".yaml") || name.endsWith(".yml") -> Ac
    name.endsWith(".xml") || name.endsWith(".html") -> AgentOpenCode
    else -> Tx2
}

internal data class VisibleFileNode(
    val node: FileNodeDto,
    val depth: Int,
)

internal fun treeStartPaddingDp(depth: Int): Int = depth.coerceIn(0, 10) * 14 + 8

internal fun flattenVisibleFileTree(
    tree: FileNodeDto,
    expanded: Map<String, Boolean>,
    filterChangesOnly: Boolean,
): List<VisibleFileNode> {
    val changedPaths = if (filterChangesOnly) {
        buildSet {
            fun collectChanged(node: FileNodeDto): Boolean {
                var hasChangedNode = node.changeStatus != null
                node.children.forEach { child ->
                    if (collectChanged(child)) hasChangedNode = true
                }
                if (hasChangedNode) add(node.path)
                return hasChangedNode
            }
            collectChanged(tree)
        }
    } else {
        emptySet()
    }

    return buildList {
        fun appendVisible(node: FileNodeDto, depth: Int) {
            if (filterChangesOnly && node.path !in changedPaths) return
            add(VisibleFileNode(node, depth))
            if (!node.isDirectory || expanded[node.path] != true) return
            node.children
                .sortedWith(compareBy({ !it.isDirectory }, { it.name }))
                .forEach { child -> appendVisible(child, depth + 1) }
        }
        appendVisible(tree, 0)
    }
}

/**
 * Collapsible file tree component.
 *
 * @param tree      root [FileNodeDto] (typically the project directory)
 * @param expanded  map of path → is-expanded state (directory expand/collapse)
 * @param selectedPath  currently selected file path (null = none selected)
 * @param onSelectFile  callback when a file (not directory) is clicked
 * @param onToggleDir  callback when a directory row is clicked
 * @param filterChangesOnly  if true, only show files with non-null changeStatus
 */
@Composable
fun FileTreeView(
    tree: FileNodeDto,
    expanded: Map<String, Boolean>,
    selectedPath: String?,
    onSelectFile: (FileNodeDto) -> Unit,
    onToggleDir: (String) -> Unit,
    filterChangesOnly: Boolean = false,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
) {
    val visibleNodes by remember(tree, expanded, filterChangesOnly) {
        derivedStateOf { flattenVisibleFileTree(tree, expanded, filterChangesOnly) }
    }

    LazyColumn(
        modifier = modifier,
        state = listState,
        contentPadding = PaddingValues(start = 6.dp, top = 6.dp, end = 14.dp, bottom = 8.dp),
    ) {
        items(visibleNodes, key = { it.node.path }) { visibleNode ->
            FileTreeRow(
                visibleNode = visibleNode,
                isExpanded = expanded[visibleNode.node.path] == true,
                isSelected = visibleNode.node.path == selectedPath,
                onSelectFile = onSelectFile,
                onToggleDir = onToggleDir,
                modifier = Modifier.animateItem(),
            )
        }
    }
}

@Composable
private fun FileTreeRow(
    visibleNode: VisibleFileNode,
    isExpanded: Boolean,
    isSelected: Boolean,
    onSelectFile: (FileNodeDto) -> Unit,
    onToggleDir: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val node = visibleNode.node
    val hasChildren = node.children.isNotEmpty()
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    val rowBackground by animateColorAsState(
        targetValue = when {
            isSelected -> Ac.withAlpha(0.10f)
            isHovered -> Bg3.copy(alpha = 0.55f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "fileTreeRowBackground",
    )
    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 90f else 0f,
        animationSpec = Motion.floatState,
        label = "fileTreeChevronRotation",
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .fluidClickable(
                enabled = !node.isDirectory || hasChildren,
                interactionSource = interactionSource,
            ) {
                if (node.isDirectory) onToggleDir(node.path) else onSelectFile(node)
            }
            .clip(AppShapes.xs)
            .background(rowBackground)
            .padding(
                start = treeStartPaddingDp(visibleNode.depth).dp,
                end = 8.dp,
                top = 3.dp,
                bottom = 3.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SemanticIconBadge(
            spec = semanticFileIconSpec(node.name, node.isDirectory),
            contentDescription = if (node.isDirectory) "目录" else "文件",
            size = 20.dp,
            showBadge = false,
        )
        Text(
            text = node.name,
            color = if (node.isDirectory) Tx else fileColor(node.name),
            fontSize = 12.sp,
            fontWeight = if (node.isDirectory) FontWeight.Medium else FontWeight.Normal,
            fontFamily = SansFont,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (node.isDirectory && hasChildren) {
            Icon(
                imageVector = Feather.ChevronRight,
                contentDescription = if (isExpanded) "收起目录" else "展开目录",
                tint = Tx3,
                modifier = Modifier.size(13.dp).rotate(chevronRotation),
            )
        } else {
            when (node.changeStatus) {
                "modified" -> FileChangeBadge("M", Warn)
                "new" -> FileChangeBadge("N", AgentGemini)
            }
        }
    }
}

@Composable
private fun FileChangeBadge(label: String, color: Color) {
    Text(
        text = label,
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(AppShapes.xs)
            .background(color.withAlpha(0.12f))
            .padding(horizontal = 4.dp, vertical = 1.dp),
    )
}
