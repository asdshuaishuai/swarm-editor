package com.swarmeditor.desktop.ui.agents

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmArtifactDiffHunk
import com.swarmeditor.common.model.SwarmArtifactHunkApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRejectionResolution
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactRiskReason
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.ActionTone
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Elevation
import com.swarmeditor.desktop.theme.ErrLight
import com.swarmeditor.desktop.theme.GhostButton
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Motion
import com.swarmeditor.desktop.theme.Ok
import com.swarmeditor.desktop.theme.OkLight
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.Warn
import com.swarmeditor.desktop.theme.WarnLight
import com.swarmeditor.desktop.theme.surfaceCard
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.ui.common.semanticAgentIcon
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
internal fun SwarmArtifactReviewDrawer(
    preview: SwarmArtifactIntegrationPreview,
    selectionPreview: SwarmArtifactSelectionPreview?,
    busy: Boolean,
    onApply: (String, String) -> Unit,
    onReject: (
        String,
        String,
        SwarmArtifactRejectionReason,
        SwarmArtifactRejectionResolution,
        SwarmArtifactRevisionScopeMode,
        Set<String>,
    ) -> Unit,
    onPreviewSelection: (String, String, Set<String>) -> Unit,
    onVisibleHunksChanged: (String, String, Set<String>) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var confirming by remember(preview.planId) { mutableStateOf(false) }
    var rejecting by remember(preview.planId) { mutableStateOf(false) }
    var rejectionReason by remember(preview.planId) { mutableStateOf<SwarmArtifactRejectionReason?>(null) }
    var rejectionResolution by remember(preview.planId) {
        mutableStateOf(SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY)
    }
    var revisionScopeMode by remember(preview.planId) {
        mutableStateOf(SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY)
    }
    var rejectedHunkIds by remember(preview.planId) { mutableStateOf(emptySet<String>()) }
    var viewedHunkIds by remember(preview.planId) { mutableStateOf(emptySet<String>()) }
    val listState = rememberLazyListState()
    val highRiskHunkIds = remember(preview.hunks) {
        preview.hunks.filter { it.riskLevel == SwarmArtifactRiskLevel.HIGH }.mapTo(linkedSetOf()) { it.id }
    }
    val prerequisitesByHunk = remember(preview.hunkDependencies) {
        preview.hunkDependencies.groupBy { it.dependentHunkId }
    }
    val dependentsByHunk = remember(preview.hunkDependencies) {
        preview.hunkDependencies.groupBy { it.prerequisiteHunkId }
    }
    val dependencyComponentByHunk = remember(preview.hunkDependencyComponents) {
        preview.hunkDependencyComponents.flatMap { component ->
            component.hunkIds.map { hunkId -> hunkId to component }
        }.toMap()
    }
    val coupledComponentCount = remember(preview.hunkDependencyComponents) {
        preview.hunkDependencyComponents.count { it.cyclic }
    }
    val applicabilityByHunk = remember(preview.hunkApplicability) {
        preview.hunkApplicability.associateBy { it.hunkId }
    }
    val independentHunkCount = remember(preview.hunkApplicability) {
        preview.hunkApplicability.count {
            it.status == SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE
        }
    }
    val nonIndependentHunkCount = remember(preview.hunkApplicability) {
        preview.hunkApplicability.count {
            it.status == SwarmArtifactHunkApplicabilityStatus.NOT_INDEPENDENTLY_APPLICABLE
        }
    }
    val dependencyContextHunkIds = remember(preview.hunkDependencies, rejectedHunkIds) {
        reviewDependencyContext(preview, rejectedHunkIds)
    }
    val missingHighRiskHunkCount = (highRiskHunkIds - viewedHunkIds).size
    val reviewComplete = missingHighRiskHunkCount == 0 && !preview.truncated
    val activeSelectionPreview = selectionPreview?.takeIf { selection ->
        selection.planId == preview.planId && selection.requestedHunkIds.toSet() == rejectedHunkIds
    }

    LaunchedEffect(preview.planId, preview.hunks, listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo
                .mapNotNull { item -> preview.hunks.getOrNull(item.index)?.id }
                .toSet()
        }.distinctUntilChanged().collect { visibleHunkIds ->
            if (visibleHunkIds.isNotEmpty()) viewedHunkIds = viewedHunkIds + visibleHunkIds
            onVisibleHunksChanged(preview.runId, preview.planId, visibleHunkIds)
        }
    }
    DisposableEffect(preview.planId) {
        onDispose { onVisibleHunksChanged(preview.runId, preview.planId, emptySet()) }
    }
    Column(
        modifier = modifier
            .fillMaxHeight()
            .widthIn(min = 430.dp, max = 680.dp)
            .padding(12.dp)
            .surfaceCard(bg = Bg1, border = Line2, elevation = Elevation.modal, shape = AppShapes.xl)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Ac.withAlpha(0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = semanticAgentIcon("变更审查", "swarm-artifact-review"),
                    contentDescription = null,
                    tint = Ac,
                    modifier = Modifier.size(17.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("变更审查", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text("验证证据 → Diff → 显式应用", color = Tx3, fontSize = 11.sp)
            }
            ReviewBadge(
                text = if (preview.status == SwarmArtifactIntegrationStatus.APPLIED) "已应用" else "已验证",
                color = Ok,
            )
            Spacer(Modifier.width(8.dp))
            GhostButton("关闭", onClick = onClose)
        }

        Spacer(Modifier.height(14.dp))
        EvidenceSummary(preview)
        Spacer(Modifier.height(12.dp))

        if (preview.changedPaths.isNotEmpty()) {
            Text("涉及文件", color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                preview.changedPaths.take(MAX_VISIBLE_PATHS).forEach { changed ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp)).background(Bg2)
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(changed.status, color = Ac, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Text(changed.path, color = Tx2, fontSize = 11.sp, maxLines = 1)
                    }
                }
                if (preview.changedPaths.size > MAX_VISIBLE_PATHS) {
                    Text("另有 ${preview.changedPaths.size - MAX_VISIBLE_PATHS} 个文件", color = Tx3, fontSize = 10.sp)
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Hunk 审查", color = Tx, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(8.dp))
            ReviewBadge("${viewedHunkIds.size.coerceAtMost(preview.hunks.size)}/${preview.hunks.size} 已查看", Ac)
            if (preview.hunkDependencies.isNotEmpty()) {
                Spacer(Modifier.width(7.dp))
                ReviewBadge(
                    text = if (coupledComponentCount == 0) {
                        "${preview.hunkDependencies.size} 条依赖"
                    } else {
                        "${preview.hunkDependencies.size} 依赖 · $coupledComponentCount 耦合组"
                    },
                    color = Ac,
                )
            }
            Spacer(Modifier.weight(1f))
            if (highRiskHunkIds.isNotEmpty()) {
                ReviewBadge(
                    text = if (missingHighRiskHunkCount == 0) "高风险已覆盖" else "$missingHighRiskHunkCount 个高风险未查看",
                    color = if (missingHighRiskHunkCount == 0) Ok else Warn,
                )
                Spacer(Modifier.width(7.dp))
            }
            if (preview.truncated) ReviewBadge("预览已截断", Warn)
        }
        if (preview.hunkApplicability.isNotEmpty()) {
            Spacer(Modifier.height(5.dp))
            Text(
                text = "Git 隔离检查 · $independentHunkCount 可独立应用 · $nonIndependentHunkCount 不能独立应用",
                color = Tx3,
                fontSize = 9.sp,
            )
        }
        Spacer(Modifier.height(7.dp))
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Bg0)
                .surfaceCard(bg = Bg0, border = Line, elevation = Elevation.none, shape = RoundedCornerShape(10.dp))
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (preview.hunks.isEmpty()) {
                item { Text("没有文本差异", color = Tx3, fontSize = 11.sp, modifier = Modifier.padding(8.dp)) }
            } else {
                items(preview.hunks, key = SwarmArtifactDiffHunk::id) { hunk ->
                    DiffHunkCard(
                        hunk = hunk,
                        viewed = hunk.id in viewedHunkIds,
                        selectable = rejecting,
                        selected = hunk.id in rejectedHunkIds,
                        prerequisiteCount = prerequisitesByHunk[hunk.id].orEmpty().size,
                        dependentCount = dependentsByHunk[hunk.id].orEmpty().size,
                        dependencyComponentSize = dependencyComponentByHunk[hunk.id]?.hunkIds?.size ?: 1,
                        applicabilityStatus = applicabilityByHunk[hunk.id]?.status,
                        onToggleSelection = {
                            rejectedHunkIds = if (hunk.id in rejectedHunkIds) {
                                rejectedHunkIds - hunk.id
                            } else {
                                rejectedHunkIds + hunk.id
                            }
                        },
                    )
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        if (preview.status == SwarmArtifactIntegrationStatus.APPLIED) {
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(Ok.withAlpha(0.09f))
                    .padding(horizontal = 11.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = semanticAgentIcon("已应用", "artifact-applied"),
                    contentDescription = null,
                    tint = OkLight,
                    modifier = Modifier.size(15.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text("变更已写入当前工作区，Git HEAD 未移动。", color = OkLight, fontSize = 11.sp)
            }
        } else {
            AnimatedVisibility(
                visible = rejecting,
                enter = fadeIn(Motion.alphaEnter) + expandVertically(Motion.intSizeGentle),
                exit = fadeOut(Motion.alphaExit) + shrinkVertically(Motion.intSizeGentle),
            ) {
                RejectionPanel(
                    selectedReason = rejectionReason,
                    selectedResolution = rejectionResolution,
                    selectedScopeMode = revisionScopeMode,
                    selectedHunkCount = rejectedHunkIds.size,
                    dependencyContextCount = dependencyContextHunkIds.size,
                    selectionPreview = activeSelectionPreview,
                    onReasonSelected = { rejectionReason = it },
                    onResolutionSelected = { rejectionResolution = it },
                    onScopeModeSelected = { revisionScopeMode = it },
                )
            }
            AnimatedVisibility(
                visible = confirming && !rejecting,
                enter = fadeIn(Motion.alphaEnter) + expandVertically(Motion.intSizeGentle),
                exit = fadeOut(Motion.alphaExit) + shrinkVertically(Motion.intSizeGentle),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(Warn.withAlpha(0.09f))
                        .padding(11.dp),
                ) {
                    Text("确认应用到当前工作区？", color = WarnLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(3.dp))
                    Text("应用前会再次校验仓库快照；若工作区已变化，将拒绝旧计划。不会自动提交或移动 HEAD。", color = Tx2, fontSize = 11.sp, lineHeight = 16.sp)
                }
            }
            if (confirming || rejecting) Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (rejecting) {
                    GhostButton(
                        "取消退回",
                        onClick = {
                            if (!busy) {
                                rejecting = false
                                rejectionReason = null
                                rejectedHunkIds = emptySet()
                            }
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                    if (rejectionResolution == SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY) {
                        ActionButton(
                            text = if (activeSelectionPreview == null) "检查范围" else "重新检查",
                            tone = ActionTone.NEUTRAL,
                            prominent = false,
                            enabled = !busy && rejectedHunkIds.isNotEmpty(),
                            compact = true,
                            onClick = {
                                onPreviewSelection(preview.runId, preview.planId, rejectedHunkIds)
                            },
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    ActionButton(
                        text = when {
                            busy -> "处理中…"
                            rejectionResolution == SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY -> "退回并重新验证"
                            else -> "放弃此变更"
                        },
                        tone = ActionTone.WARNING,
                        prominent = true,
                        enabled = !busy && rejectionReason != null,
                        compact = true,
                        onClick = {
                            rejectionReason?.let { reason ->
                                onReject(
                                    preview.runId,
                                    preview.planId,
                                    reason,
                                    rejectionResolution,
                                    revisionScopeMode,
                                    rejectedHunkIds,
                                )
                            }
                        },
                    )
                } else {
                    GhostButton(
                        "拒绝 / 修订",
                        onClick = {
                            if (!busy) {
                                confirming = false
                                rejecting = true
                            }
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                }
                if (confirming && !rejecting) {
                    GhostButton("返回审查", onClick = { if (!busy) confirming = false })
                    Spacer(Modifier.width(8.dp))
                }
                if (!rejecting) {
                    ActionButton(
                        text = when {
                            busy -> "正在校验…"
                            preview.truncated -> "需要完整 Diff"
                            missingHighRiskHunkCount > 0 -> "先查看高风险项"
                            confirming -> "确认应用"
                            else -> "应用到工作区"
                        },
                        tone = if (confirming) ActionTone.WARNING else ActionTone.PRIMARY,
                        prominent = true,
                        enabled = !busy && reviewComplete,
                        compact = true,
                        onClick = {
                            if (confirming) onApply(preview.runId, preview.planId) else confirming = true
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun DiffHunkCard(
    hunk: SwarmArtifactDiffHunk,
    viewed: Boolean,
    selectable: Boolean,
    selected: Boolean,
    prerequisiteCount: Int,
    dependentCount: Int,
    dependencyComponentSize: Int,
    applicabilityStatus: SwarmArtifactHunkApplicabilityStatus?,
    onToggleSelection: () -> Unit,
) {
    val riskColor = when (hunk.riskLevel) {
        SwarmArtifactRiskLevel.HIGH -> Warn
        SwarmArtifactRiskLevel.MEDIUM -> Ac
        SwarmArtifactRiskLevel.LOW -> Tx3
    }
    val horizontal = rememberScrollState()
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
            .clickable(enabled = selectable, onClick = onToggleSelection)
            .background(riskColor.withAlpha(if (viewed) 0.07f else 0.11f))
            .surfaceCard(
                bg = Bg1,
                border = if (selected) Warn else riskColor.withAlpha(0.28f),
                elevation = Elevation.none,
                shape = RoundedCornerShape(9.dp),
            ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(hunk.path, color = Tx, fontSize = 11.sp, fontFamily = FontFamily.Monospace, maxLines = 1)
                Text(hunk.header, color = Tx3, fontSize = 9.sp, fontFamily = FontFamily.Monospace, maxLines = 1)
            }
            Text("+${hunk.addedLineCount}", color = OkLight, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(6.dp))
            Text("-${hunk.removedLineCount}", color = ErrLight, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(8.dp))
            ReviewBadge(riskLabel(hunk.riskLevel), riskColor)
            if (prerequisiteCount > 0) {
                Spacer(Modifier.width(6.dp))
                ReviewBadge("前置 $prerequisiteCount", Ac)
            }
            if (dependentCount > 0) {
                Spacer(Modifier.width(6.dp))
                ReviewBadge("影响 $dependentCount", Tx3)
            }
            if (selectable) {
                Spacer(Modifier.width(6.dp))
                ReviewBadge(if (selected) "已标记" else "标记反馈", if (selected) Warn else Tx3)
            }
        }
        if (hunk.riskReasons.isNotEmpty()) {
            Text(
                text = hunk.riskReasons.joinToString(" · ") { riskReasonLabel(it) },
                color = riskColor,
                fontSize = 9.sp,
                modifier = Modifier.padding(horizontal = 10.dp).padding(bottom = 7.dp),
            )
        }
        if (dependencyComponentSize > 1) {
            Text(
                text = "检测到依赖环 · 建议将同组 $dependencyComponentSize 个 hunk 一并审查",
                color = Ac,
                fontSize = 9.sp,
                modifier = Modifier.padding(horizontal = 10.dp).padding(bottom = 7.dp),
            )
        }
        applicabilityStatus?.let { status ->
            val (label, color) = when (status) {
                SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE ->
                    "Git 隔离检查通过 · 可单独应用到审查基线" to OkLight
                SwarmArtifactHunkApplicabilityStatus.NOT_INDEPENDENTLY_APPLICABLE ->
                    "Git 隔离检查未通过 · 不能单独应用到审查基线" to WarnLight
                SwarmArtifactHunkApplicabilityStatus.UNSUPPORTED ->
                    "该变更类型暂不支持独立应用检查" to Tx3
                SwarmArtifactHunkApplicabilityStatus.SKIPPED_LIMIT ->
                    "超过隔离检查上限 · 尚无独立应用证据" to Tx3
                SwarmArtifactHunkApplicabilityStatus.SKIPPED_TRUNCATED_PREVIEW ->
                    "Diff 预览已截断 · 不执行独立应用检查" to WarnLight
                SwarmArtifactHunkApplicabilityStatus.CHECK_FAILED ->
                    "Git 隔离检查失败 · 不作为可拆分证据" to ErrLight
            }
            Text(
                text = label,
                color = color,
                fontSize = 9.sp,
                modifier = Modifier.padding(horizontal = 10.dp).padding(bottom = 7.dp),
            )
        }
        SelectionContainer {
            Text(
                text = annotatedDiff(hunk.diff),
                color = Tx2,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                softWrap = false,
                modifier = Modifier.fillMaxWidth().background(Bg0).horizontalScroll(horizontal).padding(10.dp),
            )
        }
    }
}

@Composable
private fun RejectionPanel(
    selectedReason: SwarmArtifactRejectionReason?,
    selectedResolution: SwarmArtifactRejectionResolution,
    selectedScopeMode: SwarmArtifactRevisionScopeMode,
    selectedHunkCount: Int,
    dependencyContextCount: Int,
    selectionPreview: SwarmArtifactSelectionPreview?,
    onReasonSelected: (SwarmArtifactRejectionReason) -> Unit,
    onResolutionSelected: (SwarmArtifactRejectionResolution) -> Unit,
    onScopeModeSelected: (SwarmArtifactRevisionScopeMode) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Warn.withAlpha(0.08f))
            .padding(11.dp),
    ) {
        Text("结构化退回", color = WarnLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "请选择原因；可在上方标记具体 hunk。未标记时反馈作用于整份计划，不保存自由文本。",
            color = Tx2,
            fontSize = 10.sp,
            lineHeight = 15.sp,
        )
        Spacer(Modifier.height(8.dp))
        rejectionReasonRows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { reason ->
                    ReviewChoiceChip(
                        text = rejectionReasonLabel(reason),
                        selected = reason == selectedReason,
                        onClick = { onReasonSelected(reason) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(REJECTION_REASON_COLUMNS - row.size) { Spacer(Modifier.weight(1f)) }
            }
            Spacer(Modifier.height(6.dp))
        }
        Text(
            when {
                selectedHunkCount == 0 -> "反馈范围：整份计划"
                dependencyContextCount > 0 -> "反馈范围：$selectedHunkCount 个目标 hunk · $dependencyContextCount 个前置上下文"
                else -> "反馈范围：$selectedHunkCount 个 hunk"
            },
            color = Tx3,
            fontSize = 9.sp,
        )
        selectionPreview?.let { selection ->
            Spacer(Modifier.height(6.dp))
            val (summary, color) = when (selection.applicabilityStatus) {
                SwarmArtifactSelectionApplicabilityStatus.APPLICABLE ->
                    "组合补丁可应用到审查基线" to OkLight
                SwarmArtifactSelectionApplicabilityStatus.NOT_APPLICABLE ->
                    "组合补丁不能应用到审查基线" to WarnLight
                SwarmArtifactSelectionApplicabilityStatus.UNSUPPORTED ->
                    "所选范围包含暂不支持的变更类型" to WarnLight
                SwarmArtifactSelectionApplicabilityStatus.CHECK_FAILED ->
                    "组合补丁检查失败，不作为修订边界证据" to ErrLight
            }
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp)).background(color.withAlpha(0.08f))
                    .padding(horizontal = 9.dp, vertical = 7.dp),
            ) {
                Text(summary, color = color, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "实际范围：${selection.effectiveHunkIds.size} 个 hunk · " +
                        "自动补齐 ${selection.prerequisiteHunkIds.size} 个前置 · ${selection.changedPaths.size} 个文件",
                    color = Tx3,
                    fontSize = 9.sp,
                )
            }
        }
        Spacer(Modifier.height(7.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SwarmArtifactRejectionResolution.entries.forEach { resolution ->
                ReviewChoiceChip(
                    text = rejectionResolutionLabel(resolution),
                    selected = resolution == selectedResolution,
                    onClick = { onResolutionSelected(resolution) },
                )
            }
        }
        if (selectedResolution == SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY) {
            Spacer(Modifier.height(7.dp))
            Text("修订写入边界", color = Tx3, fontSize = 9.sp)
            Spacer(Modifier.height(5.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SwarmArtifactRevisionScopeMode.entries.forEach { scopeMode ->
                    ReviewChoiceChip(
                        text = revisionScopeModeLabel(scopeMode),
                        selected = scopeMode == selectedScopeMode,
                        onClick = { onScopeModeSelected(scopeMode) },
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = when (selectedScopeMode) {
                    SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY -> "仅允许修改反馈目标文件，其他路径由 ownership audit 拒绝。"
                    SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE -> "允许使用原任务声明的完整写入范围，适合补齐关联修复。"
                },
                color = Tx3,
                fontSize = 9.sp,
                lineHeight = 13.sp,
            )
        }
    }
}

@Composable
private fun ReviewChoiceChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text,
        color = if (selected) WarnLight else Tx2,
        fontSize = 9.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        modifier = modifier.clip(RoundedCornerShape(7.dp))
            .background(if (selected) Warn.withAlpha(0.16f) else Bg2)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 7.dp),
    )
}

private val rejectionReasonRows = SwarmArtifactRejectionReason.entries.chunked(REJECTION_REASON_COLUMNS)

private fun rejectionReasonLabel(reason: SwarmArtifactRejectionReason): String = when (reason) {
    SwarmArtifactRejectionReason.ROOT_CAUSE_NOT_FIXED -> "未修根因"
    SwarmArtifactRejectionReason.FUNCTIONAL_INCORRECTNESS -> "功能错误"
    SwarmArtifactRejectionReason.INCOMPLETE_SCOPE -> "修复不完整"
    SwarmArtifactRejectionReason.OUT_OF_SCOPE_CHANGE -> "超出范围"
    SwarmArtifactRejectionReason.BROKEN_DEPENDENCY_OR_API -> "依赖/API 破坏"
    SwarmArtifactRejectionReason.SECURITY_OR_PRIVACY -> "安全/隐私"
    SwarmArtifactRejectionReason.PERFORMANCE_REGRESSION -> "性能回退"
    SwarmArtifactRejectionReason.MAINTAINABILITY -> "可维护性"
    SwarmArtifactRejectionReason.INSUFFICIENT_VERIFICATION -> "验证不足"
}

private fun rejectionResolutionLabel(resolution: SwarmArtifactRejectionResolution): String = when (resolution) {
    SwarmArtifactRejectionResolution.REVISE_AND_REVERIFY -> "修订并重新验证"
    SwarmArtifactRejectionResolution.ABANDON -> "放弃变更"
}

private fun revisionScopeModeLabel(scopeMode: SwarmArtifactRevisionScopeMode): String = when (scopeMode) {
    SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY -> "仅目标文件"
    SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE -> "原任务写入范围"
}

private fun reviewDependencyContext(
    preview: SwarmArtifactIntegrationPreview,
    targetHunkIds: Set<String>,
): Set<String> {
    if (targetHunkIds.isEmpty()) return emptySet()
    val prerequisitesByDependent = preview.hunkDependencies.groupBy(
        keySelector = { it.dependentHunkId },
        valueTransform = { it.prerequisiteHunkId },
    )
    val context = linkedSetOf<String>()
    val pending = ArrayDeque(targetHunkIds)
    while (pending.isNotEmpty()) {
        prerequisitesByDependent[pending.removeFirst()].orEmpty().forEach { prerequisite ->
            if (prerequisite !in targetHunkIds && context.add(prerequisite)) pending.addLast(prerequisite)
        }
    }
    return context
}

private fun riskLabel(level: SwarmArtifactRiskLevel): String = when (level) {
    SwarmArtifactRiskLevel.HIGH -> "高风险"
    SwarmArtifactRiskLevel.MEDIUM -> "需注意"
    SwarmArtifactRiskLevel.LOW -> "常规"
}

private fun riskReasonLabel(reason: SwarmArtifactRiskReason): String = when (reason) {
    SwarmArtifactRiskReason.AUTHORIZATION -> "权限边界"
    SwarmArtifactRiskReason.SECRET_HANDLING -> "敏感信息"
    SwarmArtifactRiskReason.PROCESS_OR_TOOL_EXECUTION -> "进程执行"
    SwarmArtifactRiskReason.PERSISTENCE_OR_MIGRATION -> "持久化"
    SwarmArtifactRiskReason.PUBLIC_CONTRACT -> "公共契约"
    SwarmArtifactRiskReason.BUILD_OR_DEPENDENCY -> "构建依赖"
    SwarmArtifactRiskReason.SANDBOX_BOUNDARY -> "沙箱边界"
    SwarmArtifactRiskReason.BINARY_OR_GENERATED -> "二进制变更"
    SwarmArtifactRiskReason.LARGE_CHANGE -> "大范围变更"
}

@Composable
private fun EvidenceSummary(preview: SwarmArtifactIntegrationPreview) {
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        EvidenceChip("验证", preview.verificationEvidenceId.take(10))
        EvidenceChip("当前", preview.currentRevision.take(8))
        EvidenceChip("计划", preview.integratedRevision.take(8))
        EvidenceChip("文件", preview.changedPaths.size.toString())
    }
}

@Composable
private fun EvidenceChip(label: String, value: String) {
    Column(
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Bg2).padding(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Text(label, color = Tx3, fontSize = 9.sp)
        Text(value, color = Tx2, fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ReviewBadge(text: String, color: Color) {
    Text(
        text = text,
        color = color,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(color.withAlpha(0.11f))
            .padding(horizontal = 7.dp, vertical = 4.dp),
    )
}

private fun annotatedDiff(diff: String): AnnotatedString = buildAnnotatedString {
    diff.lineSequence().forEach { line ->
        val color = when {
            line.startsWith("+++") || line.startsWith("---") -> Tx3
            line.startsWith("+") -> OkLight
            line.startsWith("-") -> ErrLight
            line.startsWith("@@") -> Ac
            else -> Tx2
        }
        pushStyle(SpanStyle(color = color))
        append(line)
        append('\n')
        pop()
    }
}

private const val MAX_VISIBLE_PATHS = 6
private const val REJECTION_REASON_COLUMNS = 3
