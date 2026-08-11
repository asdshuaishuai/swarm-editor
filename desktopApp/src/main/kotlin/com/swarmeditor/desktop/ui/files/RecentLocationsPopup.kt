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
import com.swarmeditor.desktop.theme.CodeFont
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
import com.swarmeditor.desktop.viewmodel.EditorLocation
import com.swarmeditor.desktop.viewmodel.RecentEditorLocation
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Search
import java.util.Locale

internal fun filteredRecentLocations(
    locations: List<RecentEditorLocation>,
    query: String,
): List<RecentEditorLocation> {
    val normalized = query.trim().lowercase(Locale.ROOT)
    if (normalized.isEmpty()) return locations.distinctBy(RecentEditorLocation::location)
    return locations.distinctBy(RecentEditorLocation::location).filter { entry ->
        entry.location.path.lowercase(Locale.ROOT).contains(normalized) ||
            entry.snippet.lowercase(Locale.ROOT).contains(normalized)
    }
}

internal fun recentLocationsShortcutLabel(osName: String): String =
    if (osName.contains("mac", ignoreCase = true)) "⌘⇧E" else "Ctrl+Shift+E"

@Composable
internal fun RecentLocationsPopup(
    locations: List<RecentEditorLocation>,
    currentLocation: EditorLocation?,
    onDismiss: () -> Unit,
    onOpenLocation: (EditorLocation) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val listState = rememberLazyListState()
    var query by remember { mutableStateOf(TextFieldValue()) }
    var selectedIndex by remember { mutableIntStateOf(0) }
    val visibleLocations = remember(locations, query.text) { filteredRecentLocations(locations, query.text) }

    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    LaunchedEffect(visibleLocations) { selectedIndex = 0 }
    LaunchedEffect(selectedIndex, visibleLocations) {
        if (selectedIndex in visibleLocations.indices) listState.scrollToItem(selectedIndex)
    }

    Box(
        modifier = modifier.fillMaxSize().background(Scrim.copy(alpha = 0.36f)).clickable(onClick = onDismiss),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .padding(top = 82.dp)
                .width(700.dp)
                .shadow(
                    elevation = OverlayDepth.PRIMARY.elevation,
                    shape = AppShapes.sm,
                    ambientColor = Scrim.copy(alpha = 0.46f),
                    spotColor = Scrim.copy(alpha = 0.7f),
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
                            selectedIndex = movedRecentFileIndex(selectedIndex, 1, visibleLocations.size)
                            true
                        }
                        Key.DirectionUp -> {
                            selectedIndex = movedRecentFileIndex(selectedIndex, -1, visibleLocations.size)
                            true
                        }
                        Key.Enter -> {
                            visibleLocations.getOrNull(selectedIndex)?.location?.let(onOpenLocation)
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
                Text("最近位置", color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                RecentLocationShortcutBadge(recentLocationsShortcutLabel(System.getProperty("os.name").orEmpty()))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Row(
                Modifier.fillMaxWidth().height(42.dp).padding(horizontal = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Feather.Search, null, tint = Tx3, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (query.text.isEmpty()) Text("搜索文件路径或源码片段", color = Tx3, fontSize = 12.sp)
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
                modifier = Modifier.fillMaxWidth().heightIn(min = 108.dp, max = 500.dp).padding(vertical = 4.dp),
            ) {
                itemsIndexed(visibleLocations, key = { _, entry -> entry.location }) { index, entry ->
                    RecentLocationRow(
                        entry = entry,
                        selected = index == selectedIndex,
                        current = entry.location == currentLocation,
                        onClick = { onOpenLocation(entry.location) },
                    )
                }
                if (visibleLocations.isEmpty()) {
                    item("empty") {
                        Box(Modifier.fillMaxWidth().height(108.dp), contentAlignment = Alignment.Center) {
                            Text(
                                if (locations.isEmpty()) "尚无编辑器导航位置" else "没有匹配的位置",
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
                Text("Enter 打开位置", color = Tx3, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Text("Esc 关闭", color = Tx3, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun RecentLocationRow(
    entry: RecentEditorLocation,
    selected: Boolean,
    current: Boolean,
    onClick: () -> Unit,
) {
    val location = entry.location
    val fileName = location.path.substringAfterLast('/').substringAfterLast('\\')
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(if (selected) Ac.withAlpha(0.15f) else Bg1)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.Top,
    ) {
        SemanticIconBadge(semanticFileIconSpec(fileName), null, size = 28.dp)
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    fileName,
                    color = if (selected) Tx else Tx2,
                    fontSize = 12.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    maxLines = 1,
                )
                location.line?.let { line ->
                    Spacer(Modifier.width(6.dp))
                    Text(":${line + 1}", color = Ac, fontSize = 10.sp, fontFamily = CodeFont)
                }
                Spacer(Modifier.weight(1f))
                if (current) Text("当前", color = Ac, fontSize = 9.sp, fontWeight = FontWeight.Medium)
            }
            Text(
                location.path.substringBeforeLast('/', "."),
                color = Tx3,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (entry.snippet.isNotBlank()) {
                Text(
                    entry.snippet,
                    color = Tx2,
                    fontSize = 10.sp,
                    lineHeight = 14.sp,
                    fontFamily = CodeFont,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 5.dp)
                        .clip(AppShapes.xs)
                        .background(Bg0)
                        .border(1.dp, Line, AppShapes.xs)
                        .padding(horizontal = 7.dp, vertical = 5.dp),
                )
            }
        }
    }
}

@Composable
private fun RecentLocationShortcutBadge(label: String) {
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
