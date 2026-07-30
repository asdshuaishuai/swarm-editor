package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.ProjectViewModel

// ── Stats helpers ──────────────────────────────────────────────────

private fun countFiles(node: FileNodeDto): Int =
    if (node.isDirectory) node.children.sumOf { countFiles(it) } else 1

// ── Filter chip ────────────────────────────────────────────────────

@Composable
private fun FilterChip(label: String, active: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val bg by androidx.compose.animation.animateColorAsState(
        when {
            active -> ControlBlue.withAlpha(0.14f)
            hovered -> ControlBlue.withAlpha(0.08f)
            else -> Bg2
        },
        Motion.colorDefault,
        label = "fileFilterBackground",
    )
    val fg by androidx.compose.animation.animateColorAsState(
        if (active || hovered) ControlBlue else Tx2,
        Motion.colorDefault,
        label = "fileFilterForeground",
    )
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 5.dp)
    ) {
        Text(label, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

// ── Main composable：左 全高文件树侧栏 | 右 统计+详情 ─────────────

@Composable
fun FileExplorerView(
    tree: FileNodeDto?,
    isLoading: Boolean,
    error: String? = null,
    onRefresh: () -> Unit,
    gitStatus: GitStatusDto = GitStatusDto(),
    filePreview: ProjectViewModel.FilePreviewState = ProjectViewModel.FilePreviewState(),
    onSelectFile: (String) -> Unit = {},
    onSaveFile: (String) -> Unit = {},
    onOpenDiff: (GitFileChangeDto) -> Unit = {},
    projectPath: String = "",
    modifier: Modifier = Modifier
) {
    val expandedDirs = remember { mutableStateMapOf<String, Boolean>() }
    val filterChangesOnly = remember { mutableStateOf(false) }
    val treeListState = rememberLazyListState()
    LaunchedEffect(tree) {
        val root = tree ?: return@LaunchedEffect
        expandedDirs[root.path] = true
        root.children.filter { it.isDirectory }.forEach { expandedDirs[it.path] = true }
    }

    val rootNode = tree
    if (rootNode == null) {
        Column(
            modifier = modifier.fillMaxSize().background(Bg2),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = when {
                    isLoading -> "正在加载项目文件…"
                    !error.isNullOrBlank() -> "无法加载项目文件\n$error"
                    else -> "暂无项目文件"
                },
                color = if (!error.isNullOrBlank()) ErrLight else Tx2,
                fontSize = 14.sp,
            )
            if (!error.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ErrLight.copy(alpha = 0.12f))
                        .border(1.dp, ErrLight.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                        .clickable(onClick = onRefresh)
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) {
                    Text("重试", color = ErrLight, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        return
    }

    val totalFiles = countFiles(rootNode)
    val modifiedCount = gitStatus.modified
    val newCount = gitStatus.untracked

    Row(modifier.fillMaxSize().background(Bg0)) {
        // ── 左：文件树侧栏（全高，对齐全局侧栏样式 260dp）──────────
        Column(
            Modifier.width(280.dp).fillMaxHeight()
                .background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("文件".uppercase(), color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp)
                Spacer(Modifier.weight(1f))
                val refreshInteraction = remember { MutableInteractionSource() }
                val refreshHovered by refreshInteraction.collectIsHoveredAsState()
                val refreshBackground by androidx.compose.animation.animateColorAsState(
                    if (refreshHovered) ControlGreen.withAlpha(0.12f) else Color.Transparent,
                    Motion.colorDefault,
                    label = "fileRefreshBackground",
                )
                val refreshTint by androidx.compose.animation.animateColorAsState(
                    if (refreshHovered) ControlGreen else Tx3,
                    Motion.colorDefault,
                    label = "fileRefreshTint",
                )
                Box(
                    Modifier
                        .size(26.dp)
                        .clip(AppShapes.xs)
                        .background(refreshBackground)
                        .fluidClickable(interactionSource = refreshInteraction, onClick = onRefresh),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(imageVector = Feather.RefreshCw, contentDescription = "刷新", tint = refreshTint, modifier = Modifier.size(15.dp))
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            if (isLoading || !error.isNullOrBlank()) {
                val noticeColor = if (!error.isNullOrBlank()) ErrLight else AcLight
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(noticeColor.copy(alpha = 0.08f))
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (isLoading) "正在刷新项目文件…" else "刷新失败：${error.orEmpty()}",
                        color = noticeColor,
                        fontSize = 10.sp,
                        maxLines = 2,
                        modifier = Modifier.weight(1f),
                    )
                    if (!isLoading && !error.isNullOrBlank()) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "重试",
                            color = ErrLight,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable(onClick = onRefresh).padding(4.dp),
                        )
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                FileTreeView(
                    tree = rootNode,
                    expanded = expandedDirs,
                    selectedPath = filePreview.path,
                    onSelectFile = { onSelectFile(it.path) },
                    onToggleDir = { path -> expandedDirs[path] = !(expandedDirs[path] ?: false) },
                    filterChangesOnly = filterChangesOnly.value,
                    modifier = Modifier.fillMaxSize(),
                    listState = treeListState,
                )
                VerticalScrollbar(
                    adapter = rememberScrollbarAdapter(treeListState),
                    modifier = Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(vertical = 6.dp, horizontal = 3.dp)
                )
            }
        }

        // ── 右：主区（topbar + 过滤 + 统计 + 详情）─────────────────
        Column(Modifier.weight(1f).fillMaxHeight().background(Bg2)) {
            // topbar
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(imageVector = Feather.Folder, contentDescription = "项目", tint = Warn, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(rootNode.name, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text("${projectPath.ifBlank { rootNode.name }} · $totalFiles 文件", color = Tx3, fontSize = 11.sp)
                }
                Spacer(Modifier.weight(1f))
                MetaChip("$totalFiles 文件", Tx2)
                Spacer(Modifier.width(6.dp))
                if (modifiedCount > 0) {
                    MetaChip("$modifiedCount 修改", WarnLight)
                    Spacer(Modifier.width(6.dp))
                }
                if (newCount > 0) {
                    MetaChip("$newCount 新增", OkLight)
                    Spacer(Modifier.width(10.dp))
                }
                FilterChip("全部", !filterChangesOnly.value) { filterChangesOnly.value = false }
                Spacer(Modifier.width(6.dp))
                FilterChip("仅变更", filterChangesOnly.value) { filterChangesOnly.value = true }
            }

            // 详情
            Box(Modifier.weight(1f).fillMaxWidth().background(Bg2), contentAlignment = Alignment.Center) {
                if (filePreview.path != null) {
                    FilePreview(
                        preview = filePreview,
                        change = gitStatus.changes.firstOrNull { it.path == filePreview.path },
                        onOpenDiff = onOpenDiff,
                        onSaveFile = onSaveFile,
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .widthIn(max = 520.dp)
                            .clip(AppShapes.lg)
                            .background(Bg1.copy(alpha = 0.72f))
                            .border(1.dp, Line2, AppShapes.lg)
                            .padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(48.dp).clip(AppShapes.md)
                                .background(ControlGreen.withAlpha(0.1f))
                                .border(1.dp, ControlGreen.withAlpha(0.24f), AppShapes.md),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(imageVector = Feather.Folder, contentDescription = null, tint = ControlGreen, modifier = Modifier.size(23.dp))
                        }
                        Spacer(Modifier.height(12.dp))
                        Text("选择文件开始阅读或编辑", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(5.dp))
                        Text(
                            "源码文件支持高亮；Markdown、HTML 与 JSON 可在源码和预览之间切换。",
                            color = Tx3,
                            fontSize = 12.sp,
                        )
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            MetaChip("源码双视图", ControlBlue)
                            MetaChip("变更 Diff", ControlOrange)
                            MetaChip("本地保存", ControlGreen)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilePreview(
    preview: ProjectViewModel.FilePreviewState,
    change: GitFileChangeDto?,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onSaveFile: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = Feather.File, contentDescription = "文件", modifier = Modifier.size(18.dp), tint = Tx2)
            Spacer(Modifier.width(8.dp))
            Text(preview.path.orEmpty(), color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            if (change != null) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(R6))
                        .background(Ac.withAlpha(0.12f))
                        .border(1.dp, Ac.withAlpha(0.35f), RoundedCornerShape(R6))
                        .clickable { onOpenDiff(change) }
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                ) {
                    Text("查看 Diff", color = AcLight, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.width(10.dp))
            }
            if (!preview.isLoading && preview.error == null) {
                Text(formatFileSize(preview.sizeBytes), color = Tx3, fontSize = 10.sp, fontFamily = CodeFont)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier.fillMaxSize().clip(RoundedCornerShape(R8)).background(Bg0)
                .border(1.dp, Line, RoundedCornerShape(R8)).padding(14.dp)
        ) {
            val message = when {
                preview.isLoading -> "正在读取文件…"
                preview.binary -> "二进制文件不提供文本预览"
                else -> null
            }
            if (message != null) {
                Text(message, color = Tx3, fontSize = 12.sp)
            } else {
                FileContentRenderer(preview, onSaveFile, Modifier.fillMaxSize())
            }
        }
    }
}

private fun formatFileSize(bytes: Long): String = when {
    bytes >= 1024 * 1024 -> "%.1f MiB".format(bytes / (1024.0 * 1024.0))
    bytes >= 1024 -> "%.1f KiB".format(bytes / 1024.0)
    else -> "$bytes B"
}

@Composable
private fun MetaChip(label: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(R6))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R6))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(label, color = color, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}
