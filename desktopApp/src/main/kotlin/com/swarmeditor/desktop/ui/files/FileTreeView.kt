package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.theme.*

/** Color for a file name based on its extension. */
private fun fileColor(name: String) = when {
    name.endsWith(".kt") -> Warn
    name.endsWith(".json") -> Warn
    name.endsWith(".md") -> Tx
    name.endsWith(".toml") || name.endsWith(".yaml") || name.endsWith(".yml") -> Ac
    name.endsWith(".xml") || name.endsWith(".html") -> AgentOpenCode
    else -> Tx2
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
 * @param depth     indentation depth for recursive rendering
 */
@Composable
fun FileTreeView(
    tree: FileNodeDto,
    expanded: Map<String, Boolean>,
    selectedPath: String?,
    onSelectFile: (FileNodeDto) -> Unit,
    onToggleDir: (String) -> Unit,
    filterChangesOnly: Boolean = false,
    depth: Int = 0
) {
    // If filtering changes-only, skip nodes that have no changes in their subtree
    if (filterChangesOnly && !hasChanges(tree)) return

    val horizontalPadding = (depth * 16 + 8).dp

    if (tree.isDirectory) {
        val isExpanded = expanded[tree.path] ?: false
        val hasChildren = tree.children.isNotEmpty()

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = hasChildren) { onToggleDir(tree.path) }
                .padding(horizontal = horizontalPadding, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = Feather.Folder,
                contentDescription = "Folder",
                modifier = Modifier.size(16.dp),
                tint = Tx2
            )
            Text(
                text = tree.name,
                color = Tx,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = SansFont
            )
            if (hasChildren) {
                Text(
                    text = if (isExpanded) "▼" else "▶",
                    color = Tx3,
                    fontSize = 9.sp
                )
            }
        }

        if (isExpanded) {
            tree.children
                .sortedWith(compareBy({ !it.isDirectory }, { it.name }))
                .forEach { child ->
                    FileTreeView(
                        tree = child,
                        expanded = expanded,
                        selectedPath = selectedPath,
                        onSelectFile = onSelectFile,
                        onToggleDir = onToggleDir,
                        filterChangesOnly = filterChangesOnly,
                        depth = depth + 1
                    )
                }
        }
    } else {
        // File node
        val isSelected = tree.path == selectedPath
        val hoverInteraction = remember { MutableInteractionSource() }
        val hovered by hoverInteraction.collectIsHoveredAsState()
        val rowBg by androidx.compose.animation.animateColorAsState(
            when {
                isSelected -> Bg3
                hovered -> Bg3.copy(alpha = 0.5f)
                else -> androidx.compose.ui.graphics.Color.Transparent
            },
            Motion.colorDefault, label = "fileRowBg_${tree.name}"
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .hoverable(hoverInteraction)
                .clip(RoundedCornerShape(4.dp))
                .background(rowBg)
                .then(
                    if (isSelected) Modifier.clip(RoundedCornerShape(4.dp))
                        .background(Ac.withAlpha(0.08f))
                    else Modifier
                )
                .clickable { onSelectFile(tree) }
                .padding(horizontal = horizontalPadding, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = Feather.File,
                contentDescription = "File",
                modifier = Modifier.size(14.dp),
                tint = Tx2
            )
            Text(
                text = tree.name,
                color = fileColor(tree.name),
                fontSize = 12.sp,
                fontFamily = SansFont
            )
            // Change status badge
            when (tree.changeStatus) {
                "modified" -> Text(
                    text = "M",
                    color = Warn,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(Warn.withAlpha(0.12f))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                )
                "new" -> Text(
                    text = "N",
                    color = AgentGemini,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(AgentGemini.withAlpha(0.12f))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                )
            }
        }
    }
}

/** Check whether a node or any descendant has a change status. */
private fun hasChanges(node: FileNodeDto): Boolean {
    if (node.changeStatus != null) return true
    return node.children.any { hasChanges(it) }
}
