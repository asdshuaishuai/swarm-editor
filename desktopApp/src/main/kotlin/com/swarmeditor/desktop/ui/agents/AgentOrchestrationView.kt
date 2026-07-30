package com.swarmeditor.desktop.ui.agents

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.User
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
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmAgentRole
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import com.swarmeditor.desktop.theme.*

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
    onRefresh: () -> Unit = {},
    onConfigClick: (AgentDto) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var objective by remember { mutableStateOf("") }
    val primaryAgent = agents.firstOrNull()
    val latestTasks = remember(swarmRuns) { swarmRuns.maxByOrNull(SwarmRun::updatedAt)?.tasks.orEmpty() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg0)
            .verticalScroll(rememberScrollState())
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
                    imageVector = Feather.User,
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
                    val useWideLayout = maxWidth >= 860.dp
                    AnimatedContent(
                        targetState = useWideLayout,
                        transitionSpec = {
                            (fadeIn(Motion.alphaEnter) togetherWith fadeOut(Motion.alphaExit))
                                .using(SizeTransform(clip = false, sizeAnimationSpec = { _, _ -> Motion.intSizeGentle }))
                        },
                        label = "swarmResponsiveLayout",
                    ) { wideLayout ->
                        if (wideLayout) {
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                SwarmCanvasCard(agents, latestTasks, onConfigClick, Modifier.weight(1.15f))
                                SwarmControlPanel(
                                    objective = objective,
                                    onObjectiveChange = { objective = it },
                                    runs = swarmRuns,
                                    onStart = { onStartSwarm(objective); objective = "" },
                                    onCancel = onCancelSwarm,
                                    onRetry = onRetrySwarm,
                                    modifier = Modifier.weight(0.85f).heightIn(min = 236.dp),
                                )
                            }
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                SwarmCanvasCard(agents, latestTasks, onConfigClick)
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
                }

                Spacer(Modifier.height(20.dp))

                SubagentDispatchQueue(swarmRuns)

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
}

@Composable
private fun SwarmCanvasCard(
    agents: List<AgentDto>,
    tasks: List<SwarmTask>,
    onConfigClick: (AgentDto) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(236.dp)
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
            .animateContentSize(Motion.intSizeGentle)
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
                        .animateContentSize(Motion.intSizeGentle)
                        .clip(RoundedCornerShape(9.dp))
                        .background(statusColor(run.status).withAlpha(0.035f))
                        .border(1.dp, Line, RoundedCornerShape(9.dp))
                        .padding(12.dp)
                ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(run.title, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        val completed = run.tasks.count { it.status == SwarmTaskStatus.SUCCEEDED }
                        AnimatedContent(
                            targetState = run.status to completed,
                            transitionSpec = { fadeIn(Motion.alphaEnter) togetherWith fadeOut(Motion.alphaExit) },
                            label = "swarmRunProgress",
                        ) { (status, finishedTasks) ->
                            Text(
                                "${runStatusLabel(status)} · $finishedTasks/${run.tasks.size} 已完成",
                                color = statusColor(status),
                                fontSize = 11.sp,
                            )
                        }
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
private fun SubagentDispatchQueue(runs: List<SwarmRun>) {
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
            .animateContentSize(Motion.intSizeGentle)
            .surfaceCard(bg = Bg1, elevation = Elevation.none)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(run.title, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "并行上限 ${run.policy.maxParallelism} · ${runStatusLabel(run.status)}",
                    color = Tx3,
                    fontSize = 11.sp,
                )
            }
            StatusPill(runStatusLabel(run.status), statusColor(run.status))
        }

        run.tasks.forEach { task ->
            key(task.id) {
                SubagentTaskItem(task)
            }
        }
    }
}

@Composable
private fun SubagentTaskItem(task: SwarmTask) {
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
            .animateContentSize(Motion.intSizeGentle)
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
                Text(roleLabel(task.role), color = Tx3, fontSize = 10.sp)
            }
            StatusPill(taskStatusLabel(task.status), statusColor)
        }

        Row(
            modifier = Modifier.padding(start = 17.dp, top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DispatchMeta("依赖 ${task.dependsOn.size}")
            DispatchMeta("第 ${task.attempt.coerceAtLeast(1)} 次")
            DispatchMeta("${formatTokenCount(task.tokenUsage.total)} Token")
        }

        val detail = task.errorMessage ?: task.output.takeIf(String::isNotBlank)?.take(180)
        AnimatedVisibility(
            visible = detail != null,
            enter = fadeIn(Motion.alphaEnter) + expandVertically(Motion.intSizeExpand),
            exit = fadeOut(Motion.alphaExit) + shrinkVertically(Motion.intSizeCollapse),
        ) {
            Text(
                text = detail.orEmpty(),
                color = if (task.errorMessage != null) ErrLight else Tx2,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                maxLines = 2,
                modifier = Modifier.padding(start = 17.dp, top = 8.dp),
            )
        }
    }
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
        AnimatedContent(
            targetState = text,
            transitionSpec = { fadeIn(Motion.alphaEnter) togetherWith fadeOut(Motion.alphaExit) },
            label = "statusPillText",
        ) { label ->
            Text(
                text = label,
                color = animatedColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
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
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Bg2)
            .border(1.dp, Line, RoundedCornerShape(8.dp))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = Tx3,
            fontSize = 12.sp
        )
    }
}
