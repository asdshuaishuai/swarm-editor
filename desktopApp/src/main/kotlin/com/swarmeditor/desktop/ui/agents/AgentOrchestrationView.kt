package com.swarmeditor.desktop.ui.agents

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.AgentDto
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmArtifactIntegrationPlan
import com.swarmeditor.common.model.SwarmArtifactIntegrationPreview
import com.swarmeditor.common.model.SwarmArtifactRejectionReason
import com.swarmeditor.common.model.SwarmArtifactRejectionResolution
import com.swarmeditor.common.model.SwarmArtifactRevisionScopeMode
import com.swarmeditor.common.model.SwarmArtifactSelectionPreview
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmSchedulingCandidate
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.common.model.SwarmVerificationStatus
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.ui.common.semanticAgentIcon

private const val AgentSplitLayoutBreakpoint = 860
private const val MAX_VISIBLE_REPOSITORY_EVIDENCE = 8

internal fun useSplitAgentLayout(widthDp: Int): Boolean = widthDp >= AgentSplitLayoutBreakpoint
internal fun swarmOverviewHeightDp(hasRuns: Boolean): Int = if (hasRuns) 236 else 172

/**
 * Agent Orchestration View — aligned with mvp-design-mockup.html
 *
 * Layout:
 * 自适应展示主智能体、子智能体编排与蜂群任务状态。
 */
@Composable
fun AgentOrchestrationView(
    agents: List<AgentDto>,
    swarmRuns: List<SwarmRun> = emptyList(),
    onStartSwarm: (String) -> Unit = {},
    onCancelSwarm: (String) -> Unit = {},
    onRetrySwarm: (String) -> Unit = {},
    artifactReview: SwarmArtifactIntegrationPreview? = null,
    artifactSelectionPreview: SwarmArtifactSelectionPreview? = null,
    artifactActionRunning: Boolean = false,
    onReviewArtifact: (String, String, String?) -> Unit = { _, _, _ -> },
    onApplyArtifact: (String, String) -> Unit = { _, _ -> },
    onRejectArtifact: (
        String,
        String,
        SwarmArtifactRejectionReason,
        SwarmArtifactRejectionResolution,
        SwarmArtifactRevisionScopeMode,
        Set<String>,
    ) -> Unit = { _, _, _, _, _, _ -> },
    onPreviewArtifactSelection: (String, String, Set<String>) -> Unit = { _, _, _ -> },
    onArtifactReviewViewportChanged: (String, String, Set<String>) -> Unit = { _, _, _ -> },
    onCloseArtifactReview: () -> Unit = {},
    onRefresh: () -> Unit = {},
    onConfigClick: (AgentDto) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var objective by remember { mutableStateOf("") }
    val primaryAgent = agents.firstOrNull()
    val latestTasks = remember(swarmRuns) { swarmRuns.maxByOrNull(SwarmRun::updatedAt)?.tasks.orEmpty() }
    val overviewHeight = swarmOverviewHeightDp(swarmRuns.isNotEmpty() || latestTasks.isNotEmpty()).dp

    Box(modifier = modifier.fillMaxSize().background(Bg0)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
        ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Bg1)
                .border(width = 1.dp, color = Line)
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Ac.withAlpha(0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = semanticAgentIcon("智能体编排", "swarm-orchestrator"),
                    contentDescription = "智能体编排",
                    tint = Ac,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    "智能体编排",
                    color = Tx,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "主智能体负责上下文，子智能体按任务动态调度",
                    color = Tx3,
                    fontSize = 12.sp
                )
            }
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (primaryAgent?.status == "connected") Ok.withAlpha(0.12f) else Warn.withAlpha(0.12f))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(7.dp).clip(CircleShape)
                        .background(if (primaryAgent?.status == "connected") OkLight else WarnLight)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    if (primaryAgent?.status == "connected") "执行核心就绪" else "执行核心待检查",
                    color = if (primaryAgent?.status == "connected") OkLight else WarnLight,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.width(8.dp))
            ActionChip("刷新", onClick = onRefresh)
        }

        Box(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .widthIn(max = 1240.dp)
                    .padding(horizontal = 24.dp, vertical = 20.dp)
            ) {
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    if (useSplitAgentLayout(maxWidth.value.toInt())) {
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            SwarmCanvasCard(
                                agents = agents,
                                tasks = latestTasks,
                                onConfigClick = onConfigClick,
                                height = overviewHeight,
                                modifier = Modifier.weight(1.15f),
                            )
                            SwarmControlPanel(
                                objective = objective,
                                onObjectiveChange = { objective = it },
                                runs = swarmRuns,
                                onStart = { onStartSwarm(objective); objective = "" },
                                onCancel = onCancelSwarm,
                                onRetry = onRetrySwarm,
                                modifier = Modifier.weight(0.85f).heightIn(min = overviewHeight),
                            )
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            SwarmCanvasCard(
                                agents = agents,
                                tasks = latestTasks,
                                onConfigClick = onConfigClick,
                                height = overviewHeight,
                            )
                            SwarmControlPanel(
                                objective = objective,
                                onObjectiveChange = { objective = it },
                                runs = swarmRuns,
                                onStart = { onStartSwarm(objective); objective = "" },
                                onCancel = onCancelSwarm,
                                onRetry = onRetrySwarm,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))

                RepositoryEvidencePanel(swarmRuns)

                Spacer(Modifier.height(20.dp))

                SubagentDispatchQueue(swarmRuns, onReviewArtifact)

                Spacer(Modifier.height(20.dp))

                SectionLabel("执行核心", agents.size)
                Spacer(Modifier.height(10.dp))

                if (primaryAgent == null) {
                    EmptySection("主智能体尚未加载，请刷新执行环境")
                } else {
                    AgentCard(
                        agent = primaryAgent,
                        colorIndex = 0,
                        onConfigClick = { onConfigClick(primaryAgent) }
                    )
                }

                Spacer(Modifier.height(20.dp))
            }
            }
        }

        AnimatedVisibility(
            visible = artifactReview != null,
            modifier = Modifier.align(Alignment.CenterEnd).fillMaxHeight(),
            enter = fadeIn(Motion.alphaEnter) + slideInHorizontally(Motion.intOffsetEnter) { width -> width },
            exit = fadeOut(Motion.alphaExit) + slideOutHorizontally(Motion.intOffsetExit) { width -> width },
        ) {
            artifactReview?.let { preview ->
                SwarmArtifactReviewDrawer(
                    preview = preview,
                    selectionPreview = artifactSelectionPreview,
                    busy = artifactActionRunning,
                    onApply = onApplyArtifact,
                    onReject = onRejectArtifact,
                    onPreviewSelection = onPreviewArtifactSelection,
                    onVisibleHunksChanged = onArtifactReviewViewportChanged,
                    onClose = onCloseArtifactReview,
                )
            }
        }
    }
}

@Composable
private fun RepositoryEvidencePanel(runs: List<SwarmRun>) {
    val run = remember(runs) { runs.maxByOrNull(SwarmRun::updatedAt) }
    val bundle = run?.planningEvidence
    val evidence = bundle?.evidence.orEmpty()
    SectionLabel("仓库定位证据", evidence.size)
    Spacer(Modifier.height(10.dp))
    if (bundle == null || evidence.isEmpty()) {
        EmptySection("规划完成后，这里会展示文件、符号、诊断、Git 历史与 SCC 依赖簇证据")
        return
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .surfaceCard(bg = Bg1, elevation = Elevation.none)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "扫描 ${bundle.scannedFileCount} · 候选 ${bundle.candidateFileCount}",
                color = Tx2,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.weight(1f))
            Text(
                "证据预算 ${bundle.consumedCharacters}/${bundle.characterBudget}",
                color = if (bundle.truncated) Warn else Tx3,
                fontSize = 10.sp,
                fontFamily = CodeFont,
            )
        }
        evidence.take(MAX_VISIBLE_REPOSITORY_EVIDENCE).forEach { item ->
            RepositoryEvidenceRow(item)
        }
        if (evidence.size > MAX_VISIBLE_REPOSITORY_EVIDENCE) {
            Text(
                "另有 ${evidence.size - MAX_VISIBLE_REPOSITORY_EVIDENCE} 条证据已持久化到本次蜂群运行",
                color = Tx3,
                fontSize = 10.sp,
            )
        }
    }
}

@Composable
private fun RepositoryEvidenceRow(evidence: SwarmRepositoryEvidence) {
    val color = repositoryEvidenceKindColor(evidence.kind)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.sm)
            .background(color.withAlpha(0.035f))
            .border(1.dp, color.withAlpha(0.16f), AppShapes.sm)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        StatusPill(repositoryEvidenceKindLabel(evidence.kind), color)
        Column(Modifier.weight(1f)) {
            evidence.path?.let { path ->
                Text(
                    buildString {
                        append(path)
                        evidence.line?.let { line -> append(':').append(line) }
                    },
                    color = AcLight,
                    fontSize = 10.sp,
                    fontFamily = CodeFont,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
            }
            Text(evidence.summary, color = Tx2, fontSize = 11.sp, lineHeight = 16.sp)
            evidence.excerpt?.takeIf(String::isNotBlank)?.let { excerpt ->
                Spacer(Modifier.height(3.dp))
                Text(
                    excerpt,
                    color = Tx3,
                    fontSize = 10.sp,
                    fontFamily = CodeFont,
                    maxLines = 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    lineHeight = 14.sp,
                )
            }
        }
        Text(
            "${"%.1f".format(evidence.score)}",
            color = color,
            fontSize = 10.sp,
            fontFamily = CodeFont,
        )
    }
}

internal fun repositoryEvidenceKindLabel(kind: SwarmRepositoryEvidenceKind): String = when (kind) {
    SwarmRepositoryEvidenceKind.FILE_MATCH -> "文件"
    SwarmRepositoryEvidenceKind.SYMBOL -> "符号"
    SwarmRepositoryEvidenceKind.DIAGNOSTIC -> "诊断"
    SwarmRepositoryEvidenceKind.GIT_HISTORY -> "Git"
    SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER -> "SCC 依赖簇"
}

private fun repositoryEvidenceKindColor(kind: SwarmRepositoryEvidenceKind): Color = when (kind) {
    SwarmRepositoryEvidenceKind.FILE_MATCH -> Ac
    SwarmRepositoryEvidenceKind.SYMBOL -> AgentGemini
    SwarmRepositoryEvidenceKind.DIAGNOSTIC -> Warn
    SwarmRepositoryEvidenceKind.GIT_HISTORY -> AgentQwen
    SwarmRepositoryEvidenceKind.DEPENDENCY_CLUSTER -> AgentKimi
}

@Composable
private fun SwarmCanvasCard(
    agents: List<AgentDto>,
    tasks: List<SwarmTask>,
    onConfigClick: (AgentDto) -> Unit,
    height: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.radialGradient(
                    listOf(Ac.withAlpha(0.12f), Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(0.5f, 0.45f),
                    radius = 0.8f,
                ),
            )
            .background(Bg1.withAlpha(0.72f))
            .border(1.dp, Line, RoundedCornerShape(14.dp))
    ) {
        SwarmVisualization(
            agents = agents,
            tasks = tasks,
            onNodeClick = onConfigClick,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun SwarmControlPanel(
    objective: String,
    onObjectiveChange: (String) -> Unit,
    runs: List<SwarmRun>,
    onStart: () -> Unit,
    onCancel: (String) -> Unit,
    onRetry: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val visibleRuns = remember(runs) { runs.take(5) }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Bg1)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(16.dp)
    ) {
        Text("蜂群任务", color = Tx, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            CompactTextField(
                value = objective,
                onValueChange = onObjectiveChange,
                placeholder = "输入需要蜂群完成的目标",
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            ActionChip("启动蜂群", enabled = objective.isNotBlank(), tone = ActionTone.PRIMARY, onClick = onStart)
        }

        visibleRuns.forEach { run ->
            key(run.id) {
                Spacer(Modifier.height(12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(9.dp))
                        .background(statusColor(run.status).withAlpha(0.035f))
                        .border(1.dp, Line, RoundedCornerShape(9.dp))
                        .padding(12.dp)
                ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(run.title, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        val completed = run.tasks.count { it.status == SwarmTaskStatus.SUCCEEDED }
                        Text(
                            "${runStatusLabel(run.status)} · $completed/${run.tasks.size} 已完成",
                            color = statusColor(run.status),
                            fontSize = 11.sp,
                        )
                    }
                    when (run.status) {
                        SwarmRunStatus.RUNNING -> ActionChip(
                            "取消",
                            tone = ActionTone.DESTRUCTIVE,
                            onClick = { onCancel(run.id) },
                        )
                        SwarmRunStatus.FAILED -> ActionChip(
                            "重试",
                            tone = ActionTone.WARNING,
                            onClick = { onRetry(run.id) },
                        )
                        else -> Unit
                    }
                }
                }
            }
        }
    }
}

@Composable
private fun SubagentDispatchQueue(
    runs: List<SwarmRun>,
    onReviewArtifact: (String, String, String?) -> Unit,
) {
    val run = remember(runs) { runs.maxByOrNull(SwarmRun::updatedAt) }
    SectionLabel("子智能体调度队列", run?.tasks?.size ?: 0)
    Spacer(Modifier.height(10.dp))

    if (run == null) {
        EmptySection("启动蜂群后，这里会展示按角色动态创建的子智能体任务")
        return
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .surfaceCard(bg = Bg1, elevation = Elevation.none)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(run.title, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                val schedulingPolicy = run.schedulingDecisions.lastOrNull()?.policyId ?: "等待首轮决策"
                Text(
                    "并行上限 ${run.policy.maxParallelism} · ${runStatusLabel(run.status)} · $schedulingPolicy",
                    color = Tx3,
                    fontSize = 11.sp,
                )
            }
            StatusPill(runStatusLabel(run.status), statusColor(run.status))
        }

        run.tasks.forEach { task ->
            key(task.id) {
                val schedulingCandidate = run.schedulingDecisions
                    .asReversed()
                    .firstNotNullOfOrNull { decision -> decision.candidates.firstOrNull { it.taskId == task.id } }
                val artifactPlan = run.artifactIntegrationPlans
                    .asReversed()
                    .firstOrNull { plan ->
                        plan.taskId == task.id &&
                            plan.attempt == task.attempt &&
                            plan.status in setOf(
                                SwarmArtifactIntegrationStatus.PREPARED,
                                SwarmArtifactIntegrationStatus.APPLIED,
                            )
                    }
                SubagentTaskItem(
                    task = task,
                    schedulingCandidate = schedulingCandidate,
                    artifactPlan = artifactPlan,
                    onReviewArtifact = { onReviewArtifact(run.id, task.id, artifactPlan?.id) },
                )
            }
        }
    }
}

@Composable
private fun SubagentTaskItem(
    task: SwarmTask,
    schedulingCandidate: SwarmSchedulingCandidate?,
    artifactPlan: SwarmArtifactIntegrationPlan?,
    onReviewArtifact: () -> Unit,
) {
    val latestAttempt = task.attemptRecords.lastOrNull()
    val successfulAttempt = task.attemptRecords.lastOrNull { attempt ->
        attempt.attempt == task.attempt && attempt.outcome == SwarmTaskAttemptOutcome.SUCCEEDED
    }
    val reviewAvailable = task.status == SwarmTaskStatus.SUCCEEDED &&
        successfulAttempt?.verificationStatus == SwarmVerificationStatus.PASSED &&
        successfulAttempt.workspaceDeltaEvidenceId != null &&
        successfulAttempt.verificationEvidenceId != null
    val statusColor by animateColorAsState(
        targetValue = taskStatusColor(task.status),
        animationSpec = Motion.colorDefault,
        label = "subagentStatusColor",
    )
    val surfaceColor by animateColorAsState(
        targetValue = taskStatusColor(task.status).withAlpha(
            if (task.status == SwarmTaskStatus.RUNNING) 0.075f else 0.035f,
        ),
        animationSpec = Motion.colorDefault,
        label = "subagentSurfaceColor",
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(9.dp))
            .background(surfaceColor)
            .border(1.dp, Line, RoundedCornerShape(9.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(statusColor))
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(task.title, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    listOfNotNull(
                        roleLabel(task.role),
                        latestAttempt?.resolvedModel?.takeIf(String::isNotBlank),
                    ).joinToString(" · "),
                    color = Tx3,
                    fontSize = 10.sp,
                )
            }
            StatusPill(taskStatusLabel(task.status), statusColor)
        }

        Row(
            modifier = Modifier.padding(start = 17.dp, top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DispatchMeta("依赖 ${task.dependsOn.size}")
            if (task.readPaths.isNotEmpty() || task.writePaths.isNotEmpty()) {
                DispatchMeta("读 ${task.readPaths.size} · 写 ${task.writePaths.size}")
            }
            DispatchMeta("第 ${task.attempt.coerceAtLeast(1)} 次")
            DispatchMeta("${formatTokenCount(task.tokenUsage.total)} Token")
            if (successfulAttempt?.verificationStatus == SwarmVerificationStatus.PASSED) {
                DispatchMeta("机械验证通过")
            }
            schedulingCandidate?.estimatedUtility?.let { utility ->
                DispatchMeta("DP ${String.format(java.util.Locale.ROOT, "%.2f", utility)}")
            }
        }

        task.revisionContract?.let { contract ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 17.dp, top = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Ac.withAlpha(0.07f))
                    .border(1.dp, Ac.withAlpha(0.18f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 9.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = semanticAgentIcon("修订链路", "revision-contract"),
                    contentDescription = null,
                    tint = Ac,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "源任务 ${contract.sourceTaskId} · attempt ${contract.sourceAttempt}",
                        color = Tx2,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "${revisionReasonLabel(contract.rejectionReason)} · ${revisionScopeLabel(contract.scopeMode)} · " +
                            "${contract.targetPaths.size} 目标路径 · ${contract.contextHunkIds.size} 依赖上下文",
                        color = Tx3,
                        fontSize = 9.sp,
                        maxLines = 1,
                    )
                }
                Text(
                    contract.sourceArtifactRevision.take(8),
                    color = Ac,
                    fontSize = 9.sp,
                    fontFamily = CodeFont,
                )
            }
        }

        val detail = task.errorMessage ?: task.output.takeIf(String::isNotBlank)?.take(180)
        if (detail != null) {
            Text(
                text = detail,
                color = if (task.errorMessage != null) ErrLight else Tx2,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                maxLines = 2,
                modifier = Modifier.padding(start = 17.dp, top = 8.dp),
            )
        } else if (schedulingCandidate != null && task.status in setOf(SwarmTaskStatus.PENDING, SwarmTaskStatus.RUNNING)) {
            Text(
                text = schedulingCandidate.reason,
                color = Tx3,
                fontSize = 10.sp,
                lineHeight = 14.sp,
                maxLines = 2,
                modifier = Modifier.padding(start = 17.dp, top = 8.dp),
            )
        }

        if (reviewAvailable) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 17.dp, top = 9.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                ActionChip(
                    text = when (artifactPlan?.status) {
                        SwarmArtifactIntegrationStatus.PREPARED -> "查看审查"
                        SwarmArtifactIntegrationStatus.APPLIED -> "查看已应用"
                        else -> "生成审查"
                    },
                    tone = if (artifactPlan?.status == SwarmArtifactIntegrationStatus.APPLIED) {
                        ActionTone.NEUTRAL
                    } else {
                        ActionTone.PRIMARY
                    },
                    onClick = onReviewArtifact,
                )
            }
        }
    }
}

private fun revisionReasonLabel(reason: SwarmArtifactRejectionReason): String = when (reason) {
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

private fun revisionScopeLabel(scopeMode: SwarmArtifactRevisionScopeMode): String = when (scopeMode) {
    SwarmArtifactRevisionScopeMode.TARGET_PATHS_ONLY -> "仅目标文件"
    SwarmArtifactRevisionScopeMode.SOURCE_WRITE_SCOPE -> "原任务写域"
}

@Composable
private fun DispatchMeta(text: String) {
    Text(
        text = text,
        color = Tx3,
        fontSize = 10.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(5.dp))
            .background(Bg2)
            .padding(horizontal = 7.dp, vertical = 3.dp),
    )
}

@Composable
private fun StatusPill(text: String, color: Color) {
    val animatedColor by animateColorAsState(color, Motion.colorDefault, label = "statusPillColor")
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(5.dp))
            .background(animatedColor.withAlpha(0.12f))
            .padding(horizontal = 7.dp, vertical = 3.dp),
    ) {
        Text(
            text = text,
            color = animatedColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ActionChip(
    text: String,
    enabled: Boolean = true,
    tone: ActionTone = ActionTone.NEUTRAL,
    onClick: () -> Unit,
) {
    ActionButton(
        text = text,
        tone = tone,
        prominent = tone != ActionTone.NEUTRAL,
        enabled = enabled,
        compact = true,
        onClick = onClick,
    )
}

private fun statusColor(status: SwarmRunStatus): Color = when (status) {
    SwarmRunStatus.SUCCEEDED -> Ok
    SwarmRunStatus.FAILED -> Err
    SwarmRunStatus.CANCELED -> Tx3
    SwarmRunStatus.RUNNING -> Ac
    SwarmRunStatus.CREATED -> Tx2
}

private fun runStatusLabel(status: SwarmRunStatus): String = when (status) {
    SwarmRunStatus.CREATED -> "等待调度"
    SwarmRunStatus.RUNNING -> "调度中"
    SwarmRunStatus.SUCCEEDED -> "已完成"
    SwarmRunStatus.FAILED -> "执行失败"
    SwarmRunStatus.CANCELED -> "已取消"
}

private fun taskStatusLabel(status: SwarmTaskStatus): String = when (status) {
    SwarmTaskStatus.PENDING -> "等待"
    SwarmTaskStatus.RUNNING -> "执行中"
    SwarmTaskStatus.SUCCEEDED -> "完成"
    SwarmTaskStatus.FAILED -> "失败"
    SwarmTaskStatus.BLOCKED -> "阻塞"
    SwarmTaskStatus.CANCELED -> "取消"
}

private fun roleLabel(role: SwarmAgentRole): String = when (role) {
    SwarmAgentRole.PLANNER -> "规划子智能体"
    SwarmAgentRole.IMPLEMENTER -> "实现子智能体"
    SwarmAgentRole.REVIEWER -> "审查子智能体"
    SwarmAgentRole.INTEGRATOR -> "集成子智能体"
    SwarmAgentRole.GENERAL -> "通用子智能体"
}

private fun formatTokenCount(tokens: Long): String = when {
    tokens >= 1_000_000 -> "%.1fM".format(tokens / 1_000_000.0)
    tokens >= 1_000 -> "%.1fK".format(tokens / 1_000.0)
    else -> tokens.toString()
}

private fun taskStatusColor(status: SwarmTaskStatus): Color = when (status) {
    SwarmTaskStatus.SUCCEEDED -> Ok
    SwarmTaskStatus.FAILED -> Err
    SwarmTaskStatus.RUNNING -> Ac
    SwarmTaskStatus.BLOCKED -> Warn
    SwarmTaskStatus.CANCELED -> Tx3
    SwarmTaskStatus.PENDING -> Tx3
}

@Composable
private fun SectionLabel(title: String, count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            title.uppercase(),
            color = Tx3,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.6.sp
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "($count)",
            color = Tx3,
            fontSize = 11.sp
        )
    }
}

@Composable
private fun EmptySection(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Bg2)
            .border(1.dp, Line, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = semanticAgentIcon("空闲智能体", "agent-empty-state"),
            contentDescription = null,
            tint = Tx3,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.width(9.dp))
        Text(
            text,
            color = Tx3,
            fontSize = 12.sp,
        )
    }
}
