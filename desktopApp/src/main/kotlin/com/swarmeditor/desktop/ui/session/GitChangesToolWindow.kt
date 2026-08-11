package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.ActionTone
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.ControlGreen
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.swarmeditor.desktop.ui.common.IdeListRow
import com.swarmeditor.desktop.ui.common.IdeSectionHeader
import com.swarmeditor.desktop.ui.common.IdeToolWindowHeader
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Check
import com.woowla.compose.icon.collections.feather.feather.ChevronDown
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import com.woowla.compose.icon.collections.feather.feather.List
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.X

private enum class GitChangeGroup(val title: String) {
    STAGED("已暂存"),
    MODIFIED("未暂存"),
    UNTRACKED("未跟踪"),
}

internal enum class GitChangesGrouping {
    DIRECTORY,
    FLAT,
}

internal sealed interface GitChangeTreeEntry {
    val depth: Int

    data class Directory(
        val path: String,
        val label: String,
        val changeCount: Int,
        override val depth: Int,
    ) : GitChangeTreeEntry

    data class File(
        val change: GitFileChangeDto,
        val showParentPath: Boolean,
        override val depth: Int,
    ) : GitChangeTreeEntry
}

internal fun gitChangeTreeEntries(
    changes: List<GitFileChangeDto>,
    grouping: GitChangesGrouping,
    collapsedDirectories: Set<String> = emptySet(),
): List<GitChangeTreeEntry> {
    if (grouping == GitChangesGrouping.FLAT) {
        return changes
            .sortedWith(compareBy({ it.name.lowercase() }, { it.path.lowercase() }))
            .map { change -> GitChangeTreeEntry.File(change, showParentPath = true, depth = 0) }
    }

    val root = MutableGitDirectory(name = "", path = "")
    changes.forEach { change ->
        val segments = change.path.replace('\\', '/').split('/').filter(String::isNotBlank)
        var directory = root
        segments.dropLast(1).forEach { segment ->
            val childPath = listOf(directory.path, segment).filter(String::isNotBlank).joinToString("/")
            directory = directory.directories.getOrPut(segment) { MutableGitDirectory(segment, childPath) }
        }
        directory.files += change
    }

    return buildList {
        fun emitContents(directory: MutableGitDirectory, depth: Int) {
            directory.directories.values.sortedBy { it.name.lowercase() }.forEach { initialDirectory ->
                var compacted = initialDirectory
                val labels = mutableListOf(initialDirectory.name)
                while (compacted.files.isEmpty() && compacted.directories.size == 1) {
                    compacted = compacted.directories.values.single()
                    labels += compacted.name
                }
                add(
                    GitChangeTreeEntry.Directory(
                        path = compacted.path,
                        label = labels.joinToString("/"),
                        changeCount = compacted.totalChangeCount(),
                        depth = depth,
                    ),
                )
                if (compacted.path !in collapsedDirectories) emitContents(compacted, depth + 1)
            }
            directory.files
                .sortedWith(compareBy({ it.name.lowercase() }, { it.path.lowercase() }))
                .forEach { change ->
                    add(GitChangeTreeEntry.File(change, showParentPath = false, depth = depth))
                }
        }
        emitContents(root, depth = 0)
    }
}

private class MutableGitDirectory(
    val name: String,
    val path: String,
) {
    val directories = linkedMapOf<String, MutableGitDirectory>()
    val files = mutableListOf<GitFileChangeDto>()

    fun totalChangeCount(): Int = files.size + directories.values.sumOf(MutableGitDirectory::totalChangeCount)
}

private fun gitChangeSelectionKey(staged: Boolean, path: String): String =
    "${if (staged) "staged" else "unstaged"}:$path"

@Composable
internal fun GitChangesToolWindow(
    gitStatus: GitStatusDto,
    isBusy: Boolean,
    commitMessage: String,
    onCommitMessageChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onStageFile: (String) -> Unit,
    onStageAll: (Collection<String>) -> Unit,
    onUnstageFile: (String) -> Unit,
    onUnstageAll: (Collection<String>) -> Unit,
    onCommit: () -> Unit,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    val staged = remember(gitStatus.changes) { gitStatus.changes.filter(GitFileChangeDto::hasStagedChanges) }
    val modified = remember(gitStatus.changes) {
        gitStatus.changes.filter { it.hasUnstagedChanges && !it.isUntracked }
    }
    val untracked = remember(gitStatus.changes) { gitStatus.changes.filter(GitFileChangeDto::isUntracked) }
    var stagedExpanded by remember { mutableStateOf(true) }
    var modifiedExpanded by remember { mutableStateOf(true) }
    var untrackedExpanded by remember { mutableStateOf(true) }
    var selectedChangeKey by remember { mutableStateOf<String?>(null) }
    var includedChangeKeys by remember { mutableStateOf<Set<String>>(emptySet()) }
    var grouping by remember { mutableStateOf(GitChangesGrouping.DIRECTORY) }
    var stagedCollapsed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var modifiedCollapsed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var untrackedCollapsed by remember { mutableStateOf<Set<String>>(emptySet()) }
    val stagedEntries = remember(staged, grouping, stagedCollapsed) {
        gitChangeTreeEntries(staged, grouping, stagedCollapsed)
    }
    val modifiedEntries = remember(modified, grouping, modifiedCollapsed) {
        gitChangeTreeEntries(modified, grouping, modifiedCollapsed)
    }
    val untrackedEntries = remember(untracked, grouping, untrackedCollapsed) {
        gitChangeTreeEntries(untracked, grouping, untrackedCollapsed)
    }
    val selectedStaged = remember(staged, includedChangeKeys) {
        staged.filter { gitChangeSelectionKey(staged = true, it.path) in includedChangeKeys }
    }
    val selectedUnstaged = remember(modified, untracked, includedChangeKeys) {
        (modified + untracked).filter { gitChangeSelectionKey(staged = false, it.path) in includedChangeKeys }
    }
    val stageTargets = if (includedChangeKeys.isEmpty()) modified + untracked else selectedUnstaged
    val unstageTargets = if (includedChangeKeys.isEmpty()) staged else selectedStaged

    LaunchedEffect(gitStatus.changes) {
        val validKeys = buildSet {
            staged.forEach { add(gitChangeSelectionKey(staged = true, it.path)) }
            (modified + untracked).forEach { add(gitChangeSelectionKey(staged = false, it.path)) }
        }
        includedChangeKeys = includedChangeKeys.intersect(validKeys)
        if (selectedChangeKey !in validKeys) selectedChangeKey = null
    }

    Column(modifier.fillMaxSize().background(Bg1)) {
        IdeToolWindowHeader(
            title = "版本控制",
            detail = includedChangeKeys.takeIf { it.isNotEmpty() }
                ?.let { "已选择 ${it.size} 项" }
                ?: gitStatus.branch.ifBlank { "Git" },
            actions = {
                IdeActionButton(
                    icon = if (grouping == GitChangesGrouping.DIRECTORY) Feather.List else Feather.Folder,
                    contentDescription = if (grouping == GitChangesGrouping.DIRECTORY) "平铺显示变更" else "按目录显示变更",
                    tint = Ac,
                    onClick = {
                        grouping = if (grouping == GitChangesGrouping.DIRECTORY) {
                            GitChangesGrouping.FLAT
                        } else {
                            GitChangesGrouping.DIRECTORY
                        }
                    },
                )
                IdeActionButton(
                    icon = Feather.RefreshCw,
                    contentDescription = "刷新 Git 状态",
                    enabled = !isBusy,
                    onClick = onRefresh,
                )
                IdeActionButton(
                    icon = Feather.Check,
                    contentDescription = if (includedChangeKeys.isEmpty()) "全部暂存" else "暂存所选变更",
                    enabled = !isBusy && stageTargets.isNotEmpty(),
                    tint = AgentGemini,
                    onClick = { onStageAll(stageTargets.map(GitFileChangeDto::path).distinct()) },
                )
                IdeActionButton(
                    icon = Feather.X,
                    contentDescription = if (includedChangeKeys.isEmpty()) "全部取消暂存" else "取消暂存所选变更",
                    enabled = !isBusy && unstageTargets.isNotEmpty(),
                    tint = ErrLight,
                    onClick = { onUnstageAll(unstageTargets.map(GitFileChangeDto::path)) },
                )
            },
        )

        if (!gitStatus.isRepository) {
            GitMissingRepositoryState(Modifier.weight(1f))
            return@Column
        }

        GitBranchSummary(gitStatus)
        LazyColumn(Modifier.weight(1f).fillMaxWidth().background(Bg0)) {
            if (staged.isNotEmpty()) {
                item(key = "staged-header") {
                    GitChangeGroupHeader(
                        group = GitChangeGroup.STAGED,
                        changes = staged,
                        expanded = stagedExpanded,
                        onToggle = { stagedExpanded = !stagedExpanded },
                        action = { onUnstageAll(staged.map(GitFileChangeDto::path)) },
                    )
                }
                if (stagedExpanded) {
                    items(stagedEntries, key = { entry -> "staged:${entry.entryKey}" }) { entry ->
                        GitChangeTreeEntryRow(
                            entry = entry,
                            staged = true,
                            collapsedDirectories = stagedCollapsed,
                            onToggleDirectory = { path -> stagedCollapsed = stagedCollapsed.toggle(path) },
                            selectedChangeKey = selectedChangeKey,
                            includedChangeKeys = includedChangeKeys,
                            onSelectedChange = { selectedChangeKey = it },
                            onIncludedChanges = { includedChangeKeys = it },
                            onOpenDiff = onOpenDiff,
                            onStageFile = onStageFile,
                            onUnstageFile = onUnstageFile,
                        )
                    }
                }
            }
            if (modified.isNotEmpty()) {
                item(key = "modified-header") {
                    GitChangeGroupHeader(
                        group = GitChangeGroup.MODIFIED,
                        changes = modified,
                        expanded = modifiedExpanded,
                        onToggle = { modifiedExpanded = !modifiedExpanded },
                        action = { onStageAll(modified.map(GitFileChangeDto::path)) },
                    )
                }
                if (modifiedExpanded) {
                    items(modifiedEntries, key = { entry -> "modified:${entry.entryKey}" }) { entry ->
                        GitChangeTreeEntryRow(
                            entry = entry,
                            staged = false,
                            collapsedDirectories = modifiedCollapsed,
                            onToggleDirectory = { path -> modifiedCollapsed = modifiedCollapsed.toggle(path) },
                            selectedChangeKey = selectedChangeKey,
                            includedChangeKeys = includedChangeKeys,
                            onSelectedChange = { selectedChangeKey = it },
                            onIncludedChanges = { includedChangeKeys = it },
                            onOpenDiff = onOpenDiff,
                            onStageFile = onStageFile,
                            onUnstageFile = onUnstageFile,
                        )
                    }
                }
            }
            if (untracked.isNotEmpty()) {
                item(key = "untracked-header") {
                    GitChangeGroupHeader(
                        group = GitChangeGroup.UNTRACKED,
                        changes = untracked,
                        expanded = untrackedExpanded,
                        onToggle = { untrackedExpanded = !untrackedExpanded },
                        action = { onStageAll(untracked.map(GitFileChangeDto::path)) },
                    )
                }
                if (untrackedExpanded) {
                    items(untrackedEntries, key = { entry -> "untracked:${entry.entryKey}" }) { entry ->
                        GitChangeTreeEntryRow(
                            entry = entry,
                            staged = false,
                            collapsedDirectories = untrackedCollapsed,
                            onToggleDirectory = { path -> untrackedCollapsed = untrackedCollapsed.toggle(path) },
                            selectedChangeKey = selectedChangeKey,
                            includedChangeKeys = includedChangeKeys,
                            onSelectedChange = { selectedChangeKey = it },
                            onIncludedChanges = { includedChangeKeys = it },
                            onOpenDiff = onOpenDiff,
                            onStageFile = onStageFile,
                            onUnstageFile = onUnstageFile,
                        )
                    }
                }
            }
            if (gitStatus.changes.isEmpty()) {
                item(key = "clean") { GitCleanState() }
            }
        }

        GitCommitArea(
            message = commitMessage,
            stagedCount = staged.size,
            isBusy = isBusy,
            onMessageChange = onCommitMessageChange,
            onCommit = onCommit,
        )
    }
}

@Composable
private fun GitBranchSummary(status: GitStatusDto) {
    Row(
        modifier = Modifier.fillMaxWidth().height(30.dp).background(Bg2).border(1.dp, Line).padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Feather.GitBranch, null, tint = ControlGreen, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(status.branch.ifBlank { "detached HEAD" }, color = Tx2, style = AppType.caption, fontFamily = CodeFont)
        Spacer(Modifier.weight(1f))
        if (status.ahead > 0) Text("↑${status.ahead}", color = AgentGemini, style = AppType.micro)
        if (status.behind > 0) {
            Spacer(Modifier.width(6.dp))
            Text("↓${status.behind}", color = Ac, style = AppType.micro)
        }
        Spacer(Modifier.width(8.dp))
        Text("${status.changes.size} 个文件", color = Tx3, style = AppType.micro)
    }
}

@Composable
private fun GitChangeGroupHeader(
    group: GitChangeGroup,
    changes: List<GitFileChangeDto>,
    expanded: Boolean,
    onToggle: () -> Unit,
    action: (() -> Unit)?,
) {
    IdeSectionHeader(
        title = group.title,
        count = changes.size,
        expanded = expanded,
        onToggle = onToggle,
        actions = {
            action?.let {
                IdeActionButton(
                    icon = if (group == GitChangeGroup.STAGED) Feather.X else Feather.Check,
                    contentDescription = if (group == GitChangeGroup.STAGED) "取消暂存此组" else "暂存此组",
                    onClick = it,
                    tint = if (group == GitChangeGroup.STAGED) ErrLight else AgentGemini,
                )
            }
        },
    )
}

private val GitChangeTreeEntry.entryKey: String
    get() = when (this) {
        is GitChangeTreeEntry.Directory -> "directory:$path"
        is GitChangeTreeEntry.File -> "file:${change.path}"
    }

private fun Set<String>.toggle(value: String): Set<String> =
    if (value in this) this - value else this + value

@Composable
private fun GitChangeTreeEntryRow(
    entry: GitChangeTreeEntry,
    staged: Boolean,
    collapsedDirectories: Set<String>,
    onToggleDirectory: (String) -> Unit,
    selectedChangeKey: String?,
    includedChangeKeys: Set<String>,
    onSelectedChange: (String) -> Unit,
    onIncludedChanges: (Set<String>) -> Unit,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onStageFile: (String) -> Unit,
    onUnstageFile: (String) -> Unit,
) {
    when (entry) {
        is GitChangeTreeEntry.Directory -> GitDirectoryRow(
            directory = entry,
            expanded = entry.path !in collapsedDirectories,
            onToggle = { onToggleDirectory(entry.path) },
        )
        is GitChangeTreeEntry.File -> {
            val selectionKey = gitChangeSelectionKey(staged, entry.change.path)
            GitChangeRow(
                change = entry.change,
                staged = staged,
                depth = entry.depth,
                showParentPath = entry.showParentPath,
                selected = selectedChangeKey == selectionKey,
                included = selectionKey in includedChangeKeys,
                onToggleIncluded = { onIncludedChanges(includedChangeKeys.toggle(selectionKey)) },
                onOpenDiff = {
                    onSelectedChange(selectionKey)
                    onOpenDiff(it)
                },
                onStageFile = onStageFile,
                onUnstageFile = onUnstageFile,
            )
        }
    }
}

@Composable
private fun GitDirectoryRow(
    directory: GitChangeTreeEntry.Directory,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(27.dp)
            .clickable(onClick = onToggle)
            .padding(start = (directory.depth * 14 + 5).dp, end = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (expanded) Feather.ChevronDown else Feather.ChevronRight,
            null,
            tint = Tx3,
            modifier = Modifier.size(13.dp),
        )
        Spacer(Modifier.width(3.dp))
        Icon(Feather.Folder, null, tint = Ac.withAlpha(0.82f), modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            directory.label,
            color = Tx2,
            style = AppType.caption,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(directory.changeCount.toString(), color = Tx3, style = AppType.micro)
    }
}

@Composable
private fun GitChangeRow(
    change: GitFileChangeDto,
    staged: Boolean,
    depth: Int,
    showParentPath: Boolean,
    selected: Boolean,
    included: Boolean,
    onToggleIncluded: () -> Unit,
    onOpenDiff: (GitFileChangeDto) -> Unit,
    onStageFile: (String) -> Unit,
    onUnstageFile: (String) -> Unit,
) {
    val icon = remember(change.path) { semanticFileIconSpec(change.path) }
    val scopedChange = remember(change, staged) {
        if (staged) {
            change.copy(
                added = change.stagedAdded,
                removed = change.stagedRemoved,
                diffLines = change.stagedDiffLines,
            )
        } else {
            change.copy(
                added = change.unstagedAdded,
                removed = change.unstagedRemoved,
                diffLines = change.unstagedDiffLines,
            )
        }
    }
    IdeListRow(
        onClick = { onOpenDiff(scopedChange) },
        selected = selected,
        modifier = Modifier.padding(start = (depth * 14 + 3).dp, end = 3.dp),
        leading = {
            GitInclusionToggle(
                included = included,
                contentDescription = if (included) "从批量操作中移除 ${change.name}" else "加入批量操作 ${change.name}",
                onClick = onToggleIncluded,
            )
            Spacer(Modifier.width(6.dp))
            Icon(icon.imageVector, null, tint = icon.accent, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
        },
        content = {
            Text(
                change.name,
                color = Tx,
                style = AppType.caption,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val parent = change.path.substringBeforeLast('/', "")
            if (showParentPath && parent.isNotEmpty()) {
                Spacer(Modifier.width(7.dp))
                Text(
                    parent,
                    color = Tx3,
                    style = AppType.micro,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 84.dp),
                )
            }
        },
        trailing = {
            Spacer(Modifier.width(7.dp))
            GitStatusLetter(change)
            if (scopedChange.added > 0) {
                Spacer(Modifier.width(5.dp))
                Text("+${scopedChange.added}", color = AgentGemini, style = AppType.micro.copy(fontFamily = CodeFont))
            }
            if (scopedChange.removed > 0) {
                Spacer(Modifier.width(4.dp))
                Text("-${scopedChange.removed}", color = ErrLight, style = AppType.micro.copy(fontFamily = CodeFont))
            }
            Spacer(Modifier.width(4.dp))
            IdeActionButton(
                icon = if (staged) Feather.X else Feather.Check,
                contentDescription = if (staged) "取消暂存 ${change.name}" else "暂存 ${change.name}",
                tint = if (staged) ErrLight else AgentGemini,
                onClick = { if (staged) onUnstageFile(change.path) else onStageFile(change.path) },
            )
        },
    )
}

@Composable
private fun GitInclusionToggle(
    included: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(14.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(if (included) Ac.withAlpha(0.2f) else Color.Transparent)
            .border(1.dp, if (included) Ac else Line2, RoundedCornerShape(3.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (included) {
            Icon(Feather.Check, contentDescription, tint = Ac, modifier = Modifier.size(10.dp))
        }
    }
}

@Composable
private fun GitStatusLetter(change: GitFileChangeDto) {
    val (label, color) = when {
        change.isUntracked -> "U" to Ac
        change.status == "A" -> "A" to AgentGemini
        change.status == "D" -> "D" to ErrLight
        change.status == "R" -> "R" to Ac
        else -> "M" to Color(0xFFE6B566)
    }
    Text(label, color = color, style = AppType.micro.copy(fontFamily = CodeFont), fontWeight = FontWeight.Bold)
}

@Composable
private fun GitCommitArea(
    message: String,
    stagedCount: Int,
    isBusy: Boolean,
    onMessageChange: (String) -> Unit,
    onCommit: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val canCommit = !isBusy && stagedCount > 0 && message.isNotBlank()
    Column(
        modifier = Modifier.fillMaxWidth().background(Bg2).border(1.dp, Line).padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("提交", color = Tx2, style = AppType.caption, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("$stagedCount 个已暂存文件", color = Tx3, style = AppType.micro)
        }
        BasicTextField(
            value = message,
            onValueChange = onMessageChange,
            enabled = !isBusy,
            interactionSource = interaction,
            cursorBrush = SolidColor(Ac),
            textStyle = AppType.caption.copy(color = Tx),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp, max = 100.dp)
                .clip(RoundedCornerShape(5.dp))
                .background(Bg0)
                .border(1.dp, if (focused) Ac else Line2, RoundedCornerShape(5.dp))
                .onPreviewKeyEvent { event ->
                    val shortcut = event.type == KeyEventType.KeyDown &&
                        event.key == Key.Enter &&
                        (event.isCtrlPressed || event.isMetaPressed)
                    if (shortcut && canCommit) {
                        onCommit()
                        true
                    } else {
                        false
                    }
                }
                .padding(8.dp),
            decorationBox = { field ->
                Box(Modifier.fillMaxSize()) {
                    if (message.isBlank()) {
                        Text("提交信息…", color = Tx3, style = AppType.caption)
                    }
                    field()
                }
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("仅提交已暂存变更", color = Tx3, style = AppType.micro)
            Spacer(Modifier.weight(1f))
            ActionButton(
                text = if (isBusy) "处理中…" else "提交",
                tone = ActionTone.PRIMARY,
                compact = true,
                enabled = canCommit,
                onClick = onCommit,
            )
        }
    }
}

@Composable
private fun GitMissingRepositoryState(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("当前工作区不是 Git 仓库", color = Tx2, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text("打开包含 .git 的项目后，这里会显示 Changes 与 Commit 工作流。", color = Tx3, style = AppType.caption)
    }
}

@Composable
private fun GitCleanState() {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(16.dp)).background(ControlGreen.withAlpha(0.12f)), contentAlignment = Alignment.Center) {
            Icon(Feather.Check, null, tint = ControlGreen, modifier = Modifier.size(17.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text("工作区干净", color = Tx2, style = AppType.caption, fontWeight = FontWeight.Medium)
    }
}

private val GitFileChangeDto.name: String
    get() = path.substringAfterLast('/')
