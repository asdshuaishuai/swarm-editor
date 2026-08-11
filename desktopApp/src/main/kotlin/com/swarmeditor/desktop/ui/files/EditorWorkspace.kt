package com.swarmeditor.desktop.ui.files

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceLocation
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AcLight
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.ControlBlue
import com.swarmeditor.desktop.theme.ControlGreen
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.WarnLight
import com.swarmeditor.desktop.theme.fluidClickable
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.theme.InlineLoadingState
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.copyTextToClipboard
import com.swarmeditor.desktop.ui.common.IdeContextMenuArea
import com.swarmeditor.desktop.ui.common.IdeContextMenuItem
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.swarmeditor.desktop.viewmodel.ProjectViewModel
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.AlertCircle
import com.woowla.compose.icon.collections.feather.feather.ArrowLeft
import com.woowla.compose.icon.collections.feather.feather.ArrowRight
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.ChevronUp
import com.woowla.compose.icon.collections.feather.feather.Edit3
import com.woowla.compose.icon.collections.feather.feather.FileText
import com.woowla.compose.icon.collections.feather.feather.GitPullRequest
import com.woowla.compose.icon.collections.feather.feather.List
import com.woowla.compose.icon.collections.feather.feather.Sidebar
import com.woowla.compose.icon.collections.feather.feather.X

private enum class IntelligenceTab { STRUCTURE, PROBLEMS }

private enum class ProblemFilter(val id: String, val label: String) {
    ALL("all", "全部"),
    ERROR("error", "错误"),
    WARNING("warning", "警告"),
    INFO("info", "信息"),
}

internal fun diagnosticMatchesFilter(severity: String, filterId: String): Boolean = when (filterId) {
    "error" -> severity.equals("error", ignoreCase = true)
    "warning" -> severity.equals("warning", ignoreCase = true)
    "info" -> severity.equals("information", ignoreCase = true) || severity.equals("info", ignoreCase = true)
    else -> true
}

internal fun diagnosticLocationLabel(diagnostic: SourceDiagnostic): String =
    if (diagnostic.line == diagnostic.endLine) {
        "L${diagnostic.line + 1}:${diagnostic.startCharacter + 1}-${diagnostic.endCharacter + 1}"
    } else {
        "L${diagnostic.line + 1}:${diagnostic.startCharacter + 1}-L${diagnostic.endLine + 1}:${diagnostic.endCharacter + 1}"
    }

@Composable
internal fun EditorWorkspace(
    preview: ProjectViewModel.FilePreviewState,
    openFiles: List<String>,
    dirtyPaths: Set<String>,
    canNavigateBack: Boolean,
    canNavigateForward: Boolean,
    change: GitFileChangeDto?,
    onSelectFile: (String) -> Unit,
    onCloseFile: (String) -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateForward: () -> Unit,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onInspectPosition: (Int, Int) -> Unit,
    onOpenDefinition: (SourceLocation) -> Unit,
    onDismissPositionInsight: () -> Unit,
    onBeginEdit: () -> Unit,
    onDraftChange: (String) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxHeight().background(Bg0)) {
        EditorTabStrip(
            openFiles = openFiles,
            selectedPath = preview.path,
            dirtyPaths = dirtyPaths,
            canNavigateBack = canNavigateBack,
            canNavigateForward = canNavigateForward,
            onSelectFile = onSelectFile,
            onCloseFile = onCloseFile,
            onNavigateBack = onNavigateBack,
            onNavigateForward = onNavigateForward,
        )
        if (preview.path == null) {
            EmptyEditorState(Modifier.weight(1f))
            return@Column
        }
        EditorBreadcrumbBar(
            preview = preview,
            change = change,
            onOpenDiff = onOpenDiff,
            onBeginEdit = onBeginEdit,
            onSaveEdit = onSaveEdit,
            onCancelEdit = onCancelEdit,
        )
        EditorSurface(
            preview = preview,
            onInspectPosition = onInspectPosition,
            onOpenDefinition = onOpenDefinition,
            onDismissPositionInsight = onDismissPositionInsight,
            onDraftChange = onDraftChange,
            onSaveEdit = onSaveEdit,
            onCancelEdit = onCancelEdit,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun EditorTabStrip(
    openFiles: List<String>,
    selectedPath: String?,
    dirtyPaths: Set<String>,
    canNavigateBack: Boolean,
    canNavigateForward: Boolean,
    onSelectFile: (String) -> Unit,
    onCloseFile: (String) -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateForward: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().height(36.dp).background(Bg1).border(1.dp, Line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.width(66.dp).fillMaxHeight().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            IdeActionButton(
                Feather.ArrowLeft,
                "后退（Ctrl+Alt+←）",
                onNavigateBack,
                enabled = canNavigateBack,
            )
            IdeActionButton(
                Feather.ArrowRight,
                "前进（Ctrl+Alt+→）",
                onNavigateForward,
                enabled = canNavigateForward,
            )
        }
        Box(Modifier.width(1.dp).fillMaxHeight().background(Line))
        Row(
            Modifier.weight(1f).fillMaxHeight().horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (openFiles.isEmpty()) {
                Text("无打开文件", color = Tx3, fontSize = 10.sp, modifier = Modifier.padding(horizontal = 12.dp))
            } else {
                openFiles.forEach { path ->
                    EditorFileTab(
                        path = path,
                        selected = path == selectedPath,
                        dirty = path in dirtyPaths,
                        onSelect = { onSelectFile(path) },
                        onClose = { onCloseFile(path) },
                        onCloseOthers = { openFiles.filterNot { it == path }.forEach(onCloseFile) },
                        onCloseAll = { openFiles.forEach(onCloseFile) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EditorFileTab(
    path: String,
    selected: Boolean,
    dirty: Boolean,
    onSelect: () -> Unit,
    onClose: () -> Unit,
    onCloseOthers: () -> Unit,
    onCloseAll: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    val background by animateColorAsState(
        when {
            selected -> Bg0
            isHovered -> Bg2
            else -> Bg1
        },
        Motion.colorDefault,
        label = "ideaEditorTabBackground",
    )
    IdeContextMenuArea(
        items = {
            listOf(
                IdeContextMenuItem("关闭") { onClose() },
                IdeContextMenuItem("关闭其他标签") { onCloseOthers() },
                IdeContextMenuItem("关闭全部标签") { onCloseAll() },
                IdeContextMenuItem("复制文件路径") { copyTextToClipboard(path) },
            )
        },
    ) {
        Box(
            Modifier.height(36.dp).widthIn(min = 112.dp, max = 210.dp).background(background)
                .border(0.5.dp, Line).fluidClickable(interactionSource = interactionSource, onClick = onSelect),
        ) {
            Row(
                Modifier.fillMaxSize().padding(start = 9.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SemanticIconBadge(semanticFileIconSpec(path), null, size = 18.dp)
                Spacer(Modifier.width(6.dp))
                Text(
                    path.substringAfterLast('/').substringAfterLast('\\'),
                    color = if (selected) Tx else Tx2,
                    fontSize = 10.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (dirty && !isHovered) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(AcLight))
                    Spacer(Modifier.width(5.dp))
                }
                if (selected || isHovered) {
                    Box(
                        Modifier.size(22.dp).clip(AppShapes.xs).clickable(onClick = onClose),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Feather.X, "关闭 ${path.substringAfterLast('/')}", tint = Tx3, modifier = Modifier.size(12.dp))
                    }
                }
            }
            if (selected) {
                Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(2.dp).background(Ac))
            }
        }
    }
}

@Composable
private fun EditorBreadcrumbBar(
    preview: ProjectViewModel.FilePreviewState,
    change: GitFileChangeDto?,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onBeginEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().height(40.dp).background(Bg0).border(1.dp, Line).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FileBreadcrumbs(preview.path.orEmpty(), Modifier.weight(1f))
        if (!preview.isLoading && !preview.binary && preview.error == null) {
            HighlightStatusChip(preview)
            Spacer(Modifier.width(8.dp))
        }
        if (change != null) {
            EditorActionButton(Feather.GitPullRequest, "Diff", ControlBlue) { onOpenDiff(change) }
            Spacer(Modifier.width(4.dp))
        }
        if (!preview.isLoading && preview.error == null && !preview.binary && !preview.truncated) {
            if (preview.draftContent == null) {
                EditorActionButton(Feather.Edit3, "编辑", ControlGreen, onBeginEdit)
            } else {
                ActionButton(text = if (preview.isSaving) "保存中…" else "保存", compact = true, onClick = onSaveEdit)
                Spacer(Modifier.width(5.dp))
                ActionButton(text = "取消", compact = true, prominent = false, onClick = onCancelEdit)
            }
        }
    }
}

@Composable
private fun FileBreadcrumbs(path: String, modifier: Modifier = Modifier) {
    val segments = remember(path) { fileBreadcrumbSegments(path) }
    Row(modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
        segments.forEachIndexed { index, segment ->
            if (index == segments.lastIndex) {
                SemanticIconBadge(semanticFileIconSpec(segment), null, size = 18.dp)
                Spacer(Modifier.width(5.dp))
            }
            Text(
                segment,
                color = if (index == segments.lastIndex) Tx else Tx3,
                fontSize = 10.sp,
                fontWeight = if (index == segments.lastIndex) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
            )
            if (index != segments.lastIndex) {
                Icon(Feather.ChevronRight, null, tint = Tx3, modifier = Modifier.size(12.dp).padding(horizontal = 1.dp))
            }
        }
    }
}

internal fun fileBreadcrumbSegments(path: String): List<String> =
    path.replace('\\', '/').split('/').filter(String::isNotBlank)

@Composable
private fun EditorActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    accent: Color,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    Row(
        Modifier.height(26.dp).clip(AppShapes.xs)
            .background(if (isHovered) accent.withAlpha(0.13f) else Bg2)
            .border(1.dp, if (isHovered) accent.withAlpha(0.38f) else Line2, AppShapes.xs)
            .fluidClickable(interactionSource = interactionSource, onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, label, tint = if (isHovered) accent else Tx2, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, color = if (isHovered) accent else Tx2, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EditorSurface(
    preview: ProjectViewModel.FilePreviewState,
    onInspectPosition: (Int, Int) -> Unit,
    onOpenDefinition: (SourceLocation) -> Unit,
    onDismissPositionInsight: () -> Unit,
    onDraftChange: (String) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var navigationTarget by remember(preview.path) { mutableStateOf<SourceNavigationTarget?>(null) }
    var showIntelligence by remember(preview.path) { mutableStateOf(true) }
    var intelligenceTab by remember(preview.path) {
        mutableStateOf(if (preview.diagnostics.isNotEmpty()) IntelligenceTab.PROBLEMS else IntelligenceTab.STRUCTURE)
    }
    LaunchedEffect(preview.navigationRequestId) {
        preview.navigationLine?.let { line ->
            navigationTarget = SourceNavigationTarget(line, preview.navigationRequestId)
        }
    }
    val hasIntelligence = preview.symbols.isNotEmpty() || preview.diagnostics.isNotEmpty()

    Box(modifier.fillMaxWidth().background(Bg0)) {
        when {
            preview.isLoading -> InlineLoadingState("正在读取文件…", Modifier.align(Alignment.Center), minHeight = 38.dp)
            preview.binary -> Text("二进制文件不提供文本预览", color = Tx3, fontSize = 12.sp, modifier = Modifier.align(Alignment.Center))
            else -> Row(Modifier.fillMaxSize()) {
                FileContentRenderer(
                    preview = preview,
                    navigationTarget = navigationTarget,
                    onInspectPosition = onInspectPosition,
                    onOpenDefinition = onOpenDefinition,
                    onDismissPositionInsight = onDismissPositionInsight,
                    onDraftChange = onDraftChange,
                    onSaveEditing = onSaveEdit,
                    onCancelEditing = onCancelEdit,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
                if (hasIntelligence) {
                    if (showIntelligence) {
                        IntelligenceToolWindow(
                            symbols = preview.symbols,
                            diagnostics = preview.diagnostics,
                            activeTab = intelligenceTab,
                            onTabChange = { intelligenceTab = it },
                            onNavigate = { line ->
                                navigationTarget = SourceNavigationTarget(
                                    line,
                                    (navigationTarget?.requestId ?: 0L) + 1L,
                                )
                            },
                            onClose = { showIntelligence = false },
                            modifier = Modifier.width(224.dp).fillMaxHeight(),
                        )
                    } else {
                        IntelligenceStripe(
                            symbolCount = preview.symbols.size,
                            diagnosticCount = preview.diagnostics.size,
                            onOpen = { tab ->
                                intelligenceTab = tab
                                showIntelligence = true
                            },
                            modifier = Modifier.width(34.dp).fillMaxHeight(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun IntelligenceToolWindow(
    symbols: List<SourceSymbol>,
    diagnostics: List<SourceDiagnostic>,
    activeTab: IntelligenceTab,
    onTabChange: (IntelligenceTab) -> Unit,
    onNavigate: (Int) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var problemFilter by remember { mutableStateOf(ProblemFilter.ALL) }
    val visibleDiagnostics = remember(diagnostics, problemFilter) {
        diagnostics.filter { diagnosticMatchesFilter(it.severity, problemFilter.id) }
            .sortedWith(compareBy<SourceDiagnostic>({ severityRank(it.severity) }, SourceDiagnostic::line, SourceDiagnostic::startCharacter))
    }
    var activeProblemIndex by remember(problemFilter, diagnostics) { mutableIntStateOf(0) }
    LaunchedEffect(visibleDiagnostics.size) {
        activeProblemIndex = activeProblemIndex.coerceIn(0, (visibleDiagnostics.size - 1).coerceAtLeast(0))
    }

    fun navigateProblem(offset: Int) {
        if (visibleDiagnostics.isEmpty()) return
        activeProblemIndex = (activeProblemIndex + offset + visibleDiagnostics.size) % visibleDiagnostics.size
        onNavigate(visibleDiagnostics[activeProblemIndex].line)
    }

    Column(modifier.background(Bg1).border(1.dp, Line)) {
        Row(
            Modifier.fillMaxWidth().height(36.dp).background(Bg2).padding(start = 5.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IntelligenceTabButton("结构", symbols.size, activeTab == IntelligenceTab.STRUCTURE) {
                onTabChange(IntelligenceTab.STRUCTURE)
            }
            IntelligenceTabButton("问题", diagnostics.size, activeTab == IntelligenceTab.PROBLEMS) {
                onTabChange(IntelligenceTab.PROBLEMS)
            }
            Spacer(Modifier.weight(1f))
            IdeActionButton(Feather.X, "关闭工具窗口", onClose)
        }
        if (activeTab == IntelligenceTab.PROBLEMS) {
            Row(
                Modifier.fillMaxWidth().height(30.dp).background(Bg0).border(1.dp, Line).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProblemFilter.entries.forEach { filter ->
                    ProblemFilterButton(
                        filter = filter,
                        count = diagnostics.count { diagnosticMatchesFilter(it.severity, filter.id) },
                        selected = problemFilter == filter,
                        onClick = { problemFilter = filter },
                    )
                }
                Spacer(Modifier.weight(1f))
                IdeActionButton(Feather.ChevronUp, "上一个问题", { navigateProblem(-1) }, enabled = visibleDiagnostics.isNotEmpty())
                IdeActionButton(Feather.ChevronDown, "下一个问题", { navigateProblem(1) }, enabled = visibleDiagnostics.isNotEmpty())
            }
        }
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 5.dp)) {
            when (activeTab) {
                IntelligenceTab.STRUCTURE -> {
                    if (symbols.isEmpty()) item { ToolWindowEmpty("当前文件没有可用符号") }
                    items(symbols) { symbol -> SymbolRow(symbol, onNavigate) }
                }
                IntelligenceTab.PROBLEMS -> {
                    if (visibleDiagnostics.isEmpty()) item { ToolWindowEmpty("当前筛选下没有诊断问题") }
                    itemsIndexed(visibleDiagnostics) { index, diagnostic ->
                        DiagnosticRow(
                            diagnostic = diagnostic,
                            selected = index == activeProblemIndex,
                            onNavigate = {
                                activeProblemIndex = index
                                onNavigate(diagnostic.line)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun IntelligenceTabButton(label: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.height(28.dp).clip(AppShapes.xs).background(if (selected) Bg0 else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = if (selected) Tx else Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        if (count > 0) {
            Spacer(Modifier.width(5.dp))
            Text(
                count.toString(),
                color = Tx3,
                fontSize = 8.sp,
                modifier = Modifier.padding(start = 1.dp),
            )
        }
    }
}

@Composable
private fun IntelligenceStripe(
    symbolCount: Int,
    diagnosticCount: Int,
    onOpen: (IntelligenceTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.background(Bg1).border(1.dp, Line), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(6.dp))
        StripeButton(Feather.List, "结构 $symbolCount") { onOpen(IntelligenceTab.STRUCTURE) }
        Spacer(Modifier.height(4.dp))
        StripeButton(Feather.AlertCircle, "问题 $diagnosticCount") { onOpen(IntelligenceTab.PROBLEMS) }
    }
}

@Composable
private fun StripeButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(28.dp).clip(AppShapes.xs).clickable(onClick = onClick).semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = Tx3, modifier = Modifier.size(14.dp))
    }
}

@Composable
private fun SymbolRow(symbol: SourceSymbol, onNavigate: (Int) -> Unit) {
    val headingDepth = symbol.kind
        .takeIf { it.startsWith("Heading ") }
        ?.substringAfter("Heading ")
        ?.toIntOrNull()
        ?.minus(1)
        ?.coerceIn(0, 5)
        ?: 0
    IntelligenceRow(
        icon = Feather.FileText,
        title = symbol.name,
        metadata = listOfNotNull(symbol.kind, symbol.containerName, "L${symbol.line + 1}").joinToString(" · "),
        accent = AgentGemini,
        indentLevel = headingDepth,
        onClick = { onNavigate(symbol.line) },
    )
}

@Composable
private fun DiagnosticRow(diagnostic: SourceDiagnostic, selected: Boolean, onNavigate: () -> Unit) {
    val color = diagnosticColor(diagnostic.severity)
    val origin = listOfNotNull(diagnostic.source, diagnostic.code).joinToString("/")
    IntelligenceRow(
        icon = Feather.AlertCircle,
        title = diagnostic.message,
        metadata = listOf(diagnostic.severity, diagnosticLocationLabel(diagnostic), origin).filter(String::isNotBlank).joinToString(" · "),
        accent = color,
        selected = selected,
        onClick = onNavigate,
    )
}

@Composable
private fun IntelligenceRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    metadata: String,
    accent: Color,
    indentLevel: Int = 0,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clip(AppShapes.xs).background(if (selected) Ac.withAlpha(0.16f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(start = (7 + indentLevel * 10).dp, end = 7.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, null, tint = accent, modifier = Modifier.size(13.dp).padding(top = 1.dp))
        Spacer(Modifier.width(7.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Tx2, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            Text(metadata, color = Tx3, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ProblemFilterButton(
    filter: ProblemFilter,
    count: Int,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier.height(24.dp).clip(AppShapes.xs).background(if (selected) Ac.withAlpha(0.2f) else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(filter.label, color = if (selected) Tx else Tx3, fontSize = 9.sp)
        if (count > 0) {
            Spacer(Modifier.width(4.dp))
            Text(count.toString(), color = Tx3, fontSize = 8.sp)
        }
    }
}

private fun severityRank(severity: String): Int = when (severity.lowercase()) {
    "error" -> 0
    "warning" -> 1
    "information", "info" -> 2
    else -> 3
}

@Composable
private fun ToolWindowEmpty(text: String) {
    Text(text, color = Tx3, fontSize = 10.sp, modifier = Modifier.fillMaxWidth().padding(12.dp))
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
        preview.isInspecting -> "分析中"
        server != null -> server
        preview.languageId == "markdown" -> "Markdown"
        else -> "语法高亮"
    }
    val color = when {
        preview.isInspecting -> ControlBlue
        server != null -> AgentGemini
        else -> Tx3
    }
    val detail = preview.lspMessage?.takeIf(String::isNotBlank)
        ?: when {
            preview.isInspecting -> "正在获取语义高亮、符号和诊断"
            server != null -> "语义高亮由 $server 提供"
            else -> "当前文件使用本地词法高亮"
        }
    Text(
        label,
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.widthIn(max = 128.dp).clip(AppShapes.pill).background(color.withAlpha(0.09f))
            .border(1.dp, color.withAlpha(0.20f), AppShapes.pill)
            .semantics { contentDescription = detail }.padding(horizontal = 7.dp, vertical = 3.dp),
    )
}

@Composable
private fun EmptyEditorState(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(50.dp).clip(RoundedCornerShape(14.dp)).background(ControlGreen.withAlpha(0.09f))
                .border(1.dp, ControlGreen.withAlpha(0.22f), RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Feather.Sidebar, null, tint = ControlGreen, modifier = Modifier.size(23.dp))
        }
        Spacer(Modifier.height(13.dp))
        Text("选择文件开始编辑", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(5.dp))
        Text("项目树支持方向键导航，编辑器支持源码、预览、Diff 与 LSP。", color = Tx3, fontSize = 11.sp)
    }
}
