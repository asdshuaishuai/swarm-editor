package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.swarmeditor.desktop.viewmodel.ProjectViewModel
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.lsp.SourceLocation

// ── Stats helpers ──────────────────────────────────────────────────

private fun countFiles(node: FileNodeDto): Int =
    if (node.isDirectory) node.children.sumOf { countFiles(it) } else 1

// ── Main composable：左 全高文件树侧栏 | 右 统计+详情 ─────────────

@Composable
fun FileExplorerView(
    tree: FileNodeDto?,
    isLoading: Boolean,
    error: String? = null,
    onRefresh: () -> Unit,
    gitStatus: GitStatusDto = GitStatusDto(),
    filePreview: ProjectViewModel.FilePreviewState = ProjectViewModel.FilePreviewState(),
    openFiles: List<String> = emptyList(),
    onSelectFile: (String) -> Unit = {},
    onCloseFile: (String) -> Unit = {},
    onOpenDiff: (GitFileChangeDto) -> Unit = {},
    onOpenWorkspace: () -> Unit = {},
    onCreateWorkspace: () -> Unit = {},
    onInspectPosition: (Int, Int) -> Unit = { _, _ -> },
    onOpenDefinition: (SourceLocation) -> Unit = {},
    onDismissPositionInsight: () -> Unit = {},
    projectPath: String = "",
    modifier: Modifier = Modifier
) {
    val expandedDirs = remember { mutableStateMapOf<String, Boolean>() }
    val treeListState = rememberLazyListState()
    var filterQuery by remember { mutableStateOf("") }
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
            if (isLoading) {
                InlineLoadingState(text = "正在加载项目文件…", minHeight = 48.dp)
            } else {
                Text(
                    text = if (!error.isNullOrBlank()) "无法加载项目文件\n$error" else "暂无项目文件",
                    color = if (!error.isNullOrBlank()) ErrLight else Tx2,
                    fontSize = 14.sp,
                )
            }
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
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(
                    text = "打开项目文件夹",
                    prominent = true,
                    compact = true,
                    onClick = onOpenWorkspace,
                )
                ActionButton(
                    text = "新建项目",
                    tone = ActionTone.SECONDARY,
                    prominent = false,
                    compact = true,
                    onClick = onCreateWorkspace,
                )
            }
        }
        return
    }

    val totalFiles = countFiles(rootNode)

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
            FileTreeSearchField(
                value = filterQuery,
                onValueChange = { filterQuery = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
            )
            if (isLoading || !error.isNullOrBlank()) {
                val noticeColor = if (!error.isNullOrBlank()) ErrLight else AcLight
                if (isLoading) {
                    InlineLoadingState(
                        text = "正在刷新项目文件…",
                        modifier = Modifier.fillMaxWidth().background(noticeColor.copy(alpha = 0.08f)).padding(horizontal = 12.dp),
                        color = noticeColor,
                        minHeight = 34.dp,
                    )
                } else {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(noticeColor.copy(alpha = 0.08f))
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "刷新失败：${error.orEmpty()}",
                            color = noticeColor,
                            fontSize = 10.sp,
                            maxLines = 2,
                            modifier = Modifier.weight(1f),
                        )
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
                    filterChangesOnly = false,
                    query = filterQuery,
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
                Spacer(Modifier.width(8.dp))
                ActionButton(
                    text = "打开文件夹",
                    prominent = false,
                    compact = true,
                    onClick = onOpenWorkspace,
                )
                Spacer(Modifier.width(6.dp))
                ActionButton(
                    text = "新建项目",
                    tone = ActionTone.SECONDARY,
                    prominent = false,
                    compact = true,
                    onClick = onCreateWorkspace,
                )
            }

            if (openFiles.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(38.dp)
                        .background(Bg1)
                        .border(width = 1.dp, color = Line)
                        .horizontalScroll(rememberScrollState()),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    openFiles.forEach { path ->
                        EditorFileTab(
                            path = path,
                            selected = path == filePreview.path,
                            onSelect = { onSelectFile(path) },
                            onClose = { onCloseFile(path) },
                        )
                    }
                }
            }

            // 详情
            Box(Modifier.weight(1f).fillMaxWidth().background(Bg2), contentAlignment = Alignment.Center) {
                if (filePreview.path != null) {
                    FilePreview(
                        preview = filePreview,
                        change = gitStatus.changes.firstOrNull { it.path == filePreview.path },
                        onOpenDiff = onOpenDiff,
                        onInspectPosition = onInspectPosition,
                        onOpenDefinition = onOpenDefinition,
                        onDismissPositionInsight = onDismissPositionInsight,
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
                        Text("选择文件开始阅读", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
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
                            MetaChip("LSP 导航", ControlGreen)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FileTreeSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = TextStyle(color = Tx, fontSize = 11.sp, fontFamily = SansFont),
        cursorBrush = SolidColor(Ac),
        modifier = modifier
            .height(32.dp)
            .clip(AppShapes.xs)
            .background(Bg0.copy(alpha = 0.72f))
            .border(1.dp, Line2, AppShapes.xs)
            .padding(horizontal = 9.dp),
        decorationBox = { innerTextField ->
            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Feather.Search,
                    contentDescription = null,
                    tint = Tx3,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(7.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isBlank()) {
                        Text("搜索项目文件", color = Tx3, fontSize = 11.sp)
                    }
                    innerTextField()
                }
                if (value.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(AppShapes.xs)
                            .clickable { onValueChange("") },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Feather.X,
                            contentDescription = "清除文件筛选",
                            tint = Tx3,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                }
            }
        },
    )
}

@Composable
private fun EditorFileTab(
    path: String,
    selected: Boolean,
    onSelect: () -> Unit,
    onClose: () -> Unit,
) {
    val background = if (selected) Bg2 else Bg1
    Box(
        modifier = Modifier
            .height(38.dp)
            .widthIn(min = 118.dp, max = 220.dp)
            .background(background)
            .border(width = 0.5.dp, color = Line)
            .clickable(onClick = onSelect),
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(start = 10.dp, end = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SemanticIconBadge(
                spec = semanticFileIconSpec(path),
                contentDescription = null,
                size = 20.dp,
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = path.substringAfterLast('/').substringAfterLast('\\'),
                color = if (selected) Tx else Tx2,
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(AppShapes.xs)
                    .clickable(onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Feather.X,
                    contentDescription = "关闭 ${path.substringAfterLast('/')}",
                    tint = Tx3,
                    modifier = Modifier.size(13.dp),
                )
            }
        }
        if (selected) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(Ac),
            )
        }
    }
}

@Composable
private fun FilePreview(
    preview: ProjectViewModel.FilePreviewState,
    change: GitFileChangeDto?,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onInspectPosition: (Int, Int) -> Unit,
    onOpenDefinition: (SourceLocation) -> Unit,
    onDismissPositionInsight: () -> Unit,
) {
    var navigationTarget by remember(preview.path) { mutableStateOf<SourceNavigationTarget?>(null) }
    LaunchedEffect(preview.navigationRequestId) {
        preview.navigationLine?.let { line ->
            navigationTarget = SourceNavigationTarget(line, preview.navigationRequestId)
        }
    }
    Column(Modifier.fillMaxSize().padding(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SemanticIconBadge(
                spec = semanticFileIconSpec(preview.path.orEmpty()),
                contentDescription = "文件类型",
                size = 30.dp,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                preview.path.orEmpty(),
                color = Tx,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            if (!preview.isLoading && !preview.binary && preview.error == null && preview.path != null) {
                HighlightStatusChip(preview)
                Spacer(Modifier.width(10.dp))
            }
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
                preview.binary -> "二进制文件不提供文本预览"
                else -> null
            }
            if (preview.isLoading) {
                InlineLoadingState(
                    text = "正在读取文件…",
                    modifier = Modifier.align(Alignment.Center),
                    minHeight = 36.dp,
                )
            } else if (message != null) {
                Text(message, color = Tx3, fontSize = 12.sp)
            } else {
                Row(Modifier.fillMaxSize()) {
                    if (preview.symbols.isNotEmpty() || preview.diagnostics.isNotEmpty()) {
                        CodeIntelligencePanel(
                            symbols = preview.symbols,
                            diagnostics = preview.diagnostics,
                            onNavigate = { line ->
                                navigationTarget = SourceNavigationTarget(
                                    line = line,
                                    requestId = (navigationTarget?.requestId ?: 0L) + 1L,
                                )
                            },
                            modifier = Modifier.width(220.dp).fillMaxHeight(),
                        )
                        Spacer(Modifier.width(10.dp))
                    }
                    FileContentRenderer(
                        preview = preview,
                        navigationTarget = navigationTarget,
                        onInspectPosition = onInspectPosition,
                        onOpenDefinition = onOpenDefinition,
                        onDismissPositionInsight = onDismissPositionInsight,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CodeIntelligencePanel(
    symbols: List<SourceSymbol>,
    diagnostics: List<SourceDiagnostic>,
    onNavigate: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(R8))
            .background(Bg1)
            .border(1.dp, Line, RoundedCornerShape(R8)),
    ) {
        Text(
            "代码智能",
            color = Tx,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 9.dp),
        )
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 4.dp)) {
            if (diagnostics.isNotEmpty()) {
                item("diagnostic-title") {
                    IntelligenceSectionLabel("诊断 · ${diagnostics.size}")
                }
                items(diagnostics) { diagnostic ->
                    DiagnosticRow(diagnostic, onNavigate)
                }
            }
            if (symbols.isNotEmpty()) {
                item("symbol-title") {
                    IntelligenceSectionLabel("符号 · ${symbols.size}")
                }
                items(symbols) { symbol ->
                    SymbolRow(symbol, onNavigate)
                }
            }
        }
    }
}

@Composable
private fun IntelligenceSectionLabel(label: String) {
    Text(
        label.uppercase(),
        color = Tx3,
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 7.dp),
    )
}

@Composable
private fun DiagnosticRow(diagnostic: SourceDiagnostic, onNavigate: (Int) -> Unit) {
    val color = diagnosticColor(diagnostic.severity)
    IntelligenceRow(
        title = diagnostic.message,
        metadata = "${diagnostic.severity} · L${diagnostic.line + 1}",
        accent = color,
        onClick = { onNavigate(diagnostic.line) },
    )
}

@Composable
private fun SymbolRow(symbol: SourceSymbol, onNavigate: (Int) -> Unit) {
    IntelligenceRow(
        title = symbol.name,
        metadata = listOfNotNull(symbol.kind, symbol.containerName, "L${symbol.line + 1}").joinToString(" · "),
        accent = AgentGemini,
        onClick = { onNavigate(symbol.line) },
    )
}

@Composable
private fun IntelligenceRow(
    title: String,
    metadata: String,
    accent: Color,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R6))
            .clickable(onClick = onClick)
            .padding(horizontal = 7.dp, vertical = 6.dp),
    ) {
        Text(title, color = Tx2, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(2.dp))
        Text(metadata, color = accent, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

internal fun diagnosticColor(severity: String): Color = when (severity.lowercase()) {
    "error" -> ErrLight
    "warning" -> WarnLight
    "information", "info" -> ControlBlue
    else -> Tx3
}

@Composable
private fun HighlightStatusChip(preview: ProjectViewModel.FilePreviewState) {
    val server = preview.lspServer?.takeIf(String::isNotBlank)
    val label = when {
        preview.isInspecting -> "LSP 分析中"
        server != null -> "LSP 语义 · $server"
        preview.languageId == "markdown" -> "JetBrains Markdown · 本地高亮"
        else -> "本地语法高亮"
    }
    val color = when {
        preview.isInspecting -> ControlBlue
        server != null -> AgentGemini
        else -> Tx3
    }
    val detail = preview.lspMessage?.takeIf(String::isNotBlank)
        ?: when {
            preview.isInspecting -> "文件内容已显示，正在后台获取语义高亮、符号和诊断"
            server != null -> "语义高亮由 $server 提供"
            preview.languageId == "markdown" -> "标题结构由 JetBrains Markdown AST 提供，源码由 Compose 本地高亮"
            else -> "当前文件使用 Compose 本地词法高亮"
        }

    Text(
        text = label,
        color = color,
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .widthIn(max = 180.dp)
            .clip(AppShapes.pill)
            .background(color.withAlpha(0.10f))
            .border(1.dp, color.withAlpha(0.24f), AppShapes.pill)
            .semantics { contentDescription = detail }
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
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
