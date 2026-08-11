package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Scrim
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.swarmeditor.desktop.viewmodel.ProjectSearchUiState
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Search

internal fun findInFilesShortcutLabel(osName: String): String =
    if (osName.contains("mac", ignoreCase = true)) "⌘⇧F" else "Ctrl+Shift+F"

internal fun searchResultSummary(state: ProjectSearchUiState): String = when {
    state.isSearching -> "正在搜索…"
    state.error != null -> "搜索失败"
    state.query.isBlank() -> "输入文本以搜索整个项目"
    else -> {
        val fileCount = state.matches.asSequence().map(ProjectService.SearchMatch::path).distinct().count()
        val suffix = if (state.truncated) "+" else ""
        "${state.matches.size}$suffix 个匹配 · $fileCount 个文件 · 已扫描 ${state.filesSearched} 个文本文件"
    }
}

internal fun highlightedSearchLine(match: ProjectService.SearchMatch): AnnotatedString = buildAnnotatedString {
    append(match.lineText)
    if (match.startCharacter in 0..match.lineText.length && match.endCharacter in 0..match.lineText.length) {
        addStyle(
            SpanStyle(
                color = Ac,
                background = Ac.withAlpha(0.14f),
                fontWeight = FontWeight.SemiBold,
            ),
            match.startCharacter,
            match.endCharacter,
        )
    }
}

@Composable
internal fun FindInFilesPopup(
    state: ProjectSearchUiState,
    onQueryChange: (String) -> Unit,
    onToggleCaseSensitive: () -> Unit,
    onDismiss: () -> Unit,
    onOpenMatch: (ProjectService.SearchMatch) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val listState = rememberLazyListState()
    var selectedIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    LaunchedEffect(state.matches) { selectedIndex = 0 }
    LaunchedEffect(selectedIndex, state.matches) {
        if (selectedIndex in state.matches.indices) listState.scrollToItem(selectedIndex)
    }

    Box(
        modifier = modifier.fillMaxSize().background(Scrim.copy(alpha = 0.38f)).clickable(onClick = onDismiss),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .padding(top = 66.dp)
                .fillMaxWidth(0.76f)
                .widthIn(min = 640.dp, max = 920.dp)
                .shadow(24.dp, AppShapes.lg)
                .clip(AppShapes.lg)
                .background(Bg1)
                .border(1.dp, Line2, AppShapes.lg)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    when (event.key) {
                        Key.Escape -> {
                            onDismiss()
                            true
                        }
                        Key.DirectionDown -> {
                            selectedIndex = movedRecentFileIndex(selectedIndex, 1, state.matches.size)
                            true
                        }
                        Key.DirectionUp -> {
                            selectedIndex = movedRecentFileIndex(selectedIndex, -1, state.matches.size)
                            true
                        }
                        Key.Enter -> {
                            state.matches.getOrNull(selectedIndex)?.let(onOpenMatch)
                            true
                        }
                        else -> false
                    }
                },
        ) {
            Row(
                Modifier.fillMaxWidth().height(39.dp).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("在文件中查找", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                FindShortcutBadge(findInFilesShortcutLabel(System.getProperty("os.name").orEmpty()))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Row(
                Modifier.fillMaxWidth().height(44.dp).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (state.query.isEmpty()) Text("搜索项目中的文本", color = Tx3, fontSize = 12.sp)
                    BasicTextField(
                        value = state.query,
                        onValueChange = onQueryChange,
                        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        singleLine = true,
                        textStyle = TextStyle(color = Tx, fontSize = 12.sp),
                        cursorBrush = SolidColor(Ac),
                    )
                }
                Spacer(Modifier.width(8.dp))
                CaseSensitiveToggle(state.caseSensitive, onToggleCaseSensitive)
            }
            Row(
                Modifier.fillMaxWidth().height(29.dp).background(Bg0).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(searchResultSummary(state), color = if (state.error == null) Tx3 else Ac, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                if (state.truncated) Text("结果已达到显示上限", color = Tx3, fontSize = 10.sp)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 520.dp).padding(vertical = 4.dp),
            ) {
                itemsIndexed(
                    items = state.matches,
                    key = { index, match -> "${match.path}:${match.line}:${match.startCharacter}:$index" },
                ) { index, match ->
                    SearchMatchRow(
                        match = match,
                        showFileHeader = index == 0 || state.matches[index - 1].path != match.path,
                        selected = selectedIndex == index,
                        onClick = { onOpenMatch(match) },
                    )
                }
                if (state.matches.isEmpty()) {
                    item("empty") {
                        Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                            Text(
                                when {
                                    state.error != null -> state.error
                                    state.isSearching -> "正在扫描项目文本文件…"
                                    state.query.isBlank() -> "输入关键字开始搜索"
                                    else -> "未找到匹配文本"
                                },
                                color = Tx3,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Row(
                Modifier.fillMaxWidth().height(30.dp).background(Bg0).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("↑↓ 导航", color = Tx3, fontSize = 10.sp)
                Spacer(Modifier.width(14.dp))
                Text("Enter 打开匹配", color = Tx3, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Text("Esc 关闭", color = Tx3, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun SearchMatchRow(
    match: ProjectService.SearchMatch,
    showFileHeader: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val fileName = match.path.substringAfterLast('/')
    Column(Modifier.fillMaxWidth()) {
        if (showFileHeader) {
            Row(
                Modifier.fillMaxWidth().height(31.dp).background(Bg0).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SemanticIconBadge(semanticFileIconSpec(fileName), null, size = 22.dp)
                Spacer(Modifier.width(7.dp))
                Text(fileName, color = Tx2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(7.dp))
                Text(
                    match.path.substringBeforeLast('/', "."),
                    color = Tx3,
                    fontSize = 9.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 1.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(if (selected) Ac.withAlpha(0.15f) else Bg1)
                .clickable(onClick = onClick)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "${match.line + 1}",
                color = if (selected) Ac else Tx3,
                fontSize = 10.sp,
                fontFamily = CodeFont,
                modifier = Modifier.width(42.dp),
            )
            Text(
                highlightedSearchLine(match),
                color = Tx2,
                fontSize = 11.sp,
                fontFamily = CodeFont,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CaseSensitiveToggle(selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(27.dp)
            .clip(AppShapes.xs)
            .background(if (selected) Ac.withAlpha(0.18f) else Bg2)
            .border(1.dp, if (selected) Ac.withAlpha(0.65f) else Line, AppShapes.xs)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text("Aa", color = if (selected) Ac else Tx3, fontSize = 9.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun FindShortcutBadge(label: String) {
    Text(
        label,
        color = Tx3,
        fontSize = 9.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(AppShapes.xs)
            .background(Bg2)
            .border(1.dp, Line, AppShapes.xs)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
