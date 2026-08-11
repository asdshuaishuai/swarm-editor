package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.backend.lsp.SourceLocation
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.ActionTone
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.swarmeditor.desktop.viewmodel.ProjectViewModel

@Composable
fun FileExplorerView(
    tree: FileNodeDto?,
    isLoading: Boolean,
    error: String? = null,
    onRefresh: () -> Unit,
    gitStatus: GitStatusDto = GitStatusDto(),
    filePreview: ProjectViewModel.FilePreviewState = ProjectViewModel.FilePreviewState(),
    openFiles: List<String> = emptyList(),
    dirtyPaths: Set<String> = emptySet(),
    canNavigateBack: Boolean = false,
    canNavigateForward: Boolean = false,
    onSelectFile: (String) -> Unit = {},
    onCloseFile: (String) -> Unit = {},
    onNavigateBack: () -> Unit = {},
    onNavigateForward: () -> Unit = {},
    onOpenDiff: (GitFileChangeDto) -> Unit = {},
    onOpenWorkspace: () -> Unit = {},
    onCreateWorkspace: () -> Unit = {},
    onInspectPosition: (Int, Int) -> Unit = { _, _ -> },
    onOpenDefinition: (SourceLocation) -> Unit = {},
    onDismissPositionInsight: () -> Unit = {},
    onBeginEdit: () -> Unit = {},
    onDraftChange: (String) -> Unit = {},
    onSaveEdit: () -> Unit = {},
    onCancelEdit: () -> Unit = {},
    projectPath: String = "",
    modifier: Modifier = Modifier,
) {
    val expandedDirectories = remember { mutableStateMapOf<String, Boolean>() }
    val treeListState = rememberLazyListState()
    var filterQuery by remember { mutableStateOf("") }

    LaunchedEffect(tree) {
        val root = tree ?: return@LaunchedEffect
        expandedDirectories[root.path] = true
    }
    LaunchedEffect(tree, filePreview.path) {
        val root = tree ?: return@LaunchedEffect
        val selectedPath = filePreview.path ?: return@LaunchedEffect
        ancestorDirectoryPaths(root, selectedPath).forEach { path -> expandedDirectories[path] = true }
    }

    val root = tree
    if (root == null) {
        MissingWorkspaceState(
            isLoading = isLoading,
            error = error,
            onRefresh = onRefresh,
            onOpenWorkspace = onOpenWorkspace,
            onCreateWorkspace = onCreateWorkspace,
            modifier = modifier,
        )
        return
    }

    Row(modifier.fillMaxSize().background(Bg0)) {
        ProjectToolWindow(
            root = root,
            projectPath = projectPath,
            selectedPath = filePreview.path,
            expandedDirectories = expandedDirectories,
            filterQuery = filterQuery,
            isLoading = isLoading,
            error = error,
            listState = treeListState,
            onFilterQueryChange = { filterQuery = it },
            onSelectFile = { onSelectFile(it.path) },
            onToggleDirectory = { path ->
                expandedDirectories[path] = expandedDirectories[path] != true
            },
            onCollapseAll = {
                expandedDirectories.clear()
                expandedDirectories[root.path] = true
            },
            onRefresh = onRefresh,
            onOpenWorkspace = onOpenWorkspace,
            onCreateWorkspace = onCreateWorkspace,
            modifier = Modifier.width(266.dp),
        )
        Box(Modifier.width(1.dp).fillMaxHeight().background(Line))
        EditorWorkspace(
            preview = filePreview,
            openFiles = openFiles,
            dirtyPaths = dirtyPaths,
            canNavigateBack = canNavigateBack,
            canNavigateForward = canNavigateForward,
            change = gitStatus.changes.firstOrNull { it.path == filePreview.path },
            onSelectFile = onSelectFile,
            onCloseFile = onCloseFile,
            onNavigateBack = onNavigateBack,
            onNavigateForward = onNavigateForward,
            onOpenDiff = onOpenDiff,
            onInspectPosition = onInspectPosition,
            onOpenDefinition = onOpenDefinition,
            onDismissPositionInsight = onDismissPositionInsight,
            onBeginEdit = onBeginEdit,
            onDraftChange = onDraftChange,
            onSaveEdit = onSaveEdit,
            onCancelEdit = onCancelEdit,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MissingWorkspaceState(
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenWorkspace: () -> Unit,
    onCreateWorkspace: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().background(Bg0),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        SemanticIconBadge(
            spec = semanticFileIconSpec("workspace", isDirectory = true),
            contentDescription = null,
            size = 52.dp,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            text = when {
                isLoading -> "正在载入项目"
                !error.isNullOrBlank() -> "项目无法打开"
                else -> "打开一个项目开始工作"
            },
            color = Tx,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = error ?: "文件索引、源码高亮和智能导航将在本地进程内完成。",
            color = if (error == null) Tx3 else ErrLight,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton(text = "打开项目", prominent = true, onClick = onOpenWorkspace)
            ActionButton(
                text = "新建项目",
                tone = ActionTone.SECONDARY,
                prominent = false,
                onClick = onCreateWorkspace,
            )
            if (!error.isNullOrBlank()) {
                ActionButton(text = "重试", prominent = false, onClick = onRefresh)
            }
        }
    }
}
