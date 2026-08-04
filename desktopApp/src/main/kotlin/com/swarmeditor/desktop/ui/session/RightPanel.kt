package com.swarmeditor.desktop.ui.session

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Check
import com.woowla.compose.icon.collections.feather.feather.ChevronRight
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import com.swarmeditor.backend.pi.PiSessionState
import com.swarmeditor.backend.pi.PiSessionStats
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.backend.pi.PiSessionTree
import com.swarmeditor.backend.pi.PiSessionTreeNode
import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.TokenUsage
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.theme.*

// ── Tab definitions ──────────────────────────────────────────────────────
private data class TabDef(val id: String, val label: String)
private val TABS = listOf(
    TabDef("changes", "变更"),
    TabDef("inspector", "检查"),
    TabDef("branches", "分支"),
    TabDef("log", "日志"),
    TabDef("tokens", "Token"),
)

data class TokenUsageSummary(
    val total: TokenUsage = TokenUsage(),
    val sessions: TokenUsage = TokenUsage(),
    val swarm: TokenUsage = TokenUsage(),
)

// ── Extension chip color helper ──────────────────────────────────────────
private fun extColor(ext: String): Color = when (ext) {
    "kt", "json", "kts" -> AgentKimi
    "md" -> Tx
    "toml", "yaml", "yml" -> Ac
    else -> Tx2
}

private fun logDotColor(type: ActivityType): Color = when (type) {
    ActivityType.TOOL -> AgentGemini
    ActivityType.SKILL -> ControlPurple
    ActivityType.MCP -> AgentQwen
    ActivityType.FILE -> AgentClaude
    ActivityType.COMMAND -> Ac
    ActivityType.ERROR -> Err
    ActivityType.SESSION, ActivityType.MESSAGE -> Tx3
}

private val GitFileChangeDto.name: String
    get() = path.substringAfterLast('/')

private val GitFileChangeDto.extension: String
    get() = name.substringAfterLast('.', "").lowercase()

// ════════════════════════════════════════════════════════════════════════
//  Main composable
// ════════════════════════════════════════════════════════════════════════

@Composable
fun RightPanel(
    currentTab: String,
    onTabChange: (String) -> Unit,
    gitStatus: GitStatusDto = GitStatusDto(),
    activities: List<ActivityEvent> = emptyList(),
    piRuntimeState: PiSessionState? = null,
    piRuntimeStats: PiSessionStats? = null,
    piModels: List<PiModelInfo> = emptyList(),
    piSessionTree: PiSessionTree? = null,
    sessionTreeLoading: Boolean = false,
    runtimeControlBusy: Boolean = false,
    isCompacting: Boolean = false,
    tokenUsageSummary: TokenUsageSummary = TokenUsageSummary(),
    onCompactContext: (String?) -> Boolean = { false },
    onRefreshModels: () -> Unit = {},
    onSetModel: (PiModelInfo) -> Boolean = { false },
    onSetThinkingLevel: (String) -> Boolean = { false },
    onRefreshSessionTree: () -> Unit = {},
    onForkSession: (String) -> Boolean = { false },
    onCloneSession: () -> Boolean = { false },
    onSynchronizeSession: () -> Boolean = { false },
    onExportSession: () -> Boolean = { false },
    onStageFile: (String) -> Unit = {},
    onStageAll: (Collection<String>) -> Unit = {},
    onUnstageFile: (String) -> Unit = {},
    onOpenDiff: (GitFileChangeDto) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        // ── Tab header row ───────────────────────────────────────────────
        TabHeader(
            currentTab = currentTab,
            badgeCounts = mapOf("changes" to gitStatus.changes.size),
            onTabChange = onTabChange,
        )

        Column(Modifier.weight(1f).fillMaxWidth()) {
            when (currentTab) {
                "changes" -> ChangesTab(gitStatus, onStageFile, onStageAll, onUnstageFile, onOpenDiff)
                "inspector" -> InspectorTab(
                    piRuntimeState,
                    piRuntimeStats,
                    piModels,
                    runtimeControlBusy,
                    isCompacting,
                    onCompactContext,
                    onRefreshModels,
                    onSetModel,
                    onSetThinkingLevel,
                )
                "branches" -> BranchesTab(
                    tree = piSessionTree,
                    isLoading = sessionTreeLoading,
                    isBusy = runtimeControlBusy || piRuntimeState?.isStreaming == true || piRuntimeState?.isCompacting == true,
                    onRefresh = onRefreshSessionTree,
                    onFork = onForkSession,
                    onClone = onCloneSession,
                    onSynchronize = onSynchronizeSession,
                    onExport = onExportSession,
                )
                "log" -> LogTab(activities)
                "tokens" -> TokenUsageTab(tokenUsageSummary)
            }
        }
    }
}

@Composable
private fun TokenUsageTab(summary: TokenUsageSummary) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Token 消耗", color = Tx, style = AppType.title, fontWeight = FontWeight.Bold)
        Text("基于当前会话返回的真实用量统计", color = Tx3, style = AppType.caption)
        TokenMetricCard("总消耗", summary.total, emphasized = true)
        TokenMetricCard("普通会话", summary.sessions)
        TokenMetricCard("蜂群任务", summary.swarm)
    }
}

@Composable
private fun TokenMetricCard(title: String, usage: TokenUsage, emphasized: Boolean = false) {
    val cardBackground = when {
        emphasized -> Ac.withAlpha(0.08f)
        else -> Bg2
    }
    val cardBorder = when {
        emphasized -> Ac.withAlpha(0.38f)
        else -> Line
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .surfaceCard(
                bg = cardBackground,
                border = cardBorder,
                elevation = if (emphasized) Elevation.medium else Elevation.low,
                shape = AppShapes.md,
            )
            .padding(11.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(
                "${formatTokenUsage(usage.total)} tokens",
                color = AcLight,
                style = AppType.bodySm,
                fontWeight = FontWeight.Bold,
            )
        }
        TokenRow("输入", usage.input)
        TokenRow("输出", usage.output)
        TokenRow("缓存读取", usage.cacheRead)
        TokenRow("缓存写入", usage.cacheWrite)
        TokenDistributionBar(usage)
        Row {
            Text("成本", color = Tx3, style = AppType.caption, modifier = Modifier.weight(1f))
            Text("$${String.format(Locale.US, "%.4f", usage.cost)}", color = Tx2, style = AppType.caption)
        }
    }
}

@Composable
private fun TokenDistributionBar(usage: TokenUsage) {
    val generated = usage.input + usage.output
    val inputFraction = if (generated <= 0) 0.5f else usage.input.toFloat() / generated.toFloat()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(Bg3),
    ) {
        Box(Modifier.weight(inputFraction.coerceIn(0.02f, 0.98f)).fillMaxHeight().background(Ac))
        Box(Modifier.weight((1f - inputFraction).coerceIn(0.02f, 0.98f)).fillMaxHeight().background(AgentGemini))
    }
}

@Composable
private fun TokenRow(label: String, value: Long) {
    Row {
        Text(label, color = Tx3, style = AppType.caption, modifier = Modifier.weight(1f))
        Text(formatTokenUsage(value), color = Tx2, style = AppType.caption)
    }
}

private fun formatTokenUsage(value: Long): String = when {
    value >= 1_000_000 -> "%.1fM".format(value / 1_000_000.0)
    value >= 1_000 -> "%.1fK".format(value / 1_000.0)
    else -> value.toString()
}

// ════════════════════════════════════════════════════════════════════════
//  Tab Header
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun TabHeader(
    currentTab: String,
    badgeCounts: Map<String, Int>,
    onTabChange: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().background(Bg0.copy(alpha = 0.72f))
            .border(1.dp, Line).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        TABS.forEach { (id, label) ->
            val isActive = currentTab == id
            val badgeCount = badgeCounts[id]?.takeIf { it > 0 }
            val background by animateColorAsState(
                if (isActive) Ac.copy(alpha = 0.16f) else Color.Transparent,
                Motion.colorDefault,
                label = "rightTabBackground",
            )
            val foreground by animateColorAsState(
                if (isActive) AcLight else Tx3,
                Motion.colorDefault,
                label = "rightTabForeground",
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .fluidClickable(onClick = { onTabChange(id) })
                    .clip(AppShapes.sm)
                    .background(background)
                    .padding(horizontal = 8.dp)
                    .semantics {
                        selected = isActive
                        contentDescription = if (badgeCount == null) label else "$label，$badgeCount 项"
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = foreground,
                    style = AppType.bodySm,
                    fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal,
                )
                badgeCount?.let { count ->
                    TabBadge(
                        count = count,
                        isActive = isActive,
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = (-2).dp, y = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun TabBadge(count: Int, isActive: Boolean, modifier: Modifier = Modifier) {
    val label = compactTabBadgeLabel(count) ?: return
    Text(
        label,
        modifier = modifier,
        color = if (isActive) AcLight else Tx3,
        style = AppType.micro.copy(fontFamily = CodeFont, fontSize = 7.sp, lineHeight = 8.sp),
        fontWeight = FontWeight.Bold,
    )
}

internal fun compactTabBadgeLabel(count: Int): String? = when {
    count <= 0 -> null
    count > 99 -> "99+"
    else -> count.toString()
}

// ════════════════════════════════════════════════════════════════════════
//  变更 Tab — Change Management
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.ChangesTab(
    gitStatus: GitStatusDto,
    onStageFile: (String) -> Unit,
    onStageAll: (Collection<String>) -> Unit,
    onUnstageFile: (String) -> Unit,
    onOpenDiff: (GitFileChangeDto) -> Unit,
) {
    val changes = gitStatus.changes

    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
    ) {
        item(key = "changes-header") {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "变更文件 (${changes.size})",
                    color = Tx3,
                    style = AppType.micro,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.7.sp,
                )
                Spacer(Modifier.weight(1f))
                if (changes.any { it.hasUnstagedChanges }) {
                    ActionButton(
                        text = "全部暂存",
                        tone = ActionTone.POSITIVE,
                        prominent = false,
                        compact = true,
                        onClick = { onStageAll(changes.filter { it.hasUnstagedChanges }.map { it.path }) },
                    )
                }
            }
        }

        if (changes.isEmpty()) {
            item(key = "changes-empty") {
                Text(
                    "工作区没有未提交变更",
                    color = Tx3,
                    style = AppType.caption,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 18.dp)
                )
            }
        }

        items(changes, key = GitFileChangeDto::path) { change ->
            val rowInteraction = remember(change.path) { MutableInteractionSource() }
            val rowHovered by rowInteraction.collectIsHoveredAsState()
            val rowBackground by animateColorAsState(
                targetValue = if (rowHovered) Bg3.copy(alpha = 0.72f) else Bg3.copy(alpha = 0.35f),
                animationSpec = Motion.colorDefault,
                label = "changeRowBackground",
            )
            val rowBorder by animateColorAsState(
                targetValue = if (rowHovered) Line2 else Line,
                animationSpec = Motion.colorDefault,
                label = "changeRowBorder",
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .animateItem()
                    .padding(horizontal = 12.dp, vertical = 3.dp),
            ) {
                // File row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fluidClickable(interactionSource = rowInteraction) { onOpenDiff(change) }
                        .clip(RoundedCornerShape(8.dp))
                        .background(rowBackground)
                        .border(1.dp, rowBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Extension chip
                    ExtensionChip(change.extension)
                    Spacer(Modifier.width(6.dp))

                    // Filename + optional NEW badge
                    Text(
                        change.name,
                        color = Tx,
                        style = AppType.bodySm,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (change.isUntracked || change.status == "A") {
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "NEW",
                            color = Ac,
                            style = AppType.micro,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.width(8.dp))

                    // Diff stats
                    if (change.added > 0) {
                        Text(
                            "+${change.added}",
                            color = AgentGemini,
                            style = AppType.micro.copy(fontFamily = CodeFont),
                        )
                    }
                    if (change.removed > 0) {
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "-${change.removed}",
                            color = ErrLight,
                            style = AppType.micro.copy(fontFamily = CodeFont),
                        )
                    }

                    Spacer(Modifier.width(8.dp))

                    // Stage / unstage actions. Never discard working-tree data implicitly.
                    if (change.hasUnstagedChanges) {
                        ChangeIconAction(
                            icon = Feather.Check,
                            label = "暂存",
                            tone = AgentGemini,
                            onClick = { onStageFile(change.path) },
                        )
                    }
                    if (change.hasStagedChanges) {
                        Spacer(Modifier.width(4.dp))
                        ChangeIconAction(
                            icon = Feather.X,
                            label = "取消暂存",
                            tone = ErrLight,
                            onClick = { onUnstageFile(change.path) },
                        )
                    }
                    if (change.hasStagedChanges && !change.hasUnstagedChanges) {
                        Icon(imageVector = Feather.Check, contentDescription = "已暂存", tint = AgentGemini, modifier = Modifier.size(14.dp))
                    }
                }

            }
        }
    }
}

@Composable
private fun ChangeIconAction(
    icon: ImageVector,
    label: String,
    tone: Color,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = tone.withAlpha(if (hovered) 0.18f else 0.09f),
        animationSpec = Motion.colorDefault,
        label = "changeActionBackground",
    )
    val border by animateColorAsState(
        targetValue = tone.withAlpha(if (hovered) 0.52f else 0.28f),
        animationSpec = Motion.colorDefault,
        label = "changeActionBorder",
    )
    HoverTipBox(label) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .fluidClickable(interactionSource = interaction, pressScale = 0.96f, onClick = onClick)
                .clip(RoundedCornerShape(7.dp))
                .background(background)
                .border(1.dp, border, RoundedCornerShape(7.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = tone, modifier = Modifier.size(13.dp))
        }
    }
}

// ── Extension chip ───────────────────────────────────────────────────────

@Composable
private fun ExtensionChip(ext: String) {
    val color = extColor(ext)
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .background(color.withAlpha(0.15f))
            .padding(horizontal = 5.dp, vertical = 1.dp),
    ) {
        Text(ext, color = color, style = AppType.micro, fontWeight = FontWeight.SemiBold)
    }
}

// ════════════════════════════════════════════════════════════════════════
//  检查 Tab — Inspector
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.InspectorTab(
    state: PiSessionState?,
    stats: PiSessionStats?,
    models: List<PiModelInfo>,
    runtimeControlBusy: Boolean,
    isCompacting: Boolean,
    onCompactContext: (String?) -> Boolean,
    onRefreshModels: () -> Unit,
    onSetModel: (PiModelInfo) -> Boolean,
    onSetThinkingLevel: (String) -> Boolean,
) {
    var customInstructions by remember { mutableStateOf("") }
    if (state == null) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Bg3.copy(alpha = 0.72f))
                    .border(1.dp, Line2, RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(Ac.copy(alpha = 0.14f))
                        .border(1.dp, Ac.copy(alpha = 0.28f), RoundedCornerShape(11.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("PI", color = AcLight, style = AppType.caption, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(11.dp))
                Text("等待会话运行", color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(5.dp))
                Text(
                    "发送第一条消息后，这里会持续显示模型、上下文和工具执行状态。",
                    color = Tx3,
                    style = AppType.caption,
                )
                Spacer(Modifier.height(11.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("模型", "Token", "工具").forEach { label ->
                        Text(
                            label,
                            color = Tx2,
                            style = AppType.micro,
                            modifier = Modifier
                                .clip(RoundedCornerShape(5.dp))
                                .background(Bg2.copy(alpha = 0.86f))
                                .border(1.dp, Line, RoundedCornerShape(5.dp))
                                .padding(horizontal = 7.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }
        return
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f)
            .verticalScroll(rememberScrollState())
            .padding(12.dp),
    ) {
        Text(
            "执行状态",
            color = Tx3,
            style = AppType.micro,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.7.sp,
        )
        Spacer(Modifier.height(12.dp))

        val runtimeStatus = when {
            !state.isAlive -> "异常退出"
            state.isCompacting -> "压缩上下文"
            state.isStreaming -> "生成中"
            else -> "空闲"
        }
        RuntimeControls(
            state = state,
            models = models,
            busy = runtimeControlBusy || state.isStreaming || state.isCompacting,
            onRefreshModels = onRefreshModels,
            onSetModel = onSetModel,
            onSetThinkingLevel = onSetThinkingLevel,
        )
        Spacer(Modifier.height(14.dp))
        InspectorTable(
            buildList {
                add(InspectorMetric("状态", runtimeStatus, runtimeStatusColor(state)))
                add(InspectorMetric("进程", state.pid?.let { "PID $it" } ?: "—"))
                add(InspectorMetric("Provider", state.provider ?: "—"))
                add(InspectorMetric("模型", state.modelName ?: state.modelId ?: "—"))
                add(InspectorMetric("模型 ID", state.modelId ?: "—"))
                add(InspectorMetric("Thinking", state.thinkingLevel.ifBlank { "—" }))
                add(InspectorMetric("远端会话", state.sessionId))
                add(InspectorMetric("消息", "${state.messageCount} · 待处理 ${state.pendingMessageCount}"))
                add(InspectorMetric("工具集", "${state.tools.count { it.active }} 激活 · ${state.tools.size} 可用"))
                add(InspectorMetric("上下文", state.contextWindow?.let { formatTokenCount(it.toLong()) } ?: "—"))
                add(InspectorMetric("最大输出", state.maxTokens?.let { formatTokenCount(it.toLong()) } ?: "—"))
                add(InspectorMetric("自动压缩", if (state.autoCompactionEnabled) "开启" else "关闭"))
                state.errorMessage?.let { add(InspectorMetric("错误", it, ErrLight)) }
            },
        )
        val mcpTools = state.tools.filter { it.name.startsWith("mcp_") }
        if (mcpTools.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                "MCP 工具",
                color = Tx3,
                style = AppType.micro,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            mcpTools.chunked(2).forEach { tools ->
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    tools.forEach { tool ->
                        Text(
                            tool.name.removePrefix("mcp_"),
                            color = if (tool.active) AgentGemini else Tx3,
                            style = AppType.micro.copy(fontFamily = CodeFont),
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(5.dp))
                                .background(if (tool.active) AgentGemini.withAlpha(0.09f) else Bg3)
                                .border(1.dp, if (tool.active) AgentGemini.withAlpha(0.24f) else Line, RoundedCornerShape(5.dp))
                                .padding(horizontal = 7.dp, vertical = 4.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (tools.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(5.dp))
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "会话统计",
            color = Tx3,
            style = AppType.micro,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.7.sp,
        )
        Spacer(Modifier.height(6.dp))
        if (stats == null) {
            Text("统计数据尚未加载", color = Tx3, style = AppType.caption)
        } else {
            InspectorTable(
                buildList {
                    add(InspectorMetric("消息", "${stats.userMessages} 用户 · ${stats.assistantMessages} 智能体"))
                    add(InspectorMetric("工具", "${stats.toolCalls} 调用 · ${stats.toolResults} 结果"))
                    add(InspectorMetric("Tokens", formatTokenCount(stats.tokens.total)))
                    add(InspectorMetric("输入/输出", "${formatTokenCount(stats.tokens.input)} / ${formatTokenCount(stats.tokens.output)}"))
                    add(InspectorMetric("缓存", "读 ${formatTokenCount(stats.tokens.cacheRead)} · 写 ${formatTokenCount(stats.tokens.cacheWrite)}"))
                    add(InspectorMetric("成本", "\$%.4f".format(stats.cost)))
                    stats.contextUsage?.let { usage ->
                        val tokens = usage.tokens?.let(::formatTokenCount) ?: "未知"
                        val percent = usage.percent?.let { " · %.1f%%".format(it) }.orEmpty()
                        add(InspectorMetric("上下文", "$tokens / ${formatTokenCount(usage.contextWindow.toLong())}$percent"))
                    }
                },
            )
        }

        Spacer(Modifier.height(14.dp))
        Text(
            "压缩指令（可选）",
            color = Tx3,
            style = AppType.micro,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(5.dp))
        BasicTextField(
            value = customInstructions,
            onValueChange = { customInstructions = it.take(2_000) },
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(Bg3)
                .border(1.dp, Line, RoundedCornerShape(7.dp))
                .padding(9.dp),
            textStyle = AppType.caption.copy(color = Tx),
            cursorBrush = SolidColor(Ac),
            decorationBox = { innerTextField ->
                Box {
                    if (customInstructions.isEmpty()) {
                        Text(
                            "例如：保留公共 API，删除旧实现细节",
                            color = Tx3,
                            style = AppType.caption,
                        )
                    }
                    innerTextField()
                }
            },
        )
        Spacer(Modifier.height(8.dp))
        val canCompact = state.isAlive && !state.isStreaming && !state.isCompacting && !isCompacting &&
            (stats?.totalMessages ?: 0) > 0
        ActionButton(
            text = if (isCompacting || state.isCompacting) "正在压缩…" else "压缩上下文",
            tone = ActionTone.PRIMARY,
            prominent = false,
            enabled = canCompact,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                if (onCompactContext(customInstructions.takeIf(String::isNotBlank))) {
                    customInstructions = ""
                }
            },
        )
    }
}

@Composable
private fun RuntimeControls(
    state: PiSessionState,
    models: List<PiModelInfo>,
    busy: Boolean,
    onRefreshModels: () -> Unit,
    onSetModel: (PiModelInfo) -> Boolean,
    onSetThinkingLevel: (String) -> Boolean,
) {
    var modelMenuExpanded by remember { mutableStateOf(false) }
    val currentModel = models.firstOrNull { it.provider == state.provider && it.id == state.modelId }
    val modelInteraction = remember { MutableInteractionSource() }
    val modelHovered by modelInteraction.collectIsHoveredAsState()
    val modelBackground by animateColorAsState(
        targetValue = if (modelHovered || modelMenuExpanded) Ac.withAlpha(0.07f) else Bg2,
        animationSpec = Motion.colorDefault,
        label = "runtimeModelBackground",
    )
    val modelBorder by animateColorAsState(
        targetValue = if (modelMenuExpanded) Ac.withAlpha(0.5f) else if (modelHovered) Line2 else Line,
        animationSpec = Motion.colorDefault,
        label = "runtimeModelBorder",
    )
    val chevronRotation by animateFloatAsState(
        targetValue = if (modelMenuExpanded) 180f else 0f,
        animationSpec = Motion.floatState,
        label = "runtimeModelChevron",
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Bg3.copy(alpha = 0.58f))
            .border(1.dp, Line2, RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("PI 会话控制", color = Tx, style = AppType.caption, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            ActionButton(
                text = if (busy) "处理中" else if (models.isEmpty()) "加载" else "刷新",
                tone = ActionTone.NEUTRAL,
                prominent = false,
                enabled = !busy,
                compact = true,
                onClick = onRefreshModels,
            )
        }
        Spacer(Modifier.height(9.dp))
        Text("当前模型", color = Tx3, style = AppType.micro)
        Spacer(Modifier.height(4.dp))
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .fluidClickable(
                        enabled = !busy && models.isNotEmpty(),
                        interactionSource = modelInteraction,
                        onClick = { modelMenuExpanded = true },
                    )
                    .clip(RoundedCornerShape(7.dp))
                    .background(modelBackground)
                    .border(1.dp, modelBorder, RoundedCornerShape(7.dp))
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(state.modelName ?: state.modelId ?: "未选择模型", color = Tx, style = AppType.caption, maxLines = 1)
                    Text(
                        listOfNotNull(state.provider, state.contextWindow?.let { "${formatTokenCount(it.toLong())} ctx" }).joinToString(" · "),
                        color = Tx3,
                        style = AppType.micro.copy(fontFamily = CodeFont),
                        maxLines = 1,
                    )
                }
                Text("▾", color = if (modelMenuExpanded) AcLight else Tx3, style = AppType.micro, modifier = Modifier.rotate(chevronRotation))
            }
            DropdownMenu(
                expanded = modelMenuExpanded,
                onDismissRequest = { modelMenuExpanded = false },
                modifier = Modifier.width(276.dp).heightIn(max = 360.dp).background(Bg2),
            ) {
                models.forEach { model ->
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(model.name, color = Tx, style = AppType.caption, maxLines = 1)
                                Text(
                                    "${model.provider} · ${formatTokenCount(model.contextWindow.toLong())} ctx${if (model.reasoning) " · reasoning" else ""}",
                                    color = Tx3,
                                    style = AppType.micro.copy(fontFamily = CodeFont),
                                    maxLines = 1,
                                )
                            }
                        },
                        onClick = {
                            modelMenuExpanded = false
                            if (model != currentModel) onSetModel(model)
                        },
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("思考级别", color = Tx3, style = AppType.micro)
        Spacer(Modifier.height(5.dp))
        THINKING_LEVELS.chunked(4).forEachIndexed { index, levels ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                levels.forEach { level ->
                    ThinkingLevelChip(
                        level = level,
                        selected = state.thinkingLevel == level,
                        enabled = !busy,
                        onClick = { onSetThinkingLevel(level) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(4 - levels.size) { Spacer(Modifier.weight(1f)) }
            }
            if (index < 1) Spacer(Modifier.height(5.dp))
        }
    }
}

private val THINKING_LEVELS = listOf("off", "minimal", "low", "medium", "high", "xhigh", "max")

private data class BranchTreeRow(
    val node: PiSessionTreeNode,
    val depth: Int,
)

@Composable
private fun ColumnScope.BranchesTab(
    tree: PiSessionTree?,
    isLoading: Boolean,
    isBusy: Boolean,
    onRefresh: () -> Unit,
    onFork: (String) -> Boolean,
    onClone: () -> Boolean,
    onSynchronize: () -> Boolean,
    onExport: () -> Boolean,
) {
    val rows = remember(tree) { tree?.roots.orEmpty().flatMap { it.flattenBranchTree() } }
    Column(modifier = Modifier.fillMaxWidth().weight(1f)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("PI 会话时间线", color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
                Text("分叉会保留原分支，并回填对应提示词", color = Tx3, style = AppType.micro)
            }
            BranchAction("刷新", !isLoading && !isBusy, onRefresh)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            BranchAction("同步会话", !isBusy, { onSynchronize() }, modifier = Modifier.weight(1f))
            BranchAction("克隆当前", !isBusy, { onClone() }, modifier = Modifier.weight(1f))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            BranchAction("导出 HTML", !isBusy, { onExport() }, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        when {
            isLoading -> InlineLoadingState(
                text = "正在读取 pi 会话树…",
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(horizontal = 24.dp),
                minHeight = 64.dp,
            )
            tree == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                Text("发送第一条消息后即可查看分支", color = Tx3, style = AppType.caption)
            }
            rows.isEmpty() -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                Text("当前会话还没有持久化节点", color = Tx3, style = AppType.caption)
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                items(rows, key = { it.node.entryId }) { row ->
                    BranchNodeCard(
                        row = row,
                        isLeaf = row.node.entryId == tree.leafId,
                        isBusy = isBusy,
                        onFork = onFork,
                        modifier = Modifier.animateItem(),
                    )
                }
            }
        }
    }
}

@Composable
private fun BranchNodeCard(
    row: BranchTreeRow,
    isLeaf: Boolean,
    isBusy: Boolean,
    onFork: (String) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val node = row.node
    val isUser = node.role == "user"
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = (row.depth.coerceAtMost(6) * 8).dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isLeaf) Ac.withAlpha(0.09f) else Bg3.copy(alpha = 0.42f))
            .border(1.dp, if (isLeaf) Ac.withAlpha(0.34f) else Line, RoundedCornerShape(8.dp))
            .padding(9.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier.size(20.dp).clip(RoundedCornerShape(6.dp))
                .background((if (isUser) Ac else AgentGemini).withAlpha(0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (isUser) "U" else "P",
                color = if (isUser) AcLight else AgentGemini,
                style = AppType.micro,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when {
                        node.label?.isNotBlank() == true -> node.label.orEmpty()
                        isUser -> "用户提示"
                        node.role == "assistant" -> "Pi 响应"
                        else -> node.type.ifBlank { "会话节点" }
                    },
                    color = Tx2,
                    style = AppType.micro,
                    fontWeight = FontWeight.SemiBold,
                )
                if (isLeaf) {
                    Spacer(Modifier.width(5.dp))
                    Text("当前", color = AcLight, style = AppType.micro.copy(fontFamily = CodeFont))
                }
                Spacer(Modifier.weight(1f))
                if (isUser) {
                    Text(
                        "从此分叉",
                        color = if (isBusy) Tx3 else AcLight,
                        style = AppType.micro,
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .clickable(enabled = !isBusy) { onFork(node.entryId) }
                            .padding(horizontal = 5.dp, vertical = 2.dp),
                    )
                }
            }
            if (node.text.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(node.text, color = Tx3, style = AppType.caption, maxLines = 3)
            }
            if (node.children.size > 1) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "${node.children.size} 个后续分支",
                    color = WarnLight,
                    style = AppType.micro.copy(fontFamily = CodeFont),
                )
            }
        }
    }
}

@Composable
private fun BranchAction(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (enabled) Bg3 else Bg3.copy(alpha = 0.45f))
            .border(1.dp, if (enabled) Line2 else Line, RoundedCornerShape(6.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (enabled) Tx2 else Tx3, style = AppType.micro, fontWeight = FontWeight.Medium)
    }
}

private fun PiSessionTreeNode.flattenBranchTree(depth: Int = 0): List<BranchTreeRow> =
    listOf(BranchTreeRow(this, depth)) + children.flatMap { it.flattenBranchTree(depth + 1) }

private fun formatTokenCount(value: Long): String = when {
    value >= 1_000_000 -> "%.1fM".format(value / 1_000_000.0)
    value >= 1_000 -> "%.1fK".format(value / 1_000.0)
    else -> value.toString()
}

private data class InspectorMetric(
    val label: String,
    val value: String,
    val color: Color = Tx,
)

private fun runtimeStatusColor(state: PiSessionState): Color = when {
    !state.isAlive -> ErrLight
    state.isCompacting -> Warn
    state.isStreaming -> AcLight
    else -> OkLight
}

@Composable
private fun InspectorTable(rows: List<InspectorMetric>) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Bg3.copy(alpha = 0.72f))
            .border(1.dp, Line, RoundedCornerShape(8.dp)),
    ) {
        rows.forEachIndexed { index, metric ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(metric.label, color = Tx3, style = AppType.micro, modifier = Modifier.width(68.dp))
                Text(
                    metric.value,
                    color = metric.color,
                    style = AppType.caption.copy(fontFamily = if (metric.label in setOf("进程", "模型 ID", "远端会话")) CodeFont else SansFont),
                    modifier = Modifier.weight(1f),
                    maxLines = if (metric.label == "错误") 3 else 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (index < rows.lastIndex) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(Line.copy(alpha = 0.72f)))
            }
        }
    }
}

@Composable
private fun ThinkingLevelChip(
    level: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = when {
            selected -> Ac
            hovered && enabled -> Ac.withAlpha(0.12f)
            else -> Bg2
        },
        animationSpec = Motion.colorDefault,
        label = "thinkingLevelBackground",
    )
    val border by animateColorAsState(
        targetValue = when {
            selected -> AcLight.withAlpha(0.4f)
            hovered && enabled -> Ac.withAlpha(0.34f)
            else -> Line
        },
        animationSpec = Motion.colorDefault,
        label = "thinkingLevelBorder",
    )
    val foreground by animateColorAsState(
        targetValue = if (selected) OnAccent else if (enabled) Tx2 else Tx3,
        animationSpec = Motion.colorDefault,
        label = "thinkingLevelForeground",
    )
    Box(
        modifier = modifier
            .height(26.dp)
            .fluidClickable(
                enabled = enabled && !selected,
                interactionSource = interaction,
                onClick = onClick,
            )
            .clip(RoundedCornerShape(5.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(5.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            level,
            color = foreground,
            style = AppType.micro.copy(fontFamily = CodeFont),
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}

// ════════════════════════════════════════════════════════════════════════
//  日志 Tab — Activity Log
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.LogTab(activities: List<ActivityEvent>) {
    var activeFilter by remember { mutableStateOf(AgentLogFilter.ALL) }
    val filtered = remember(activities, activeFilter) {
        filterAgentActivities(activities, activeFilter)
    }
    val dateGroups = remember(filtered) { groupAgentActivitiesByDate(filtered) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var followNewest by remember(activeFilter) { mutableStateOf(true) }
    var autoScrolling by remember(activeFilter) { mutableStateOf(false) }
    var latestSeenId by remember(activeFilter) { mutableStateOf<String?>(null) }
    var hasNewActivity by remember(activeFilter) { mutableStateOf(false) }
    var expandedDates by remember(activeFilter) { mutableStateOf(emptySet<String>()) }

    LaunchedEffect(dateGroups.firstOrNull()?.dateKey, activeFilter) {
        val newestDate = dateGroups.firstOrNull()?.dateKey ?: return@LaunchedEffect
        expandedDates = (expandedDates intersect dateGroups.mapTo(mutableSetOf(), AgentActivityDateGroup::dateKey)) + newestDate
    }

    LaunchedEffect(listState, activeFilter) {
        snapshotFlow { listState.isScrollInProgress to autoScrolling }
            .distinctUntilChanged()
            .collect { (isScrolling, isAutomatic) ->
                if (isAutomatic) return@collect
                followNewest = if (isScrolling) false else listState.isActivityFeedAtStart()
                if (followNewest) hasNewActivity = false
            }
    }
    LaunchedEffect(filtered.firstOrNull()?.id, activeFilter) {
        val newestId = filtered.firstOrNull()?.id
        if (newestId == null) {
            latestSeenId = null
            hasNewActivity = false
            return@LaunchedEffect
        }
        if (latestSeenId == null) {
            latestSeenId = newestId
            return@LaunchedEffect
        }
        if (newestId == latestSeenId) return@LaunchedEffect
        latestSeenId = newestId
        if (followNewest) {
            autoScrolling = true
            try {
                listState.scrollToItem(0)
            } finally {
                autoScrolling = false
            }
        } else {
            hasNewActivity = true
        }
    }

    Column(modifier = Modifier.fillMaxWidth().weight(1f)) {
        // ── Filter chips ─────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Agent 操作日志",
                color = Tx3,
                style = AppType.micro,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.6.sp,
            )
            Spacer(Modifier.weight(1f))
            AgentLogFilter.entries.forEach { filter ->
                LogFilterChip(
                    label = filter.label,
                    isActive = activeFilter == filter,
                    onClick = { activeFilter = filter },
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }

        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (filtered.isEmpty()) {
                    item(key = "empty-activity") {
                        Text(
                            "暂无 Agent 工具、Skill 或 MCP 操作",
                            color = Tx3,
                            style = AppType.caption,
                            modifier = Modifier.padding(vertical = 18.dp)
                        )
                    }
                }
                dateGroups.forEach { group ->
                    val expanded = group.dateKey in expandedDates
                    item(key = "activity-date-${group.dateKey}") {
                        AgentLogDateHeader(
                            dateKey = group.dateKey,
                            count = group.entries.size,
                            expanded = expanded,
                            onClick = {
                                expandedDates = if (expanded) {
                                    expandedDates - group.dateKey
                                } else {
                                    expandedDates + group.dateKey
                                }
                            },
                        )
                    }
                    if (expanded) {
                        items(group.entries, key = ActivityEvent::id) { entry ->
                            TimelineEntry(entry)
                        }
                    }
                }
            }

            androidx.compose.animation.AnimatedVisibility(
                visible = hasNewActivity,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 6.dp),
                enter = fadeIn(Motion.alphaEnter) + slideInVertically(Motion.intOffsetEnter) { -it / 2 },
                exit = fadeOut(Motion.alphaExit) + slideOutVertically(Motion.intOffsetExit) { -it / 3 },
            ) {
                ActionButton(
                    text = "↑ 查看新日志",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    compact = true,
                    onClick = {
                        followNewest = true
                        hasNewActivity = false
                        scope.launch {
                            autoScrolling = true
                            try {
                                listState.scrollToItem(0)
                            } finally {
                                autoScrolling = false
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun AgentLogDateHeader(
    dateKey: String,
    count: Int,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = if (hovered) Bg3.copy(alpha = 0.7f) else Bg1.copy(alpha = 0.72f),
        animationSpec = Motion.colorDefault,
        label = "agentLogDateBackground",
    )
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 90f else 0f,
        animationSpec = Motion.floatState,
        label = "agentLogDateChevron",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.xs)
            .background(background)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Feather.ChevronRight,
            contentDescription = if (expanded) "收起 $dateKey" else "展开 $dateKey",
            tint = Tx3,
            modifier = Modifier.size(13.dp).rotate(chevronRotation),
        )
        Spacer(Modifier.width(6.dp))
        Text(dateKey, color = Tx, style = AppType.caption, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        MicroPill(count.toString(), AcLight)
    }
}

private fun LazyListState.isActivityFeedAtStart(): Boolean =
    isActivityFeedAtStart(firstVisibleItemIndex, firstVisibleItemScrollOffset)

internal fun isActivityFeedAtStart(firstVisibleItemIndex: Int, firstVisibleItemScrollOffset: Int): Boolean =
    firstVisibleItemIndex == 0 && firstVisibleItemScrollOffset <= 8

@Composable
private fun LogFilterChip(
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = when {
            isActive -> Ac.withAlpha(0.14f)
            hovered -> Bg3.copy(alpha = 0.72f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "logFilterBackground",
    )
    val border by animateColorAsState(
        targetValue = if (isActive) Ac.withAlpha(0.55f) else if (hovered) Line2 else Color.Transparent,
        animationSpec = Motion.colorDefault,
        label = "logFilterBorder",
    )
    val foreground by animateColorAsState(
        targetValue = if (isActive) AcLight else if (hovered) Tx2 else Tx3,
        animationSpec = Motion.colorDefault,
        label = "logFilterForeground",
    )
    Box(
        modifier = modifier
            .height(24.dp)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .clip(RoundedCornerShape(6.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(6.dp))
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = foreground, style = AppType.micro)
    }
}

@Composable
private fun TimelineEntry(entry: ActivityEvent) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R6))
            .background(Bg2)
            .border(1.dp, Line, RoundedCornerShape(R6))
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Colored dot
        Box(
            modifier = Modifier
                .padding(top = 3.dp)
                .size(6.dp)
                .clip(CircleShape)
                .background(logDotColor(entry.type)),
        )
        Spacer(Modifier.width(8.dp))

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(entry.actor, color = Ac, style = AppType.micro, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(6.dp))
                Text(entry.action, color = if (entry.action == "验证通过") AgentGemini else Tx, style = AppType.caption)
                Spacer(Modifier.weight(1f))
                Text(activityTimeLabel(entry), color = Tx3, style = AppType.micro)
            }
            if (entry.detail.isNotBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(entry.detail, color = Tx3, style = AppType.caption, maxLines = 2)
            }
        }
    }
}
