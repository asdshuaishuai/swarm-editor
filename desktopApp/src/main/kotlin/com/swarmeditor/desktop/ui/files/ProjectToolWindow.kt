package com.swarmeditor.desktop.ui.files

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
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
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.ControlBlue
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.SansFont
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.theme.InlineLoadingState
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.ui.common.IdeToolWindowHeader
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.ChevronsUp
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.FolderPlus
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.Search
import com.woowla.compose.icon.collections.feather.feather.X

@Composable
internal fun ProjectToolWindow(
    root: FileNodeDto,
    projectPath: String,
    selectedPath: String?,
    expandedDirectories: Map<String, Boolean>,
    filterQuery: String,
    isLoading: Boolean,
    error: String?,
    listState: LazyListState,
    onFilterQueryChange: (String) -> Unit,
    onSelectFile: (FileNodeDto) -> Unit,
    onToggleDirectory: (String) -> Unit,
    onCollapseAll: () -> Unit,
    onRefresh: () -> Unit,
    onOpenWorkspace: () -> Unit,
    onCreateWorkspace: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var searchVisible by remember { mutableStateOf(filterQuery.isNotEmpty()) }
    val searchFocusRequester = remember { FocusRequester() }
    val toolWindowFocusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        toolWindowFocusRequester.requestFocus()
    }
    LaunchedEffect(searchVisible) {
        if (searchVisible) searchFocusRequester.requestFocus()
    }

    Column(
        modifier.fillMaxHeight().background(Bg1).focusRequester(toolWindowFocusRequester).focusable().onPreviewKeyEvent { event ->
            when {
                event.type == KeyEventType.KeyDown && event.key == Key.F && (event.isCtrlPressed || event.isMetaPressed) -> {
                    searchVisible = true
                    true
                }
                event.type == KeyEventType.KeyDown && event.key == Key.Escape && searchVisible -> {
                    onFilterQueryChange("")
                    searchVisible = false
                    true
                }
                else -> false
            }
        },
    ) {
        IdeToolWindowHeader(
            title = "项目",
            detail = root.name,
        ) {
            IdeActionButton(Feather.Search, "搜索文件", { searchVisible = !searchVisible }, selected = searchVisible)
            IdeActionButton(Feather.ChevronsUp, "收起目录", onCollapseAll)
            IdeActionButton(Feather.RefreshCw, "刷新项目", onRefresh)
        }
        ProjectIdentityRow(
            root = root,
            projectPath = projectPath,
            onOpenWorkspace = onOpenWorkspace,
            onCreateWorkspace = onCreateWorkspace,
        )
        AnimatedVisibility(searchVisible, enter = fadeIn(), exit = fadeOut()) {
            ProjectSearchField(
                value = filterQuery,
                onValueChange = onFilterQueryChange,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 5.dp).focusRequester(searchFocusRequester),
            )
        }
        if (isLoading || !error.isNullOrBlank()) {
            ProjectNotice(isLoading, error, onRefresh)
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            FileTreeView(
                tree = root,
                expanded = expandedDirectories,
                selectedPath = selectedPath,
                onSelectFile = onSelectFile,
                onToggleDir = onToggleDirectory,
                query = filterQuery,
                modifier = Modifier.fillMaxSize(),
                listState = listState,
            )
            VerticalScrollbar(
                adapter = rememberScrollbarAdapter(listState),
                modifier = Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(vertical = 5.dp, horizontal = 2.dp),
            )
        }
        Row(
            Modifier.fillMaxWidth().height(26.dp).background(Bg2).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("${countProjectFiles(root)} 个文件", color = Tx3, fontSize = 9.sp)
            Spacer(Modifier.weight(1f))
            Text(if (searchVisible) "Esc 关闭搜索" else "Ctrl/⌘F 搜索 · Enter 打开", color = Tx3, fontSize = 9.sp)
        }
    }
}

@Composable
private fun ProjectIdentityRow(
    root: FileNodeDto,
    projectPath: String,
    onOpenWorkspace: () -> Unit,
    onCreateWorkspace: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().height(42.dp).padding(start = 10.dp, end = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SemanticIconBadge(
            spec = semanticFileIconSpec(root.name, isDirectory = true),
            contentDescription = null,
            size = 24.dp,
        )
        Spacer(Modifier.width(7.dp))
        Column(Modifier.weight(1f)) {
            Text(root.name, color = Tx, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(
                projectPath.ifBlank { root.path },
                color = Tx3,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IdeActionButton(Feather.Folder, "打开项目", onOpenWorkspace)
        IdeActionButton(Feather.FolderPlus, "新建项目", onCreateWorkspace)
    }
}

@Composable
private fun ProjectSearchField(
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
        modifier = modifier.height(30.dp).clip(AppShapes.xs).background(Bg0)
            .border(1.dp, Line2, AppShapes.xs).padding(horizontal = 8.dp),
        decorationBox = { innerTextField ->
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(6.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isBlank()) Text("搜索文件", color = Tx3, fontSize = 10.sp)
                    innerTextField()
                }
                if (value.isNotEmpty()) {
                    Box(
                        Modifier.size(20.dp).clip(AppShapes.xs).clickable { onValueChange("") },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Feather.X, "清除搜索", tint = Tx3, modifier = Modifier.size(12.dp))
                    }
                }
            }
        },
    )
}

@Composable
private fun ProjectNotice(isLoading: Boolean, error: String?, onRefresh: () -> Unit) {
    if (isLoading) {
        InlineLoadingState(
            text = "正在刷新文件索引…",
            modifier = Modifier.fillMaxWidth().background(ControlBlue.withAlpha(0.07f)),
            color = ControlBlue,
            minHeight = 30.dp,
        )
    } else {
        Row(
            Modifier.fillMaxWidth().background(ErrLight.withAlpha(0.08f)).padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(error.orEmpty(), color = ErrLight, fontSize = 9.sp, maxLines = 2, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(6.dp))
            Text("重试", color = ErrLight, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onRefresh))
        }
    }
}

private fun countProjectFiles(node: FileNodeDto): Int =
    if (node.isDirectory) node.children.sumOf(::countProjectFiles) else 1
