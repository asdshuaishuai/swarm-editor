package com.swarmeditor.desktop.ui.settings

import androidx.compose.foundation.background
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.PRIMARY_AGENT_ID
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.SettingsViewModel
import com.swarmeditor.desktop.viewmodel.KotlinLspRuntimeUiState
import com.swarmeditor.backend.lsp.KotlinLspRuntimeHealth
import com.swarmeditor.backend.lsp.LspConnectionPhase
import com.swarmeditor.backend.pi.PiModelInfo
import com.swarmeditor.common.model.ModelConfig

private const val DEFAULT_SETTINGS_TAB = "agent"
private val SETTINGS_TAB_IDS = setOf(
    "agent",
    "models",
    "mcp",
    "skills",
    "code-intelligence",
    "general",
    "appearance",
    "shortcuts",
    "about",
)

internal fun normalizeSettingsTab(tabId: String?): String =
    tabId?.takeIf(SETTINGS_TAB_IDS::contains) ?: DEFAULT_SETTINGS_TAB

@Composable
fun SettingsModal(
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
    onClose: () -> Unit,
    mcpServers: List<McpServerDto> = emptyList(),
    skills: List<SkillDto> = emptyList(),
    onRefreshMcp: () -> Unit = {},
    onAddMcp: () -> Unit = {},
    onEditMcp: (String) -> Unit = {},
    themeMode: AppThemeMode = AppThemeMode.FUSION,
    onThemeChange: (AppThemeMode) -> Unit = {},
    projectPath: String = "",
    kotlinLspState: KotlinLspRuntimeUiState = KotlinLspRuntimeUiState(),
    onRefreshKotlinLsp: () -> Unit = {},
    onInstallKotlinLsp: () -> Unit = {},
    onProbeKotlinLsp: () -> Unit = {},
    onOpenKotlinLspDirectory: () -> Unit = {},
    piModels: List<PiModelInfo> = emptyList(),
    onRefreshPiModels: () -> Unit = {},
) {
    var activeTab by remember { mutableStateOf(normalizeSettingsTab(System.getProperty("swarm.settingsTab"))) }
    val primaryModelId by settingsVm.primaryModelId.collectAsState()
    val configPath by settingsVm.configPath.collectAsState()
    val models by settingsVm.models.collectAsState()
    val selectedModelId by settingsVm.selectedModelId.collectAsState()
    val modelFields by settingsVm.modelConfigFields.collectAsState()
    val modelConfigPath by settingsVm.modelConfigPath.collectAsState()

    val tabs = listOf(
        SettingsTile("agent", "PI", "主智能体", "默认主模型与动态子智能体", ControlBlue, if (agents.any { it.isConnected }) "在线" else "离线"),
        SettingsTile("models", "M", "模型池", "Pi 模型目录与调度策略", ControlPurple, models.count { it.enabled }.toString()),
        SettingsTile("mcp", "M", "MCP 服务", "工具桥接与授权", ControlOrange, mcpServers.size.toString()),
        SettingsTile("skills", "S", "Skills 能力", "本地能力与同步", ControlGreen, skills.size.toString()),
        SettingsTile(
            "code-intelligence",
            "LSP",
            "代码智能",
            "语言服务器、语义高亮与诊断",
            ControlBlue,
            if (kotlinLspState.connectionPhase == LspConnectionPhase.CONNECTED) "在线" else lspRuntimeBadge(kotlinLspState),
        ),
        SettingsTile("general", "W", "工作区", "目录、默认行为与持久化", AgentKimi),
        SettingsTile("appearance", "A", "外观", "统一 Fusion 语言与字体", AgentClaude),
        SettingsTile("shortcuts", "⌘", "快捷键", "导航与编辑效率", ControlPurple),
        SettingsTile("about", "i", "关于", "版本与运行环境", Tx2),
    )

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .modalInputBarrier()
            .overlayBackdrop(OverlayDepth.PRIMARY)
            .padding(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        val dialogWidth = minOf(maxWidth * 0.92f, 1120.dp)
        val dialogHeight = minOf(maxHeight * 0.88f, 780.dp)
        Column(
            modifier = Modifier
                .width(dialogWidth)
                .height(dialogHeight)
                .layeredSurface(
                    depth = OverlayDepth.PRIMARY,
                    bg = Bg1.copy(alpha = 0.975f),
                    border = Line2,
                    shape = AppShapes.xl,
                ),
        ) {
            // Header
            Row(modifier = Modifier.fillMaxWidth().height(56.dp).background(Bg0.copy(alpha = 0.88f)).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("设置中心", color = Tx, style = AppType.headline)
                    Text("工作区、Pi Runtime、扩展能力与界面行为", color = Tx3, style = AppType.bodySm)
                }
                Spacer(Modifier.weight(1f))
                Box(modifier = Modifier.size(30.dp).fluidClickable(onClick = onClose).clip(AppShapes.sm).background(Bg2).border(1.dp, Line, AppShapes.sm), contentAlignment = Alignment.Center) {
                    Icon(imageVector = Feather.X, contentDescription = "关闭设置", tint = Tx2, modifier = Modifier.size(16.dp))
                }
            }
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                Column(modifier = Modifier.width(224.dp).fillMaxHeight().background(Bg0.copy(alpha = 0.72f)).padding(horizontal = 9.dp, vertical = 10.dp)) {
                    Text("设置分类", color = Tx3, style = AppType.micro, letterSpacing = 1.sp)
                    Spacer(Modifier.height(8.dp))
                    tabs.forEach { tile ->
                        MetroSettingsTile(
                            tile = tile,
                            active = activeTab == tile.id,
                            onClick = { activeTab = tile.id },
                        )
                        Spacer(Modifier.height(4.dp))
                    }
                }
                // Body
                Box(modifier = Modifier.weight(1f).fillMaxHeight().padding(10.dp).surfaceCard(bg = Bg2.copy(alpha = 0.82f), border = Line2, elevation = Elevation.medium, shape = AppShapes.lg)) {
                    when (activeTab) {
                        "agent" -> AgentConfigTab(agents, models, primaryModelId, configPath, settingsVm)
                        "models" -> ModelConfigTab(
                            models = models,
                            selectedId = selectedModelId,
                            onSelect = settingsVm::selectModel,
                            fields = modelFields,
                            configPath = modelConfigPath,
                            settingsVm = settingsVm,
                            piModels = piModels,
                            onRefreshPiModels = onRefreshPiModels,
                        )
                    "mcp" -> McpManagementTab(
                        servers = mcpServers,
                        agents = agents,
                        settingsVm = settingsVm,
                        onRefresh = onRefreshMcp,
                        onAdd = onAddMcp,
                        onEdit = onEditMcp
                    )
                        "skills" -> SkillsManagementTab(skills, agents, settingsVm)
                        "code-intelligence" -> CodeIntelligenceTab(
                            state = kotlinLspState,
                            onRefresh = onRefreshKotlinLsp,
                            onInstall = onInstallKotlinLsp,
                            onProbe = onProbeKotlinLsp,
                            onOpenDirectory = onOpenKotlinLspDirectory,
                        )
                        "general" -> GeneralTab(projectPath)
                        "appearance" -> AppearanceTab(themeMode, onThemeChange)
                        "shortcuts" -> ShortcutsTab()
                        "about" -> AboutTab()
                    }
                }
            }
            // Footer
            Row(modifier = Modifier.fillMaxWidth().background(Bg0.copy(alpha = 0.88f)).border(1.dp, Line).padding(horizontal = 18.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(Ok))
                Spacer(Modifier.width(7.dp))
                Text("选项即时保存；文本字段在失焦后写入本地配置", color = Tx3, style = AppType.caption)
                Spacer(Modifier.weight(1f))
                GhostButton("关闭", onClick = onClose)
            }
        }
    }
}

private data class SettingsTile(
    val id: String,
    val symbol: String,
    val label: String,
    val description: String,
    val tone: Color,
    val badge: String? = null,
)

@Composable
private fun MetroSettingsTile(
    tile: SettingsTile,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        targetValue = when {
            active -> tile.tone.copy(alpha = 0.16f)
            hovered -> Bg3.copy(alpha = 0.9f)
            else -> Color.Transparent
        },
        animationSpec = Motion.colorDefault,
        label = "settingsTileBackground",
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .fluidClickable(interactionSource = interaction, onClick = onClick)
            .clip(AppShapes.sm)
            .background(background)
            .border(1.dp, if (active) tile.tone.copy(alpha = 0.38f) else if (hovered) Line2 else Color.Transparent, AppShapes.sm)
            .semantics {
                selected = active
                contentDescription = buildString {
                    append(tile.label)
                    append("，")
                    append(tile.description)
                    tile.badge?.let { append("，$it") }
                }
            }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(28.dp).clip(AppShapes.sm).background(if (active) tile.tone else tile.tone.withAlpha(0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(tile.symbol, color = if (active) OnAccent else tile.tone, style = AppType.micro, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(tile.label, color = if (active) Tx else Tx2, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
            Text(tile.description, color = Tx3, style = AppType.micro, maxLines = 1)
        }
        tile.badge?.let {
            val isStatus = it == "在线" || it == "离线"
            val badgeColor = if (isStatus && it == "在线") Ok else if (isStatus) Tx3 else tile.tone
            Box(
                Modifier.clip(AppShapes.pill).background(badgeColor.withAlpha(0.12f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(it, color = badgeColor, style = AppType.micro, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ==================== Agent 配置 Tab ====================
@Composable
private fun AgentConfigTab(
    agents: List<AgentInfo>,
    models: List<ModelConfig>,
    primaryModelId: String,
    configPath: String,
    settingsVm: SettingsViewModel,
) {
    val scrollState = rememberScrollState()
    val canScrollDown by remember {
        derivedStateOf { scrollState.maxValue > 0 && scrollState.value < scrollState.maxValue }
    }
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 44.dp)
                .verticalScroll(scrollState)
                .padding(start = 16.dp, top = 16.dp, end = 30.dp, bottom = 20.dp)
        ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Pi 主智能体", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
                Text("负责理解目标、拆解任务，并按需创建临时子智能体", color = Tx3, style = AppType.micro)
                Spacer(Modifier.height(7.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MicroPill("DYNAMIC AGENTS", AcLight)
                    MicroPill("PI NATIVE", AgentGemini)
                    if (agents.any { it.isConnected }) MicroPill("READY", OkLight)
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth().clip(AppShapes.md).background(Ac.withAlpha(0.08f))
                .border(1.dp, Ac.withAlpha(0.2f), AppShapes.md).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(Ac))
            Spacer(Modifier.width(9.dp))
            Column {
                Text("子智能体不会写入静态 Profile", color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
                Text("主智能体使用指定主模型；子智能体按职责、能力与负载从模型池动态生成。", color = Tx3, style = AppType.caption)
            }
        }
        Spacer(Modifier.height(16.dp))

        // 连接信息
        val agent = agents.find { it.id == PRIMARY_AGENT_ID } ?: agents.firstOrNull()
        if (agent != null) {
            Section("连接") {
                InfoRow("状态", if (agent.isConnected) "已连接" else "未连接", if (agent.isConnected) AgentGemini else Tx3)
                if (agent.version.isNotEmpty()) InfoRow("版本", agent.version)
                InfoRow("配置文件", configPath.ifEmpty { "未检测" }, Tx3, AppType.caption)
            }
            Spacer(Modifier.height(14.dp))
        }

        Section("主模型") {
            Text(
                "主智能体是系统默认协调者，不需要单独维护名称、提示词或工作目录。这里只指定它使用的模型。",
                color = Tx3,
                style = AppType.bodySm,
            )
            Spacer(Modifier.height(10.dp))
            if (models.isEmpty()) {
                Text("模型池为空，请先在“模型池”中添加可用模型。", color = WarnLight, style = AppType.bodySm)
            } else {
                models.forEach { model ->
                    PrimaryModelOption(
                        model = model,
                        selected = model.id == primaryModelId,
                        onSelect = { settingsVm.setPrimaryModel(model.id) },
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Section("动态子智能体") {
            InfoRow("生成方式", "按任务职责即时创建")
            InfoRow("模型分配", "职责标签 + 推理需求 + 可用并发")
            InfoRow("生命周期", "任务结束后自动释放")
            InfoRow("静态 Profile", "不创建、不持久化", AgentGemini)
        }
        }
        CompositionLocalProvider(
            LocalScrollbarStyle provides ScrollbarStyle(
                minimalHeight = 32.dp,
                thickness = 8.dp,
                shape = RoundedCornerShape(4.dp),
                hoverDurationMillis = 150,
                unhoverColor = Tx3.withAlpha(0.58f),
                hoverColor = Ac.withAlpha(0.82f),
            )
        ) {
            VerticalScrollbar(
                adapter = rememberScrollbarAdapter(scrollState),
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .padding(top = 12.dp, bottom = 52.dp, start = 7.dp, end = 7.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Line.withAlpha(0.24f)),
            )
        }
        AnimatedVisibility(
            visible = canScrollDown,
            enter = fadeIn(Motion.alphaEnter),
            exit = fadeOut(Motion.alphaExit),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Bg2.withAlpha(0.96f)),
                        )
                    )
                    .padding(bottom = 7.dp),
                contentAlignment = Alignment.BottomCenter,
            ) {
                Text(
                    "向下滚动查看更多设置  ↓",
                    color = Tx2,
                    style = AppType.micro,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun PrimaryModelOption(
    model: ModelConfig,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    val enabled = model.enabled
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.md)
            .background(if (selected) Ac.withAlpha(0.1f) else Bg3)
            .border(1.dp, if (selected) Ac.withAlpha(0.42f) else Line2, AppShapes.md)
            .clickable(enabled = enabled && !selected, onClick = onSelect)
            .semantics {
                this.selected = selected
                contentDescription = "${model.name} 主模型${if (selected) "，已选择" else ""}"
            }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(9.dp).clip(CircleShape)
                .background(if (selected) Ac else if (enabled) Ok else Tx3)
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(model.name, color = if (enabled) Tx else Tx3, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
            Text(
                listOf(model.provider, model.model).filter(String::isNotBlank).joinToString(" / ").ifBlank { model.id },
                color = Tx3,
                style = AppType.caption.copy(fontFamily = CodeFont),
            )
        }
        Text(
            when {
                selected -> "主模型"
                !enabled -> "已停用"
                else -> "选择"
            },
            color = if (selected) AcLight else Tx3,
            style = AppType.caption,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

// ==================== 模型池 Tab ====================
@Composable
private fun ModelConfigTab(
    models: List<ModelConfig>,
    selectedId: String,
    onSelect: (String) -> Unit,
    fields: List<com.swarmeditor.desktop.viewmodel.ModelConfigField>,
    configPath: String,
    settingsVm: SettingsViewModel,
    piModels: List<PiModelInfo>,
    onRefreshPiModels: () -> Unit,
) {
    val scrollState = rememberScrollState()
    val selectorScrollState = rememberScrollState()
    val selected = models.firstOrNull { it.id == selectedId } ?: models.firstOrNull()
    Column(Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("模型池", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
                Text("模型身份、Provider 与能力完全来自 Pi Agent；这里只维护调度策略", color = Tx3, style = AppType.micro)
                Spacer(Modifier.height(7.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MicroPill("${models.count { it.enabled }} ENABLED", OkLight)
                    MicroPill("${piModels.size} FROM PI", AcLight)
                }
            }
            GlowButton("刷新 Pi 目录", onClick = onRefreshPiModels)
        }
        if (piModels.isEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("启动主智能体会话后刷新，Swarm 会从 Pi 的 get_available_models 同步模型与能力。", color = WarnLight, style = AppType.caption)
        }
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.fillMaxWidth().clip(AppShapes.sm).background(Bg3)
                .horizontalScroll(selectorScrollState).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            models.forEach { model ->
                val active = model.id == selected?.id
                val background by animateColorAsState(
                    if (active) Ac.withAlpha(0.14f) else Color.Transparent,
                    Motion.colorDefault,
                    label = "modelSelectorBackground",
                )
                Column(
                    Modifier.width(164.dp).clip(AppShapes.sm).background(background)
                        .fluidClickable { onSelect(model.id) }.padding(horizontal = 10.dp, vertical = 8.dp)
                        .semantics { this.selected = active; contentDescription = "${model.name} 模型配置" }
                ) {
                    Text(model.name, color = if (active) AcLight else Tx2, style = AppType.bodySm, maxLines = 1)
                    Text(
                        listOf(model.provider, model.model).filter(String::isNotBlank).joinToString(" / ").ifBlank { "使用 Pi 默认模型" },
                        color = Tx3,
                        style = AppType.micro,
                        maxLines = 1,
                    )
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Section("Pi 模型身份") {
            InfoRow("配置文件", configPath, Tx3, AppType.caption)
            if (selected != null) {
                InfoRow("Provider", selected.provider.ifBlank { "Pi 自动选择" })
                InfoRow("模型 ID", selected.model.ifBlank { "由 Pi 决定" }, Tx3, AppType.caption.copy(fontFamily = CodeFont))
                if (selected.api.isNotBlank()) InfoRow("API", selected.api)
                InfoRow("推理", if (selected.reasoning) "支持" else "不支持")
                if (selected.contextWindow > 0) InfoRow("上下文窗口", selected.contextWindow.toString())
                if (selected.maxTokens > 0) InfoRow("最大输出", selected.maxTokens.toString())
                if (selected.inputModes.isNotEmpty()) InfoRow("输入模式", selected.inputModes.joinToString(" · "))
            }
        }
        Spacer(Modifier.height(12.dp))
        Section("Swarm 调度覆盖") {
            Text("凭据、Base URL、自定义 Provider 与模型发现均由 Pi 自己的配置体系管理。", color = Tx3, style = AppType.caption)
            Spacer(Modifier.height(6.dp))
            ConfigFieldGrid(fields, settingsVm::saveModelField)
        }
    }
}

// ==================== MCP 管理 Tab ====================
@Composable
private fun McpManagementTab(
    servers: List<McpServerDto>,
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
    onRefresh: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (String) -> Unit
) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("MCP Servers", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            ActionButton("刷新", tone = ActionTone.NEUTRAL, prominent = false, compact = true, onClick = onRefresh)
            Spacer(Modifier.width(6.dp))
            ActionButton("+ 添加", tone = ActionTone.PRIMARY, compact = true, onClick = onAdd)
        }
        Spacer(Modifier.height(16.dp))
        if (servers.isEmpty()) {
            Text("暂无 MCP Server 配置", color = Tx3, style = AppType.bodySm)
        }
        servers.forEach { server ->
            McpMgmtCard(server, agents, settingsVm, onEdit)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun McpMgmtCard(
    server: McpServerDto,
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
    onEdit: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(6.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(server.name, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(6.dp))
            Text(server.type, color = Ac, style = AppType.micro,
                modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(Ac.withAlpha(0.12f)).padding(horizontal = 5.dp, vertical = 1.dp))
            Spacer(Modifier.weight(1f))
            ActionButton(
                "编辑",
                tone = ActionTone.SECONDARY,
                prominent = false,
                compact = true,
                onClick = { onEdit(server.id) },
            )
            Spacer(Modifier.width(4.dp))
            ActionButton(
                "删除",
                tone = ActionTone.DESTRUCTIVE,
                prominent = false,
                compact = true,
                onClick = { settingsVm.deleteMcpServer(server.id) },
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(server.command.ifEmpty { server.url }, color = Tx3, style = AppType.caption, maxLines = 1)
        Spacer(Modifier.height(8.dp))
        // Per-Agent 启用
        Row { agents.forEach { agent ->
            val isOn = server.enabledAgents.isEmpty() || server.enabledAgents[agent.id] == true
            AgentToggle(agent.name, isOn) { settingsVm.toggleMcpAgent(server.id, agent.id, !isOn) }
            Spacer(Modifier.width(5.dp))
        }}
    }
}

// ==================== Skills 管理 Tab ====================
@Composable
private fun SkillsManagementTab(
    skills: List<SkillDto>,
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Skills 管理", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            ActionButton(
                "扫描",
                tone = ActionTone.SECONDARY,
                prominent = false,
                compact = true,
                onClick = settingsVm::scanSkills,
            )
        }
        Spacer(Modifier.height(12.dp))
        Text("自动扫描本机常见工具目录中的用户级 Skills；授权会同步到对应 Pi Profile。", color = Tx3, style = AppType.caption,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(10.dp))
        Spacer(Modifier.height(16.dp))
        if (skills.isEmpty()) {
            Text("暂无 Skills，点击扫描发现", color = Tx3, style = AppType.bodySm)
        }
        skills.forEach { skill ->
            SkillMgmtCard(skill, agents, settingsVm)
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun SkillMgmtCard(
    skill: SkillDto,
    agents: List<AgentInfo>,
    settingsVm: SettingsViewModel,
) {
    val isMcp = skill.source.equals("MCP", true)
    val accent = if (isMcp) AgentQwen else AgentGemini
    val enabled = skill.enabledAgents.isEmpty() || skill.enabledAgents.values.any { it }
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Bg2.withAlpha(0.5f)).border(1.dp, Line, RoundedCornerShape(12.dp)).padding(14.dp)
    ) {
        // 头部：图标 + 名称/来源 + 状态
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(accent.withAlpha(0.15f)),
                contentAlignment = Alignment.Center
            ) { Text(if (isMcp) "🔌" else "🧩", fontSize = 16.sp) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(skill.name, color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text("${skill.source} · ${skill.tags.size} 标签", color = Tx3, style = AppType.caption)
            }
            Text(
                if (enabled) "已启用" else "已禁用", color = if (enabled) OkLight else Tx3, style = AppType.micro,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background((if (enabled) Ok else Tx3).withAlpha(0.12f)).padding(horizontal = 7.dp, vertical = 2.dp)
            )
        }
        if (skill.description.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(skill.description, color = Tx2, style = AppType.bodySm, maxLines = 2)
        }
        // Skill 标签
        if (skill.tags.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                skill.tags.take(4).forEach { t ->
                    Text(t, color = AcLight, style = AppType.micro, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Ac.withAlpha(0.12f)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }
        }
        // Pi Profile 授权
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            agents.forEach { agent ->
                val isOn = skill.enabledAgents.isEmpty() || skill.enabledAgents[agent.id] == true
                AgentToggle(agent.name, isOn) {
                    settingsVm.toggleSkillAgent(skill.id, agent.id, !isOn)
                }
            }
        }
    }
}

// ==================== 通用组件 ====================
@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), color = Tx3, style = AppType.micro, letterSpacing = 0.8.sp)
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f).height(1.dp).background(Line))
    }
    Spacer(Modifier.height(10.dp))
    content()
}

@Composable
private fun InfoRow(
    label: String,
    value: String,
    valueColor: Color = Tx2,
    valueStyle: TextStyle = AppType.bodySm,
) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tx3, style = AppType.bodySm, modifier = Modifier.width(90.dp))
        Text(value, color = valueColor, style = valueStyle)
    }
}

@Composable
private fun EditableField(field: com.swarmeditor.desktop.viewmodel.ModelConfigField, onSave: (String, String) -> Unit) {
    var editValue by remember(field.label, field.value) { mutableStateOf(field.value) }
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Text(field.label.localizedConfigLabel(), color = Tx3, style = AppType.caption, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(6.dp))
        if (field.isSelect) {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                field.options.forEach { option ->
                    val selected = editValue == option
                    Text(
                        text = option,
                        color = if (selected) OnAccent else Tx2,
                        style = AppType.caption.copy(fontFamily = CodeFont),
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier
                            .clip(AppShapes.sm)
                            .background(if (selected) Ac else Bg3)
                            .border(1.dp, if (selected) AcLight.withAlpha(0.3f) else Line2, AppShapes.sm)
                            .clickable {
                                if (!selected) {
                                    editValue = option
                                    onSave(field.label, option)
                                }
                            }
                            .padding(horizontal = 11.dp, vertical = 7.dp)
                    )
                }
            }
        } else {
            val multiline = field.label == "Roles"
            BasicTextField(
                value = editValue,
                onValueChange = { editValue = it },
                singleLine = !multiline,
                minLines = if (multiline) 2 else 1,
                maxLines = if (multiline) 5 else 1,
                textStyle = AppType.bodySm.copy(color = Tx),
                cursorBrush = SolidColor(Ac),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(AppShapes.sm)
                    .background(Bg3)
                    .border(1.dp, Line2, AppShapes.sm)
                    .onFocusChanged { state ->
                        if (!state.isFocused && editValue != field.value) onSave(field.label, editValue)
                    }
                    .padding(horizontal = 11.dp, vertical = 9.dp),
                decorationBox = { innerField ->
                    Box {
                        if (editValue.isEmpty()) {
                            Text("未配置", color = Tx3.withAlpha(0.7f), style = AppType.bodySm)
                        }
                        innerField()
                    }
                }
            )
        }
    }
}

@Composable
private fun ConfigFieldGrid(
    fields: List<com.swarmeditor.desktop.viewmodel.ModelConfigField>,
    onSave: (String, String) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val fullWidthLabels = setOf("Roles")
        val compact = fields.filterNot { it.label in fullWidthLabels }
        val fullWidth = fields.filter { it.label in fullWidthLabels }
        val useColumns = maxWidth >= 700.dp
        Column(Modifier.fillMaxWidth()) {
            if (useColumns) {
                compact.chunked(2).forEach { rowFields ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        rowFields.forEach { field ->
                            Box(Modifier.weight(1f)) { EditableField(field, onSave) }
                        }
                        if (rowFields.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            } else {
                compact.forEach { field -> EditableField(field, onSave) }
            }
            fullWidth.forEach { field -> EditableField(field, onSave) }
        }
    }
}

private fun String.localizedConfigLabel(): String = when (this) {
    "Name" -> "名称"
    "Enabled" -> "启用"
    "Provider" -> "Provider"
    "Model" -> "模型标识"
    "Thinking" -> "推理强度"
    "Priority" -> "调度优先级"
    "Roles" -> "适用角色"
    "Max Concurrent Agents" -> "模型并发上限"
    else -> this
}

@Composable
private fun AgentToggle(name: String, enabled: Boolean, onToggle: () -> Unit) {
    Row(modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (enabled) Ac.withAlpha(0.12f) else Bg3)
        .border(1.dp, if (enabled) Ac else Line, RoundedCornerShape(6.dp))
        .clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(5.dp).clip(RoundedCornerShape(2.5.dp)).background(if (enabled) Ac else Tx3))
        Spacer(Modifier.width(4.dp))
        Text(name, color = if (enabled) Ac else Tx3, style = AppType.micro, fontWeight = FontWeight.Medium)
    }
}

// ==================== 代码智能 Tab ====================
@Composable
private fun CodeIntelligenceTab(
    state: KotlinLspRuntimeUiState,
    onRefresh: () -> Unit,
    onInstall: () -> Unit,
    onProbe: () -> Unit,
    onOpenDirectory: () -> Unit,
) {
    val busy = state.isRefreshing || state.isInstalling || state.isProbing
    val runtimeColor = when (state.health) {
        KotlinLspRuntimeHealth.READY -> OkLight
        KotlinLspRuntimeHealth.MISSING -> Warn
        KotlinLspRuntimeHealth.INVALID -> Err
        KotlinLspRuntimeHealth.UNSUPPORTED -> Tx3
    }
    val connectionColor = when (state.connectionPhase) {
        LspConnectionPhase.CONNECTED -> OkLight
        LspConnectionPhase.CONNECTING -> ControlBlue
        LspConnectionPhase.FAILED -> Err
        LspConnectionPhase.UNAVAILABLE -> Warn
        LspConnectionPhase.IDLE -> Tx3
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("代码智能", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
                Text("按需管理 JetBrains Kotlin LSP；连接成功后提供语义高亮、符号与诊断", color = Tx3, style = AppType.micro)
                Spacer(Modifier.height(7.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MicroPill(lspRuntimeBadge(state), runtimeColor)
                    MicroPill(lspConnectionBadge(state.connectionPhase), connectionColor)
                }
            }
            GhostButton("刷新", onClick = onRefresh)
            Spacer(Modifier.width(8.dp))
            GhostButton("打开目录", onClick = onOpenDirectory)
            Spacer(Modifier.width(8.dp))
            GlowButton(
                text = if (state.health == KotlinLspRuntimeHealth.INVALID) "修复运行时" else "安装运行时",
                active = state.installSupported && !busy,
                onClick = onInstall,
            )
        }
        Spacer(Modifier.height(16.dp))

        Section("JetBrains Kotlin Language Server") {
            InfoRow("固定版本", state.expectedVersion.ifBlank { "检查中" })
            InfoRow("平台", state.platform.ifBlank { "检查中" })
            InfoRow("来源", state.source.name.lowercase())
            InfoRow("命令", state.command.ifBlank { "尚未发现" }, Tx2, AppType.caption.copy(fontFamily = CodeFont))
            InfoRow("运行时目录", state.runtimeDirectory, Tx3, AppType.caption.copy(fontFamily = CodeFont))
            InfoRow("状态", state.runtimeMessage.ifBlank { "等待检查" }, runtimeColor)
            if (state.artifactSha256.isNotBlank()) {
                InfoRow("归档 SHA", state.artifactSha256, Tx3, AppType.micro.copy(fontFamily = CodeFont))
            }
            if (state.launcherSha256.isNotBlank()) {
                InfoRow("启动器 SHA", state.launcherSha256, Tx3, AppType.micro.copy(fontFamily = CodeFont))
            }
            Spacer(Modifier.height(4.dp))
            Text(
                "官方独立包约 390MB，仅在用户主动安装时下载；不会随桌面安装包捆绑。",
                color = Tx3,
                style = AppType.caption,
            )
        }
        Spacer(Modifier.height(18.dp))

        Section("真实连接") {
            InfoRow("阶段", lspConnectionBadge(state.connectionPhase), connectionColor)
            InfoRow("服务器", state.connectedServer.ifBlank { "尚未建立会话" })
            if (state.connectionCommand.isNotBlank()) {
                InfoRow("实际命令", state.connectionCommand, Tx2, AppType.caption.copy(fontFamily = CodeFont))
            }
            if (state.lastProbeFile.isNotBlank()) InfoRow("探测文件", state.lastProbeFile)
            if (state.connectionMessage.isNotBlank()) InfoRow("连接信息", state.connectionMessage, connectionColor)
            GlowButton(
                text = if (state.isProbing) "正在连接…" else "执行连接测试",
                active = state.health == KotlinLspRuntimeHealth.READY && !busy,
                onClick = onProbe,
            )
        }
        state.lastError?.takeIf(String::isNotBlank)?.let { error ->
            Spacer(Modifier.height(14.dp))
            Box(
                Modifier.fillMaxWidth().clip(AppShapes.sm).background(Err.withAlpha(0.08f))
                    .border(1.dp, Err.withAlpha(0.28f), AppShapes.sm).padding(10.dp),
            ) {
                Text(error, color = Err, style = AppType.caption)
            }
        }
    }
}

private fun lspRuntimeBadge(state: KotlinLspRuntimeUiState): String = when (state.health) {
    KotlinLspRuntimeHealth.READY -> "RUNTIME READY"
    KotlinLspRuntimeHealth.MISSING -> "NOT INSTALLED"
    KotlinLspRuntimeHealth.INVALID -> "REPAIR REQUIRED"
    KotlinLspRuntimeHealth.UNSUPPORTED -> "EXTERNAL ONLY"
}

private fun lspConnectionBadge(phase: LspConnectionPhase): String = when (phase) {
    LspConnectionPhase.IDLE -> "NOT CONNECTED"
    LspConnectionPhase.CONNECTING -> "CONNECTING"
    LspConnectionPhase.CONNECTED -> "CONNECTED"
    LspConnectionPhase.UNAVAILABLE -> "UNAVAILABLE"
    LspConnectionPhase.FAILED -> "FAILED"
}

// ==================== 通用 Tab ====================
@Composable
private fun GeneralTab(
    projectPath: String,
) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Section("当前项目目录") {
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text(projectPath, color = Tx, style = AppType.bodySm)
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("持久化策略") {
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line2, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text("会话与活动在每次变更后实时写入本地", color = Tx, style = AppType.bodySm)
            }
        }
    }
}

// ==================== 外观 Tab ====================
@Composable
private fun AppearanceTab(selectedTheme: AppThemeMode, onThemeChange: (AppThemeMode) -> Unit) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Section("统一设计语言") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brush.linearGradient(listOf(Bg2, Bg3, Ac2.withAlpha(0.42f))))
                    .border(1.dp, Ac.withAlpha(0.35f), RoundedCornerShape(14.dp))
                    .clickable { onThemeChange(AppThemeMode.FUSION) }
                    .padding(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(58.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Bg2.copy(alpha = 0.74f))
                        .border(1.dp, OnAccent.copy(alpha = 0.14f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("S", color = AcLight, style = AppType.display)
                }
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text("Swarm Fusion", color = OnAccent, style = AppType.title, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "玻璃层次承载浮层，黏土体积用于主控件，Hybrid 保持编辑器克制，动态磁贴负责状态与导航。",
                        color = OnAccent.copy(alpha = 0.8f),
                        style = AppType.caption,
                    )
                }
                Box(
                    Modifier.clip(RoundedCornerShape(20.dp)).background(Ac).padding(horizontal = 10.dp, vertical = 5.dp),
                ) {
                    Text(if (selectedTheme == AppThemeMode.FUSION) "已启用" else "启用", color = Bg0, style = AppType.micro)
                }
            }
        }
        Spacer(Modifier.height(20.dp))

        Section("字体大小") {
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("界面字体", color = Tx3, style = AppType.bodySm, modifier = Modifier.width(90.dp))
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                    Text("13sp", color = Tx, style = AppType.bodySm)
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("代码字体", color = Tx3, style = AppType.bodySm, modifier = Modifier.width(90.dp))
                Box(modifier = Modifier.weight(1f).clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                    Text("系统等宽字体 · 12sp", color = Tx, style = AppType.bodySm)
                }
            }
        }
    }
}

// ==================== 快捷键 Tab ====================
private data class ShortcutItem(val command: String, val keys: String, val description: String)

@Composable
private fun ShortcutsTab() {
    val shortcuts = listOf(
        ShortcutItem("新建会话", "⌘ N", "创建新的 Pi 会话"),
        ShortcutItem("打开设置", "⌘ ,", "打开设置面板"),
        ShortcutItem("命令面板", "⌘ K", "打开 Cmd+K 快速命令"),
        ShortcutItem("发送消息", "Enter", "在输入框中发送消息"),
        ShortcutItem("换行", "Shift+Enter", "在输入框中插入换行"),
        ShortcutItem("切换侧栏", "⌘ B", "显示/隐藏右侧面板"),
        ShortcutItem("切换视图", "⌘ 1-5", "切换到对应视图"),
        ShortcutItem("关闭弹窗", "Esc", "关闭当前弹窗或对话框"),
    )

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("键盘快捷键", color = Tx, style = AppType.body, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("只读", color = Tx3, style = AppType.micro,
                modifier = Modifier.clip(RoundedCornerShape(R8)).background(Bg3).padding(horizontal = 8.dp, vertical = 3.dp))
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            items(shortcuts, key = { it.command }) { item ->
                Row(modifier = Modifier.fillMaxWidth().animateItem().clip(RoundedCornerShape(4.dp)).background(Bg3).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.command, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.Medium)
                        Text(item.description, color = Tx3, style = AppType.micro)
                    }
                    Box(modifier = Modifier.clip(RoundedCornerShape(R8)).background(Bg3).border(1.dp, Line, RoundedCornerShape(R8)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                        Text(item.keys, color = Ac, style = AppType.caption.copy(fontFamily = CodeFont), fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

// ==================== 关于 Tab ====================
@Composable
private fun AboutTab() {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(20.dp))
        Box(modifier = Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).background(Ac.withAlpha(0.12f)).border(1.dp, Ac.withAlpha(0.3f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            Text("SE", color = Ac, style = AppType.headline)
        }
        Spacer(Modifier.height(12.dp))
        Text("Swarm Editor", color = Tx, style = AppType.title, fontWeight = FontWeight.Bold)
        Text("v0.1.0 MVP", color = Tx3, style = AppType.caption)
        Spacer(Modifier.height(16.dp))
        Text(
            "本地优先的 Pi 智能体桌面工作台\nKotlin/JVM · Compose Desktop · Pi 0.83.0",
            color = Tx3,
            style = AppType.caption,
        )
        Spacer(Modifier.height(24.dp))
        Column(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Bg3).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp)) {
            InfoRow("技术栈", "Kotlin 2.3.10 + JDK 21")
            InfoRow("前端", "Compose Desktop 1.8.1")
            InfoRow("后端", "进程内 Kotlin Services")
            InfoRow("运行时", "Pi 0.83.0 · JSONL stdio")
            InfoRow("构建", "Gradle 9.3.0 + npm")
        }
        Spacer(Modifier.height(16.dp))
        Text("github.com/swarm-editor", color = Ac, style = AppType.caption,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Line2, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}
