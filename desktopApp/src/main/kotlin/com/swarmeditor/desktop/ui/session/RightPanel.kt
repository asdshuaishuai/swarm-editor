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
import com.swarmeditor.desktop.api.GitCommitChangeDto
import com.swarmeditor.desktop.api.GitFileChangeDto
import com.swarmeditor.desktop.api.GitHistoryDto
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.api.ProjectSpecGraphDto
import com.swarmeditor.desktop.api.ProjectSpecNodeDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.IdeToolWindowTab
import com.swarmeditor.desktop.ui.common.IdeToolWindowTabs

// ── Tab definitions ──────────────────────────────────────────────────────
private val TABS = listOf(
    IdeToolWindowTab("specs", "规格"),
    IdeToolWindowTab("changes", "变更"),
    IdeToolWindowTab("inspector", "检查"),
    IdeToolWindowTab("branches", "会话"),
    IdeToolWindowTab("log", "日志"),
    IdeToolWindowTab("tokens", "Token"),
)

internal fun compactTabBadgeLabel(count: Int): String? = when {
    count <= 0 -> null
    count > 99 -> "99+"
    else -> count.toString()
}

data class TokenUsageSummary(
    val total: TokenUsage = TokenUsage(),
    val sessions: TokenUsage = TokenUsage(),
    val swarm: TokenUsage = TokenUsage(),
)

private fun logDotColor(type: ActivityType): Color = when (type) {
    ActivityType.TOOL -> AgentGemini
    ActivityType.SKILL -> ControlPurple
    ActivityType.MCP -> AgentQwen
    ActivityType.FILE -> AgentClaude
    ActivityType.COMMAND -> Ac
    ActivityType.ERROR -> Err
    ActivityType.SESSION, ActivityType.MESSAGE -> Tx3
}

// ════════════════════════════════════════════════════════════════════════
//  Main composable
// ════════════════════════════════════════════════════════════════════════

@Composable
fun RightPanel(
    currentTab: String,
    onTabChange: (String) -> Unit,
    gitStatus: GitStatusDto = GitStatusDto(),
    gitHistory: GitHistoryDto = GitHistoryDto(),
    activities: List<ActivityEvent> = emptyList(),
    piRuntimeState: PiSessionState? = null,
    piRuntimeStats: PiSessionStats? = null,
    piModels: List<PiModelInfo> = emptyList(),
    piThinkingLevels: List<String> = emptyList(),
    piSessionTree: PiSessionTree? = null,
    sessionTreeLoading: Boolean = false,
    runtimeControlBusy: Boolean = false,
    isCompacting: Boolean = false,
    tokenUsageSummary: TokenUsageSummary = TokenUsageSummary(),
    gitBusy: Boolean = false,
    gitHistoryLoading: Boolean = false,
    selectedCommitHash: String? = null,
    selectedCommitChanges: List<GitCommitChangeDto> = emptyList(),
    commitChangesTruncated: Boolean = false,
    commitChangesLoading: Boolean = false,
    commitChangesError: String? = null,
    gitCommitMessage: String = "",
    specGraph: ProjectSpecGraphDto? = null,
    specGraphLoading: Boolean = false,
    specGraphError: String? = null,
    onCompactContext: (String?) -> Boolean = { false },
    onRefreshModels: () -> Unit = {},
    onSetModel: (PiModelInfo) -> Boolean = { false },
    onSetThinkingLevel: (String) -> Boolean = { false },
    onSetAutoCompaction: (Boolean) -> Boolean = { false },
    onSetAutoRetry: (Boolean) -> Boolean = { false },
    onAbortRetry: () -> Boolean = { false },
    onSetSteeringMode: (String) -> Boolean = { false },
    onSetFollowUpMode: (String) -> Boolean = { false },
    onRefreshSessionTree: () -> Unit = {},
    onForkSession: (String) -> Boolean = { false },
    onCloneSession: () -> Boolean = { false },
    onSynchronizeSession: () -> Boolean = { false },
    onExportSession: () -> Boolean = { false },
    onStageFile: (String) -> Unit = {},
    onStageAll: (Collection<String>) -> Unit = {},
    onUnstageFile: (String) -> Unit = {},
    onUnstageAll: (Collection<String>) -> Unit = {},
    onGitRefresh: () -> Unit = {},
    onGitHistoryRefresh: () -> Unit = {},
    onSelectGitCommit: (String?) -> Unit = {},
    onOpenCommitDiff: (String, GitCommitChangeDto) -> Unit = { _, _ -> },
    onGitCommitMessageChange: (String) -> Unit = {},
    onGitCommit: () -> Unit = {},
    onOpenDiff: (GitFileChangeDto) -> Unit = {},
    onRefreshSpecGraph: () -> Unit = {},
    onOpenSpec: (ProjectSpecNodeDto) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        // ── Tab header row ───────────────────────────────────────────────
        IdeToolWindowTabs(
            tabs = TABS.map { tab ->
                when (tab.id) {
                    "changes" -> tab.copy(count = gitStatus.changes.size)
                    "specs" -> tab.copy(count = specGraph?.diagnostics?.size ?: 0)
                    else -> tab
                }
            },
            selectedId = currentTab,
            onSelected = onTabChange,
        )

        Column(Modifier.weight(1f).fillMaxWidth()) {
            when (currentTab) {
                "specs" -> SpecGraphToolWindow(
                    graph = specGraph,
                    isLoading = specGraphLoading,
                    error = specGraphError,
                    onRefresh = onRefreshSpecGraph,
                    onOpenSpec = onOpenSpec,
                )
                "changes" -> GitChangesToolWindow(
                    gitStatus = gitStatus,
                    gitHistory = gitHistory,
                    isBusy = gitBusy,
                    isHistoryLoading = gitHistoryLoading,
                    selectedCommitHash = selectedCommitHash,
                    selectedCommitChanges = selectedCommitChanges,
                    commitChangesTruncated = commitChangesTruncated,
                    commitChangesLoading = commitChangesLoading,
                    commitChangesError = commitChangesError,
                    commitMessage = gitCommitMessage,
                    onCommitMessageChange = onGitCommitMessageChange,
                    onRefresh = onGitRefresh,
                    onRefreshHistory = onGitHistoryRefresh,
                    onSelectCommit = onSelectGitCommit,
                    onOpenCommitDiff = onOpenCommitDiff,
                    onStageFile = onStageFile,
                    onStageAll = onStageAll,
                    onUnstageFile = onUnstageFile,
                    onUnstageAll = onUnstageAll,
                    onCommit = onGitCommit,
                    onOpenDiff = onOpenDiff,
                )
                "inspector" -> InspectorTab(
                    piRuntimeState,
                    piRuntimeStats,
                    piModels,
                    piThinkingLevels,
                    runtimeControlBusy,
                    isCompacting,
                    onCompactContext,
                    onRefreshModels,
                    onSetModel,
                    onSetThinkingLevel,
                    onSetAutoCompaction,
                    onSetAutoRetry,
                    onAbortRetry,
                    onSetSteeringMode,
                    onSetFollowUpMode,
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
//  检查 Tab — Inspector
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.InspectorTab(
    state: PiSessionState?,
    stats: PiSessionStats?,
    models: List<PiModelInfo>,
    thinkingLevels: List<String>,
    runtimeControlBusy: Boolean,
    isCompacting: Boolean,
    onCompactContext: (String?) -> Boolean,
    onRefreshModels: () -> Unit,
    onSetModel: (PiModelInfo) -> Boolean,
    onSetThinkingLevel: (String) -> Boolean,
    onSetAutoCompaction: (Boolean) -> Boolean,
    onSetAutoRetry: (Boolean) -> Boolean,
    onAbortRetry: () -> Boolean,
    onSetSteeringMode: (String) -> Boolean,
    onSetFollowUpMode: (String) -> Boolean,
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
            state.isRetrying -> "重试等待"
            state.isStreaming -> "生成中"
            else -> "空闲"
        }
        RuntimeControls(
            state = state,
            models = models,
            thinkingLevels = thinkingLevels,
            busy = runtimeControlBusy,
            onRefreshModels = onRefreshModels,
            onSetModel = onSetModel,
            onSetThinkingLevel = onSetThinkingLevel,
            onSetAutoCompaction = onSetAutoCompaction,
            onSetAutoRetry = onSetAutoRetry,
            onAbortRetry = onAbortRetry,
            onSetSteeringMode = onSetSteeringMode,
            onSetFollowUpMode = onSetFollowUpMode,
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
                add(InspectorMetric("实时引导", state.steeringMode.queueModeLabel()))
                add(InspectorMetric("后续队列", state.followUpMode.queueModeLabel()))
                add(InspectorMetric("工具集", "${state.tools.count { it.active }} 激活 · ${state.tools.size} 可用"))
                add(InspectorMetric("上下文", state.contextWindow?.let { formatTokenCount(it.toLong()) } ?: "—"))
                add(InspectorMetric("最大输出", state.maxTokens?.let { formatTokenCount(it.toLong()) } ?: "—"))
                add(InspectorMetric("自动压缩", if (state.autoCompactionEnabled) "开启" else "关闭"))
                add(InspectorMetric("自动重试", if (state.autoRetryEnabled) "开启" else "关闭"))
                if (state.isRetrying) {
                    add(
                        InspectorMetric(
                            "重试进度",
                            buildString {
                                append("${state.retryAttempt}/${state.retryMaxAttempts}")
                                state.retryDelayMillis?.let { append(" · ${it / 1000.0}s") }
                            },
                            WarnLight,
                        )
                    )
                }
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

private fun String.queueModeLabel(): String = when (this) {
    "all" -> "批量处理"
    "one-at-a-time" -> "逐条处理"
    else -> ifBlank { "—" }
}

@Composable
private fun RuntimeControls(
    state: PiSessionState,
    models: List<PiModelInfo>,
    thinkingLevels: List<String>,
    busy: Boolean,
    onRefreshModels: () -> Unit,
    onSetModel: (PiModelInfo) -> Boolean,
    onSetThinkingLevel: (String) -> Boolean,
    onSetAutoCompaction: (Boolean) -> Boolean,
    onSetAutoRetry: (Boolean) -> Boolean,
    onAbortRetry: () -> Boolean,
    onSetSteeringMode: (String) -> Boolean,
    onSetFollowUpMode: (String) -> Boolean,
) {
    var modelMenuExpanded by remember { mutableStateOf(false) }
    val controlsLocked = busy || state.isStreaming || state.isCompacting
    val supportedThinkingLevels = remember(thinkingLevels, state.thinkingLevel) {
        thinkingLevels.ifEmpty { listOf(state.thinkingLevel).filter(String::isNotBlank) }.distinct()
    }
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
                text = if (controlsLocked) "处理中" else if (models.isEmpty()) "加载" else "刷新",
                tone = ActionTone.NEUTRAL,
                prominent = false,
                enabled = !controlsLocked,
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
                        enabled = !controlsLocked && models.isNotEmpty(),
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
        supportedThinkingLevels.chunked(4).forEachIndexed { index, levels ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                levels.forEach { level ->
                    ThinkingLevelChip(
                        level = level,
                        selected = state.thinkingLevel == level,
                        enabled = !controlsLocked,
                        onClick = { onSetThinkingLevel(level) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(4 - levels.size) { Spacer(Modifier.weight(1f)) }
            }
            if (index < supportedThinkingLevels.lastIndex / 4) Spacer(Modifier.height(5.dp))
        }
        Spacer(Modifier.height(10.dp))
        RuntimeToggleRow(
            title = "自动压缩",
            detail = "上下文接近上限时自动生成摘要",
            enabled = state.autoCompactionEnabled,
            interactive = !controlsLocked,
            onToggle = { onSetAutoCompaction(!state.autoCompactionEnabled) },
        )
        Spacer(Modifier.height(6.dp))
        RuntimeToggleRow(
            title = "自动重试",
            detail = if (state.isRetrying) {
                "第 ${state.retryAttempt}/${state.retryMaxAttempts} 次 · 等待 ${state.retryDelayMillis?.let { "${it / 1000.0}s" } ?: "—"}"
            } else {
                "可恢复错误使用指数退避再次执行"
            },
            enabled = state.autoRetryEnabled,
            interactive = !controlsLocked,
            onToggle = { onSetAutoRetry(!state.autoRetryEnabled) },
            trailingAction = if (state.isRetrying) "取消等待" else null,
            onTrailingAction = onAbortRetry,
            trailingEnabled = state.isRetrying && !busy,
        )
        Spacer(Modifier.height(10.dp))
        QueueModeRow(
            title = "实时引导",
            detail = "控制多条 steer 消息每轮注入数量",
            selectedMode = state.steeringMode,
            enabled = !controlsLocked,
            onModeSelected = onSetSteeringMode,
        )
        Spacer(Modifier.height(6.dp))
        QueueModeRow(
            title = "后续队列",
            detail = "控制 follow-up 任务逐条或批量进入下一轮",
            selectedMode = state.followUpMode,
            enabled = !controlsLocked,
            onModeSelected = onSetFollowUpMode,
        )
    }
}

@Composable
private fun RuntimeToggleRow(
    title: String,
    detail: String,
    enabled: Boolean,
    interactive: Boolean,
    onToggle: () -> Unit,
    trailingAction: String? = null,
    onTrailingAction: () -> Boolean = { false },
    trailingEnabled: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(7.dp))
            .background(Bg2.copy(alpha = 0.72f))
            .border(1.dp, Line, RoundedCornerShape(7.dp))
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Tx, style = AppType.caption, fontWeight = FontWeight.Medium)
            Text(detail, color = if (trailingAction != null) WarnLight else Tx3, style = AppType.micro)
        }
        trailingAction?.let { action ->
            ActionButton(
                text = action,
                tone = ActionTone.WARNING,
                prominent = false,
                enabled = trailingEnabled,
                compact = true,
                onClick = { onTrailingAction() },
            )
            Spacer(Modifier.width(5.dp))
        }
        ActionButton(
            text = if (enabled) "开启" else "关闭",
            tone = if (enabled) ActionTone.POSITIVE else ActionTone.NEUTRAL,
            prominent = enabled,
            enabled = interactive,
            compact = true,
            onClick = onToggle,
        )
    }
}

@Composable
private fun QueueModeRow(
    title: String,
    detail: String,
    selectedMode: String,
    enabled: Boolean,
    onModeSelected: (String) -> Boolean,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(7.dp))
            .background(Bg2.copy(alpha = 0.72f))
            .border(1.dp, Line, RoundedCornerShape(7.dp))
            .padding(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Text(title, color = Tx, style = AppType.caption, fontWeight = FontWeight.Medium)
        Text(detail, color = Tx3, style = AppType.micro)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf("one-at-a-time" to "逐条", "all" to "批量").forEach { (mode, label) ->
                val selected = selectedMode == mode
                ActionButton(
                    text = label,
                    tone = if (selected) ActionTone.PRIMARY else ActionTone.NEUTRAL,
                    prominent = selected,
                    enabled = enabled,
                    compact = true,
                    onClick = { if (!selected) onModeSelected(mode) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

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
            modifier = Modifier.fillMaxWidth().height(34.dp).background(Bg2).border(1.dp, Line)
                .padding(horizontal = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "操作日志",
                color = Tx2,
                style = AppType.caption,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(6.dp))
            Text(filtered.size.toString(), color = Tx3, style = AppType.micro)
            Spacer(Modifier.weight(1f))
            AgentLogFilter.entries.forEach { filter ->
                LogFilterChip(
                    label = filter.label,
                    isActive = activeFilter == filter,
                    onClick = { activeFilter = filter },
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
        }

        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(horizontal = 3.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 3.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                if (filtered.isEmpty()) {
                    item(key = "empty-activity") {
                        Text(
                            "暂无 Agent 工具、Skill 或 MCP 操作",
                            color = Tx3,
                            style = AppType.caption,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 18.dp)
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
        targetValue = if (hovered) Bg3.copy(alpha = 0.62f) else Bg2,
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
            .height(28.dp)
            .background(background)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .padding(horizontal = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Feather.ChevronRight,
            contentDescription = if (expanded) "收起 $dateKey" else "展开 $dateKey",
            tint = Tx3,
            modifier = Modifier.size(13.dp).rotate(chevronRotation),
        )
        Spacer(Modifier.width(4.dp))
        Text(dateKey, color = Tx, style = AppType.caption, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(count.toString(), color = Tx3, style = AppType.micro)
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
            isActive -> Ac.withAlpha(0.2f)
            hovered -> Bg3.copy(alpha = 0.58f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "logFilterBackground",
    )
    val foreground by animateColorAsState(
        targetValue = if (isActive) Tx else if (hovered) Tx2 else Tx3,
        animationSpec = Motion.colorDefault,
        label = "logFilterForeground",
    )
    Box(
        modifier = modifier
            .height(24.dp)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .clip(AppShapes.xs)
            .background(background)
            .padding(horizontal = 6.dp),
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
            .padding(horizontal = 6.dp, vertical = 5.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .height(if (entry.detail.isBlank()) 18.dp else 32.dp)
                .background(logDotColor(entry.type)),
        )
        Spacer(Modifier.width(7.dp))

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(entry.actor, color = Tx2, style = AppType.micro, fontWeight = FontWeight.SemiBold)
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
