package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.api.ProjectSpecGraphDto
import com.swarmeditor.desktop.api.ProjectSpecNodeDto
import com.swarmeditor.desktop.api.SpecDiagnosticDto
import com.swarmeditor.desktop.api.SpecDiagnosticSeverityDto
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.WarnLight
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.ui.common.IdeListRow
import com.swarmeditor.desktop.ui.common.IdeToolWindowHeader
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.AlertCircle
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.FileText
import com.woowla.compose.icon.collections.feather.feather.RefreshCw

@Composable
internal fun SpecGraphToolWindow(
    graph: ProjectSpecGraphDto?,
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenSpec: (ProjectSpecNodeDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth().fillMaxHeight().background(Bg2)) {
        IdeToolWindowHeader(
            title = "规格图",
            detail = graph?.let { "${it.nodes.size} 个节点" } ?: "只读",
            actions = {
                IdeActionButton(
                    icon = Feather.RefreshCw,
                    contentDescription = "刷新规格图",
                    onClick = onRefresh,
                    enabled = !isLoading,
                )
            },
        )
        when {
            isLoading -> SpecGraphMessage("正在读取项目规格…")
            error != null -> SpecGraphMessage(error, color = ErrLight)
            graph == null || graph.nodes.isEmpty() -> SpecGraphMessage("项目中没有发现带 id/type 的规格文件")
            else -> {
                val nodesByParent = remember(graph.nodes) { graph.nodes.groupBy { it.parent } }
                LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    item(key = "root") {
                        SpecNodeTree(
                            nodes = nodesByParent[null].orEmpty(),
                            nodesByParent = nodesByParent,
                            onOpenSpec = onOpenSpec,
                        )
                    }
                    if (graph.diagnostics.isNotEmpty()) {
                        item(key = "diagnostics-header") {
                            SpecDiagnosticsHeader(graph.diagnostics.size)
                        }
                        items(graph.diagnostics, key = { "diagnostic:${it.path}:${it.line}:${it.message}" }) { diagnostic ->
                            SpecDiagnosticRow(diagnostic)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SpecNodeTree(
    nodes: List<ProjectSpecNodeDto>,
    nodesByParent: Map<String?, List<ProjectSpecNodeDto>>,
    onOpenSpec: (ProjectSpecNodeDto) -> Unit,
    depth: Int = 0,
    visited: Set<String> = emptySet(),
) {
    nodes.sortedWith(compareBy(ProjectSpecNodeDto::title, ProjectSpecNodeDto::id)).forEach { node ->
        val children = nodesByParent[node.id].orEmpty()
        val isCycle = node.id in visited
        var expanded by remember(node.id) { mutableStateOf(depth < 2 && !isCycle) }
        IdeListRow(
            onClick = { onOpenSpec(node) },
            rowHeight = 34.dp,
            modifier = Modifier.padding(start = (depth * 14).dp),
            leading = {
                if (children.isNotEmpty() && !isCycle) {
                    Icon(
                        if (expanded) Feather.ChevronDown else Feather.ChevronRight,
                        null,
                        tint = Tx3,
                        modifier = Modifier.size(14.dp).padding(end = 1.dp),
                    )
                } else {
                    Spacer(Modifier.size(14.dp))
                }
                Spacer(Modifier.width(4.dp))
                Icon(Feather.FileText, null, tint = Tx3, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
            },
            content = {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        node.title,
                        color = Tx,
                        style = AppType.bodySm,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${node.type} · ${node.path}",
                        color = Tx3,
                        style = AppType.micro,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (node.tags.isNotEmpty()) {
                    Text(node.tags.first(), color = Tx3, style = AppType.micro, maxLines = 1)
                }
            },
        )
        if (expanded && children.isNotEmpty() && !isCycle) {
            SpecNodeTree(
                nodes = children,
                nodesByParent = nodesByParent,
                onOpenSpec = onOpenSpec,
                depth = depth + 1,
                visited = visited + node.id,
            )
        }
    }
}

@Composable
private fun SpecDiagnosticsHeader(count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Bg2)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Feather.AlertCircle, null, tint = WarnLight, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text("规格诊断", color = Tx2, style = AppType.caption, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(count.toString(), color = Tx3, style = AppType.micro)
    }
}

@Composable
private fun SpecDiagnosticRow(diagnostic: SpecDiagnosticDto) {
    val color = if (diagnostic.severity == SpecDiagnosticSeverityDto.ERROR) ErrLight else WarnLight
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Feather.AlertCircle, null, tint = color, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(6.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(diagnostic.message, color = Tx2, style = AppType.caption)
            Text(
                buildString {
                    append(diagnostic.path)
                    diagnostic.line?.let { append(":${it + 1}") }
                },
                color = Tx3,
                style = AppType.micro,
            )
        }
    }
}

@Composable
private fun SpecGraphMessage(message: String, color: androidx.compose.ui.graphics.Color = Tx3) {
    Column(
        modifier = Modifier.fillMaxWidth().fillMaxHeight().padding(14.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, color = color, style = AppType.caption)
    }
}
