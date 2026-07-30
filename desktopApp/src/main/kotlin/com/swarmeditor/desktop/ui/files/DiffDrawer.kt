package com.swarmeditor.desktop.ui.files

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.HorizontalScrollbar
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollbarAdapter
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.Err
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Scrim
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.OkLight
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.fluidClickable
import kotlin.math.roundToInt

internal fun drawerMotionOffsetPx(width: Int): Int {
    if (width <= 0) return 0
    val minimum = minOf(width, 24)
    val maximum = minOf(width, 72)
    return (width * 0.08f).roundToInt().coerceIn(minimum, maximum)
}

@Composable
fun DiffDrawer(
    change: GitFileChangeDto?,
    onDismiss: () -> Unit,
    onStage: (String) -> Unit,
    onUnstage: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var displayedChange by remember { mutableStateOf(change) }
    val focusRequester = remember { FocusRequester() }
    val backdropInteraction = remember { MutableInteractionSource() }

    LaunchedEffect(change) {
        if (change != null) {
            displayedChange = change
            focusRequester.requestFocus()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .focusRequester(focusRequester)
            .focusable(enabled = change != null)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.Escape) {
                    onDismiss()
                    true
                } else {
                    false
                }
            },
    ) {
        AnimatedVisibility(
            visible = change != null,
            enter = fadeIn(animationSpec = Motion.alphaEnter),
            exit = fadeOut(animationSpec = Motion.alphaExit),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Scrim.copy(alpha = 0.46f))
                    .clickable(
                        interactionSource = backdropInteraction,
                        indication = null,
                        onClick = onDismiss,
                    ),
            )
        }
        AnimatedVisibility(
            visible = change != null,
            enter = slideInHorizontally(
                initialOffsetX = ::drawerMotionOffsetPx,
                animationSpec = Motion.intOffsetEnter,
            ) + fadeIn(animationSpec = Motion.alphaEnter),
            exit = slideOutHorizontally(
                targetOffsetX = ::drawerMotionOffsetPx,
                animationSpec = Motion.intOffsetExit,
            ) + fadeOut(animationSpec = Motion.alphaExit),
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            BoxWithConstraints(Modifier.fillMaxHeight()) {
                val preferredWidth = minOf(1120.dp, maxWidth * 0.68f)
                val drawerWidth = minOf(maxWidth, maxOf(560.dp, preferredWidth))
                AnimatedContent(
                    targetState = displayedChange,
                    contentKey = { it?.path ?: "diff-empty" },
                    transitionSpec = {
                        fadeIn(Motion.alphaEnter) togetherWith fadeOut(Motion.alphaExit)
                    },
                    modifier = Modifier.fillMaxHeight(),
                    label = "diffFileContent",
                ) { currentChange ->
                    currentChange?.let {
                        DiffDrawerContent(
                            change = it,
                            onDismiss = onDismiss,
                            onStage = onStage,
                            onUnstage = onUnstage,
                            modifier = Modifier.width(drawerWidth),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DiffDrawerContent(
    change: GitFileChangeDto,
    onDismiss: () -> Unit,
    onStage: (String) -> Unit,
    onUnstage: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentInteraction = remember { MutableInteractionSource() }
    Column(
        modifier
            .fillMaxHeight()
            .background(Bg1)
            .border(1.dp, Line)
            .clickable(interactionSource = contentInteraction, indication = null) {},
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(Bg2).padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(change.path.substringAfterLast('/'), color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(3.dp))
                Text(
                    change.path,
                    color = Tx3,
                    fontSize = 11.sp,
                    fontFamily = CodeFont,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            DiffStat("+${change.added}", AgentGemini)
            Spacer(Modifier.width(6.dp))
            DiffStat("-${change.removed}", Err)
            Spacer(Modifier.width(12.dp))
            if (change.hasUnstagedChanges) DrawerAction("暂存", OkLight) { onStage(change.path) }
            if (change.hasStagedChanges) {
                Spacer(Modifier.width(6.dp))
                DrawerAction("取消暂存", Tx2) { onUnstage(change.path) }
            }
            Spacer(Modifier.width(8.dp))
            DrawerAction("关闭", Tx2, onDismiss)
        }

        Row(
            Modifier.fillMaxWidth().background(Bg0).padding(horizontal = 18.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("DIFF", color = Ac, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(Modifier.width(10.dp))
            Text("完整变更 · 独立审阅面板", color = Tx3, fontSize = 11.sp)
        }

        val parsedLines = remember(change.diffLines) { parseUnifiedDiff(change.diffLines) }
        val horizontalScroll = rememberScrollState()
        val verticalScroll = rememberLazyListState()
        if (change.diffLines.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("该文件没有可显示的文本 Diff", color = Tx3, fontSize = 12.sp)
            }
        } else {
            Box(Modifier.fillMaxSize().background(Bg0)) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(end = 10.dp, bottom = 10.dp)
                        .horizontalScroll(horizontalScroll),
                    state = verticalScroll,
                ) {
                    itemsIndexed(parsedLines, key = { index, _ -> index }) { _, line ->
                        DiffLine(line)
                    }
                }
                VerticalScrollbar(
                    adapter = rememberScrollbarAdapter(verticalScroll),
                    modifier = Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(vertical = 4.dp),
                )
                HorizontalScrollbar(
                    adapter = rememberScrollbarAdapter(horizontalScroll),
                    modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(end = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun DiffLine(line: ParsedDiffLine) {
    val isHeader = line.kind == DiffLineKind.HUNK || line.kind == DiffLineKind.METADATA
    val isAddition = line.kind == DiffLineKind.ADDITION
    val isDeletion = line.kind == DiffLineKind.DELETION
    val background = when {
        isAddition -> AgentGemini.copy(alpha = 0.10f)
        isDeletion -> Err.copy(alpha = 0.10f)
        isHeader -> Ac.copy(alpha = 0.08f)
        else -> Color.Transparent
    }
    val foreground = when {
        isAddition -> AgentGemini
        isDeletion -> Err
        isHeader -> Ac
        else -> Tx2
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(background)
            .border(width = 0.dp, color = Color.Transparent)
            .padding(vertical = 1.dp),
    ) {
        Text(
            line.oldLine?.toString().orEmpty(),
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = CodeFont,
            modifier = Modifier.width(42.dp).padding(end = 8.dp),
        )
        Text(
            line.newLine?.toString().orEmpty(),
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = CodeFont,
            modifier = Modifier.width(42.dp).padding(end = 8.dp),
        )
        Text(
            line.text.ifEmpty { " " },
            color = foreground,
            fontSize = 12.sp,
            lineHeight = 19.sp,
            fontFamily = CodeFont,
            softWrap = false,
            modifier = Modifier.padding(end = 24.dp),
        )
    }
}

@Composable
private fun DiffStat(text: String, color: Color) {
    Box(
        Modifier.clip(AppShapes.pill).background(color.copy(alpha = 0.12f)).padding(horizontal = 7.dp, vertical = 4.dp),
    ) {
        Text(text, color = color, fontSize = 11.sp, fontFamily = CodeFont, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun DrawerAction(label: String, color: Color, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = if (hovered) color.copy(alpha = 0.1f) else Color.Transparent,
        animationSpec = Motion.colorDefault,
        label = "drawerActionBackground",
    )
    val border by animateColorAsState(
        targetValue = if (hovered) color.copy(alpha = 0.38f) else Line2,
        animationSpec = Motion.colorDefault,
        label = "drawerActionBorder",
    )
    Box(
        Modifier
            .height(30.dp)
            .fluidClickable(interactionSource = interaction, pressScale = 0.975f, onClick = onClick)
            .clip(AppShapes.xs)
            .background(background)
            .border(1.dp, border, AppShapes.xs)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = color, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

internal enum class DiffLineKind {
    METADATA,
    HUNK,
    CONTEXT,
    ADDITION,
    DELETION,
}

internal data class ParsedDiffLine(
    val text: String,
    val oldLine: Int? = null,
    val newLine: Int? = null,
    val kind: DiffLineKind,
)

private val HUNK_HEADER = Regex("^@@ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@")

internal fun parseUnifiedDiff(lines: List<String>): List<ParsedDiffLine> {
    var oldLine: Int? = null
    var newLine: Int? = null

    return lines.map { text ->
        val hunkMatch = HUNK_HEADER.find(text)
        when {
            hunkMatch != null -> {
                oldLine = hunkMatch.groupValues[1].toInt()
                newLine = hunkMatch.groupValues[2].toInt()
                ParsedDiffLine(text = text, kind = DiffLineKind.HUNK)
            }
            oldLine == null || newLine == null -> ParsedDiffLine(text = text, kind = DiffLineKind.METADATA)
            text.startsWith("+") && !text.startsWith("+++") -> {
                val parsed = ParsedDiffLine(text = text, newLine = newLine, kind = DiffLineKind.ADDITION)
                newLine = newLine + 1
                parsed
            }
            text.startsWith("-") && !text.startsWith("---") -> {
                val parsed = ParsedDiffLine(text = text, oldLine = oldLine, kind = DiffLineKind.DELETION)
                oldLine = oldLine + 1
                parsed
            }
            text.startsWith(" ") -> {
                val parsed = ParsedDiffLine(text = text, oldLine = oldLine, newLine = newLine, kind = DiffLineKind.CONTEXT)
                oldLine = oldLine + 1
                newLine = newLine + 1
                parsed
            }
            else -> ParsedDiffLine(text = text, kind = DiffLineKind.METADATA)
        }
    }
}
