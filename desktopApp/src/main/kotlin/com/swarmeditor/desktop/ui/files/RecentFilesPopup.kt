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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.OverlayDepth
import com.swarmeditor.desktop.theme.Scrim
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.ui.common.SemanticIconBadge
import com.swarmeditor.desktop.ui.common.semanticFileIconSpec
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Search
import java.util.Locale

internal fun filteredRecentFiles(files: List<String>, query: String): List<String> {
    val normalizedQuery = query.trim().lowercase(Locale.ROOT)
    if (normalizedQuery.isEmpty()) return files.distinct()
    return files.distinct().filter { path ->
        path.lowercase(Locale.ROOT).contains(normalizedQuery) ||
            path.fileName().lowercase(Locale.ROOT).contains(normalizedQuery)
    }
}

internal fun movedRecentFileIndex(current: Int, offset: Int, size: Int): Int {
    if (size <= 0) return 0
    return (current + offset).mod(size)
}

internal fun recentFilesShortcutLabel(osName: String): String =
    if (osName.contains("mac", ignoreCase = true)) "⌘E" else "Ctrl+E"

@Composable
internal fun RecentFilesPopup(
    recentFiles: List<String>,
    currentPath: String?,
    dirtyPaths: Set<String>,
    onDismiss: () -> Unit,
    onOpenFile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val listState = rememberLazyListState()
    var query by remember { mutableStateOf(TextFieldValue()) }
    var selectedIndex by remember { mutableIntStateOf(0) }
    val visibleFiles = remember(recentFiles, query.text) { filteredRecentFiles(recentFiles, query.text) }

    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    LaunchedEffect(visibleFiles) { selectedIndex = 0 }
    LaunchedEffect(selectedIndex, visibleFiles) {
        if (selectedIndex in visibleFiles.indices) listState.scrollToItem(selectedIndex)
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Scrim.copy(alpha = 0.34f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .padding(top = 112.dp)
                .width(620.dp)
                .shadow(
                    elevation = OverlayDepth.PRIMARY.elevation,
                    shape = AppShapes.sm,
                    ambientColor = Scrim.copy(alpha = 0.44f),
                    spotColor = Scrim.copy(alpha = 0.68f),
                )
                .clip(AppShapes.sm)
                .background(Bg1)
                .border(1.dp, Line2, AppShapes.sm)
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
                            selectedIndex = movedRecentFileIndex(selectedIndex, 1, visibleFiles.size)
                            true
                        }
                        Key.DirectionUp -> {
                            selectedIndex = movedRecentFileIndex(selectedIndex, -1, visibleFiles.size)
                            true
                        }
                        Key.Enter -> {
                            visibleFiles.getOrNull(selectedIndex)?.let(onOpenFile)
                            true
                        }
                        else -> false
                    }
                },
        ) {
            Row(
                Modifier.fillMaxWidth().height(38.dp).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("最近文件", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                ShortcutBadge(recentFilesShortcutLabel(System.getProperty("os.name").orEmpty()))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Row(
                Modifier.fillMaxWidth().height(42.dp).padding(horizontal = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (query.text.isEmpty()) {
                        Text("输入文件名或路径", color = Tx3, fontSize = 12.sp)
                    }
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        singleLine = true,
                        textStyle = TextStyle(color = Tx, fontSize = 12.sp),
                        cursorBrush = SolidColor(Ac),
                    )
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().heightIn(min = 88.dp, max = 360.dp).padding(vertical = 3.dp),
            ) {
                itemsIndexed(visibleFiles, key = { _, path -> path }) { index, path ->
                    RecentFileRow(
                        path = path,
                        selected = index == selectedIndex,
                        current = path == currentPath,
                        dirty = path in dirtyPaths,
                        onClick = { onOpenFile(path) },
                    )
                }
                if (visibleFiles.isEmpty()) {
                    item("empty") {
                        Box(Modifier.fillMaxWidth().height(88.dp), contentAlignment = Alignment.Center) {
                            Text(
                                if (recentFiles.isEmpty()) "尚无最近打开的文件" else "没有匹配的最近文件",
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
                Text("Enter 打开", color = Tx3, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Text("Esc 关闭", color = Tx3, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun RecentFileRow(
    path: String,
    selected: Boolean,
    current: Boolean,
    dirty: Boolean,
    onClick: () -> Unit,
) {
    val fileName = path.fileName()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .padding(horizontal = 4.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(if (selected) Ac.withAlpha(0.16f) else Bg1)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SemanticIconBadge(
            spec = semanticFileIconSpec(fileName),
            contentDescription = null,
            size = 26.dp,
        )
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    fileName,
                    color = if (selected) Tx else Tx2,
                    fontSize = 12.sp,
                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (dirty) {
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(6.dp).clip(RoundedCornerShape(50)).background(Ac))
                }
            }
            Text(
                path.parentPath().ifEmpty { "." },
                color = Tx3,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (current) {
            Text(
                "当前",
                color = Ac,
                fontSize = 9.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(AppShapes.xs)
                    .background(Ac.withAlpha(0.10f))
                    .border(1.dp, Ac.withAlpha(0.22f), AppShapes.xs)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun ShortcutBadge(label: String) {
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

private fun String.fileName(): String = substringAfterLast('/').substringAfterLast('\\')

private fun String.parentPath(): String {
    val normalized = replace('\\', '/')
    return normalized.substringBeforeLast('/', "")
}
