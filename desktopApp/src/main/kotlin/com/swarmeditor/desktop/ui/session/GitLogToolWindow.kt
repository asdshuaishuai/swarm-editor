package com.swarmeditor.desktop.ui.session

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.api.GitCommitDto
import com.swarmeditor.desktop.api.GitHistoryDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.ControlGreen
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.ui.common.IdeActionButton
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.Search
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal fun filteredGitCommits(
    commits: List<GitCommitDto>,
    query: String,
    caseSensitive: Boolean,
    regex: Boolean = false,
): List<GitCommitDto> {
    val search = query.trim()
    if (search.isEmpty()) return commits
    val pattern = if (regex) {
        runCatching {
            Regex(search, if (caseSensitive) emptySet() else setOf(RegexOption.IGNORE_CASE))
        }.getOrNull() ?: return emptyList()
    } else {
        null
    }
    return commits.filter { commit ->
        listOf(
            commit.subject,
            commit.authorName,
            commit.authorEmail,
            commit.hash,
            commit.shortHash,
            commit.refs.joinToString(" "),
        ).any { value ->
            pattern?.containsMatchIn(value) ?: value.contains(search, ignoreCase = !caseSensitive)
        }
    }
}

internal fun gitLogRegexError(query: String, caseSensitive: Boolean, regex: Boolean): String? {
    if (!regex || query.isBlank()) return null
    return runCatching {
        Regex(query, if (caseSensitive) emptySet() else setOf(RegexOption.IGNORE_CASE))
    }.exceptionOrNull()?.message
}

internal fun formatGitCommitTimestamp(
    epochSeconds: Long,
    zoneId: ZoneId = ZoneId.systemDefault(),
): String {
    if (epochSeconds <= 0L) return "—"
    return Instant.ofEpochSecond(epochSeconds)
        .atZone(zoneId)
        .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ROOT))
}

@Composable
internal fun GitLogToolWindow(
    history: GitHistoryDto,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    var caseSensitive by remember { mutableStateOf(false) }
    var regex by remember { mutableStateOf(false) }
    var selectedIndex by remember { mutableIntStateOf(0) }
    val listState = rememberLazyListState()
    val visibleCommits = remember(history.commits, query, caseSensitive, regex) {
        filteredGitCommits(history.commits, query, caseSensitive, regex)
    }
    val regexError = remember(query, caseSensitive, regex) { gitLogRegexError(query, caseSensitive, regex) }
    val selectedCommit = visibleCommits.getOrNull(selectedIndex)

    LaunchedEffect(visibleCommits) {
        selectedIndex = selectedIndex.coerceIn(0, visibleCommits.lastIndex.coerceAtLeast(0))
    }
    LaunchedEffect(selectedIndex, visibleCommits) {
        if (selectedIndex in visibleCommits.indices) listState.animateScrollToItem(selectedIndex)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg0)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || visibleCommits.isEmpty()) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionDown -> {
                        selectedIndex = (selectedIndex + 1).coerceAtMost(visibleCommits.lastIndex)
                        true
                    }
                    Key.DirectionUp -> {
                        selectedIndex = (selectedIndex - 1).coerceAtLeast(0)
                        true
                    }
                    else -> false
                }
            },
    ) {
        Row(
            Modifier.fillMaxWidth().height(36.dp).background(Bg1).padding(horizontal = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (query.isEmpty()) Text("筛选提交、作者或引用", color = Tx3, style = AppType.micro)
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(color = Tx, fontSize = AppType.caption.fontSize),
                    cursorBrush = SolidColor(Ac),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            GitLogOptionToggle("Aa", caseSensitive) { caseSensitive = !caseSensitive }
            Spacer(Modifier.width(3.dp))
            GitLogOptionToggle(".*", regex) { regex = !regex }
            Spacer(Modifier.width(3.dp))
            IdeActionButton(
                icon = Feather.RefreshCw,
                contentDescription = "刷新 Git 日志",
                enabled = !isLoading,
                onClick = onRefresh,
            )
        }
        Row(
            Modifier.fillMaxWidth().height(25.dp).background(Bg2).border(1.dp, Line).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val countSuffix = if (history.truncated) "+" else ""
            Text(
                regexError?.let { "正则表达式无效" } ?: "${visibleCommits.size}$countSuffix 个提交",
                color = if (regexError == null) Tx3 else AgentGemini,
                style = AppType.micro,
            )
            Spacer(Modifier.weight(1f))
            if (isLoading) Text("加载中…", color = Ac, style = AppType.micro)
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            itemsIndexed(visibleCommits, key = { _, commit -> commit.hash }) { index, commit ->
                GitCommitRow(
                    commit = commit,
                    selected = index == selectedIndex,
                    first = index == 0,
                    last = index == visibleCommits.lastIndex,
                    onClick = { selectedIndex = index },
                )
            }
            if (visibleCommits.isEmpty()) {
                item("empty") {
                    Box(Modifier.fillMaxWidth().height(140.dp), contentAlignment = Alignment.Center) {
                        Text(
                            when {
                                isLoading -> "正在加载提交历史…"
                                regexError != null -> "修正正则表达式后继续筛选"
                                history.commits.isEmpty() -> "仓库中还没有提交"
                                else -> "没有匹配的提交"
                            },
                            color = Tx3,
                            style = AppType.caption,
                        )
                    }
                }
            }
        }
        selectedCommit?.let { commit -> GitCommitDetails(commit) }
    }
}

@Composable
private fun GitCommitRow(
    commit: GitCommitDto,
    selected: Boolean,
    first: Boolean,
    last: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(if (selected) Ac.withAlpha(0.13f) else Bg0)
            .clickable(onClick = onClick)
            .padding(end = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GitGraphMarker(
            merge = commit.parentHashes.size > 1,
            selected = selected,
            first = first,
            last = last,
        )
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                commit.refs.firstOrNull()?.let { ref ->
                    GitRefChip(ref)
                    Spacer(Modifier.width(5.dp))
                }
                Text(
                    commit.subject,
                    color = if (selected) Tx else Tx2,
                    style = AppType.caption,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(commit.shortHash, color = Ac, style = AppType.micro.copy(fontFamily = CodeFont))
                Spacer(Modifier.width(6.dp))
                Text(
                    commit.authorName,
                    color = Tx3,
                    style = AppType.micro,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(formatGitCommitTimestamp(commit.authoredAtEpochSeconds), color = Tx3, style = AppType.micro)
            }
        }
    }
}

@Composable
private fun GitGraphMarker(
    merge: Boolean,
    selected: Boolean,
    first: Boolean,
    last: Boolean,
) {
    Canvas(Modifier.width(28.dp).height(48.dp)) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val lineColor = if (selected) Ac.withAlpha(0.55f) else Line2
        drawLine(
            color = lineColor,
            start = Offset(center.x, if (first) center.y else 0f),
            end = Offset(center.x, if (last) center.y else size.height),
            strokeWidth = 1.5f,
        )
        drawCircle(color = if (selected) Ac else Tx3, radius = 4.3f, center = center)
        if (merge) {
            drawCircle(color = AgentGemini, radius = 7.2f, center = center, style = Stroke(width = 1.4f))
        }
    }
}

@Composable
private fun GitCommitDetails(commit: GitCommitDto) {
    Column(
        Modifier.fillMaxWidth().background(Bg1).border(1.dp, Line).padding(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Text(commit.subject, color = Tx, style = AppType.caption, fontWeight = FontWeight.SemiBold, maxLines = 2)
        Spacer(Modifier.height(4.dp))
        Text(
            "${commit.authorName} <${commit.authorEmail}>",
            color = Tx3,
            style = AppType.micro,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(3.dp))
        Text(commit.hash, color = Ac, style = AppType.micro.copy(fontFamily = CodeFont), maxLines = 1)
        if (commit.refs.isNotEmpty()) {
            Spacer(Modifier.height(3.dp))
            Text(commit.refs.joinToString("  "), color = ControlGreen, style = AppType.micro, maxLines = 1)
        }
    }
}

@Composable
private fun GitRefChip(ref: String) {
    val isTag = ref.startsWith("tag:")
    Text(
        ref.removePrefix("tag: ").removePrefix("HEAD -> "),
        color = if (isTag) AgentGemini else ControlGreen,
        style = AppType.micro,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .background((if (isTag) AgentGemini else ControlGreen).withAlpha(0.12f))
            .border(1.dp, (if (isTag) AgentGemini else ControlGreen).withAlpha(0.28f), RoundedCornerShape(3.dp))
            .padding(horizontal = 4.dp, vertical = 1.dp),
    )
}

@Composable
private fun GitLogOptionToggle(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (selected) Ac.withAlpha(0.16f) else Bg2)
            .border(1.dp, if (selected) Ac else Line2, RoundedCornerShape(4.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected) Ac else Tx3, style = AppType.micro, fontWeight = FontWeight.Bold)
    }
}
