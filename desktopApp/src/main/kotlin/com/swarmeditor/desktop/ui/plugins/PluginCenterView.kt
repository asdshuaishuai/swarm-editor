package com.swarmeditor.desktop.ui.plugins

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpRuntimeStatus
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.api.WasmPluginDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeHealthDto
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.WasmPluginExecutionState

private enum class PluginCenterTab(val id: String) {
    MCP("mcp"),
    SKILLS("skills"),
    WASM("wasm");

    companion object {
        fun from(id: String): PluginCenterTab = entries.firstOrNull { it.id == id } ?: MCP
    }
}

/**
 * Two-state composable: list view ↔ detail view.
 * List state: hero section + search + category filters + card grid.
 * Detail state: delegates to McpDetailView or SkillDetailView.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PluginCenterView(
    mcpServers: List<McpServerDto>,
    skills: List<SkillDto>,
    wasmPlugins: List<WasmPluginDto>,
    wasmRuntime: WasmtimeRuntimeDto?,
    wasmValidationErrors: List<String>,
    wasmPluginDirectory: String,
    wasmExecution: WasmPluginExecutionState,
    wasmInstallingRuntime: Boolean,
    agents: List<AgentInfo>,
    modifier: Modifier = Modifier,
    activeTab: String = "mcp",
    selectedItem: PluginItem? = null,
    onSelectedItemChange: (PluginItem?) -> Unit = {},
    onRefresh: () -> Unit = {},
    onAddMcp: () -> Unit = {},
    onOpenWasmDirectory: () -> Unit = {},
    onInstallWasmRuntime: () -> Unit = {},
    onWasmInputChange: (String) -> Unit = {},
    onExecuteWasm: (String) -> Unit = {},
    onConfigureMcp: (String) -> Unit = {},
    onCopyMcp: (McpServerDto) -> Unit = {},
    onDeleteMcp: (String) -> Unit = {},
    onEditSkill: (SkillDto) -> Unit = {},
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    val tab = PluginCenterTab.from(activeTab)
    val categories = remember(tab, mcpServers, skills) {
        when (tab) {
            PluginCenterTab.MCP -> mcpServers.flatMap { it.tags }
            PluginCenterTab.SKILLS -> skills.flatMap { it.tags }
            PluginCenterTab.WASM -> emptyList()
        }
            .distinct()
            .sorted()
    }
    val stats = remember(tab, mcpServers, skills, wasmPlugins, wasmRuntime, wasmValidationErrors) {
        when (tab) {
            PluginCenterTab.MCP -> listOf(
                mcpServers.size.toString() to "已安装",
                mcpServers.sumOf { it.tools.size }.toString() to "可用工具",
                mcpServers.count { it.runtimeStatus == McpRuntimeStatus.BRIDGED }.toString() to "已桥接"
            )
            PluginCenterTab.SKILLS -> listOf(
                skills.size.toString() to "已安装",
                skills.count { it.source == "本地" }.toString() to "本地",
                skills.count { it.source == "MCP" }.toString() to "MCP 发现",
                skills.count { it.enabledAgents.values.any { enabled -> enabled } }.toString() to "已启用"
            )
            PluginCenterTab.WASM -> listOf(
                wasmPlugins.size.toString() to "哈希已验证",
                (wasmRuntime?.detectedVersion?.ifBlank { wasmRuntime.expectedVersion } ?: "—") to "Wasmtime",
                wasmValidationErrors.size.toString() to "配置错误",
            )
        }
    }
    val filteredItems = remember(tab, mcpServers, skills, wasmPlugins, searchQuery, selectedCategory) {
        val query = searchQuery.trim().lowercase()
        when (tab) {
            PluginCenterTab.MCP -> mcpServers.asSequence()
                .filter {
                    (query.isEmpty() || it.name.lowercase().contains(query) || it.description.lowercase().contains(query)) &&
                        (selectedCategory == null || selectedCategory in it.tags)
                }
                .map { PluginItem.Mcp(it) }
                .toList()
            PluginCenterTab.SKILLS -> skills.asSequence()
                .filter {
                    (query.isEmpty() || it.name.lowercase().contains(query) || it.description.lowercase().contains(query)) &&
                        (selectedCategory == null || selectedCategory in it.tags)
                }
                .map { PluginItem.Skill(it) }
                .toList()
            PluginCenterTab.WASM -> wasmPlugins.asSequence()
                .filter { plugin ->
                    query.isEmpty() ||
                        plugin.id.lowercase().contains(query) ||
                        plugin.name.lowercase().contains(query) ||
                        plugin.description.lowercase().contains(query) ||
                        plugin.sha256.contains(query)
                }
                .map(PluginItem::Wasm)
                .toList()
        }
    }

    // Tab 与详情选择由父层同步管理；这里只重置当前列表筛选。
    LaunchedEffect(activeTab) {
        selectedCategory = null
        searchQuery = ""
    }
    LaunchedEffect(categories) {
        if (selectedCategory != null && selectedCategory !in categories) {
            selectedCategory = null
        }
    }

    AnimatedContent(
        targetState = selectedItem,
        contentKey = { item -> item?.key() ?: "plugin-list" },
        modifier = modifier.fillMaxSize(),
        transitionSpec = {
            val direction = if (targetState != null) 1 else -1
            ((fadeIn(Motion.alphaEnter) + slideInHorizontally(Motion.intOffsetEnter) { direction * 18 }) togetherWith
                (fadeOut(Motion.alphaExit) + slideOutHorizontally(Motion.intOffsetExit) { -direction * 10 }))
        },
        label = "pluginListDetail",
    ) { item ->
        if (item != null) {
            when (item) {
                is PluginItem.Mcp -> McpDetailView(
                    server = mcpServers.find { it.id == item.server.id } ?: item.server,
                    agents = agents,
                    onBack = { onSelectedItemChange(null) },
                    onConfigure = onConfigureMcp,
                    onCopy = onCopyMcp,
                    onDelete = onDeleteMcp,
                    modifier = Modifier.fillMaxSize()
                )
                is PluginItem.Skill -> SkillDetailView(
                    skill = skills.find { it.id == item.skill.id } ?: item.skill,
                    onBack = { onSelectedItemChange(null) },
                    onEdit = onEditSkill,
                    modifier = Modifier.fillMaxSize()
                )
                is PluginItem.Wasm -> WasmDetailView(
                    plugin = wasmPlugins.find { it.id == item.plugin.id } ?: item.plugin,
                    runtime = wasmRuntime,
                    validationErrors = wasmValidationErrors,
                    pluginDirectory = wasmPluginDirectory,
                    execution = wasmExecution,
                    installingRuntime = wasmInstallingRuntime,
                    onBack = { onSelectedItemChange(null) },
                    onOpenDirectory = onOpenWasmDirectory,
                    onInstallRuntime = onInstallWasmRuntime,
                    onInputChange = onWasmInputChange,
                    onExecute = onExecuteWasm,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        } else {
            // List view
            Column(modifier = Modifier.fillMaxSize()) {
                // Hero section
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Bg2)
                        .padding(horizontal = 24.dp, vertical = 15.dp)
                ) {
                    BoxWithConstraints(Modifier.fillMaxWidth()) {
                        val compactHeader = maxWidth < 680.dp
                        if (compactHeader) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                PluginHeroCopy(tab)
                                PluginSearchField(
                                    value = searchQuery,
                                    tab = tab,
                                    onValueChange = { searchQuery = it },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                PluginHeroCopy(tab)
                                Spacer(Modifier.weight(1f))
                                PluginSearchField(
                                    value = searchQuery,
                                    tab = tab,
                                    onValueChange = { searchQuery = it },
                                    modifier = Modifier.width(240.dp),
                                )
                            }
                        }
                    }

                    // hero 统计行（设计稿 .plugin-hero-stats）
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                    ) {
                        stats.forEach { (value, label) ->
                            PluginStatChip(value = value, label = label)
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // 扫描 / 添加 按钮（对齐核心稿；MCP/Skills 切换在左侧栏）
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ActionButton(
                            text = "扫描",
                            tone = ActionTone.NEUTRAL,
                            compact = true,
                            onClick = onRefresh,
                        )
                        Spacer(Modifier.width(8.dp))
                        when (tab) {
                            PluginCenterTab.MCP -> ActionButton(
                                text = "+ 添加 MCP",
                                tone = ActionTone.PRIMARY,
                                compact = true,
                                onClick = onAddMcp,
                            )
                            PluginCenterTab.SKILLS -> Unit
                            PluginCenterTab.WASM -> {
                                ActionButton(
                                    text = "打开插件目录",
                                    tone = ActionTone.SECONDARY,
                                    prominent = false,
                                    compact = true,
                                    onClick = onOpenWasmDirectory,
                                )
                                if (wasmRuntime?.health != WasmtimeRuntimeHealthDto.READY &&
                                    wasmRuntime?.installSupported == true
                                ) {
                                    Spacer(Modifier.width(8.dp))
                                    ActionButton(
                                        text = if (wasmInstallingRuntime) {
                                            "安装中…"
                                        } else if (wasmRuntime.health == WasmtimeRuntimeHealthDto.MISSING) {
                                            "安装 Wasmtime"
                                        } else {
                                            "修复 Wasmtime"
                                        },
                                        tone = ActionTone.PRIMARY,
                                        compact = true,
                                        enabled = !wasmInstallingRuntime,
                                        onClick = onInstallWasmRuntime,
                                    )
                                }
                            }
                        }
                    }
                }

                if (categories.isNotEmpty()) {
                    Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = when (tab) {
                                    PluginCenterTab.MCP -> "已安装的 MCP Servers"
                                    PluginCenterTab.SKILLS -> "已安装的 Skills"
                                    PluginCenterTab.WASM -> "已验证的 WASM Plugins"
                                },
                                color = Tx2,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = SansFont,
                                letterSpacing = 0.8.sp
                            )
                            MicroPill(label = filteredItems.size.toString(), color = AcLight)
                        }
                        Spacer(Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            categories.forEach { category ->
                                val isSelected = category == selectedCategory
                                PluginFilterChip(
                                    label = category,
                                    isSelected = isSelected,
                                    onClick = { selectedCategory = category.takeUnless { isSelected } }
                                )
                            }
                        }
                    }
                }

                if (filteredItems.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = if (searchQuery.isNotEmpty()) "未找到结果" else when (tab) {
                                    PluginCenterTab.WASM -> "暂无有效 WASM 插件"
                                    else -> "暂无插件"
                                },
                                color = Tx3,
                                fontSize = 13.sp,
                                fontFamily = SansFont
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = if (searchQuery.isNotEmpty()) "换个关键词试试" else when (tab) {
                                    PluginCenterTab.WASM -> "将 plugin.json 与 module.wasm 放入插件目录"
                                    else -> "添加插件以开始"
                                },
                                color = Tx3,
                                fontSize = 11.sp,
                                fontFamily = SansFont
                            )
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 320.dp),
                        modifier = Modifier
                            .fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(filteredItems, key = { it.key() }) { item ->
                            PluginTile(
                                item = item,
                                onClick = { onSelectedItemChange(item) },
                                modifier = Modifier.animateItem(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PluginStatChip(value: String, label: String) {
    Row(
        modifier = Modifier
            .clip(AppShapes.pill)
            .background(Bg3.copy(alpha = 0.72f))
            .border(1.dp, Line, AppShapes.pill)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(value, color = Tx, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = CodeFont)
        Text(label, color = Tx2, fontSize = 10.sp, fontFamily = SansFont)
    }
}

@Composable
private fun PluginHeroCopy(tab: PluginCenterTab) {
    Column {
        Text(
            text = when (tab) {
                PluginCenterTab.MCP -> "MCP Servers"
                PluginCenterTab.SKILLS -> "Skills"
                PluginCenterTab.WASM -> "WASM Sandbox"
            },
            color = Tx,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = when (tab) {
                PluginCenterTab.MCP -> "Model Context Protocol 服务，为主智能体连接外部工具和数据源。"
                PluginCenterTab.SKILLS -> "可复用的能力模块。基于 SKILL.md 规范，由主智能体与蜂群任务统一调用。"
                PluginCenterTab.WASM -> "由 Pi 按清单 ID 调用的确定性能力；模块哈希、运行时版本和每次执行均受校验与审计。"
            },
            color = Tx2,
            fontSize = 12.sp,
            fontFamily = SansFont,
            maxLines = 2,
            overflow = Ellipsis,
        )
    }
}

@Composable
private fun PluginSearchField(
    value: String,
    tab: PluginCenterTab,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    CompactTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = when (tab) {
            PluginCenterTab.MCP -> "搜索 MCP Server…"
            PluginCenterTab.SKILLS -> "搜索 Skill…"
            PluginCenterTab.WASM -> "搜索插件、模块或 SHA-256…"
        },
        modifier = modifier,
    )
}

@Composable
private fun PluginFilterChip(label: String, isSelected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        color = if (isSelected) AcLight else Tx2,
        fontSize = 10.sp,
        fontFamily = SansFont,
        modifier = Modifier
            .fluidClickable(onClick = onClick)
            .clip(AppShapes.pill)
            .background(if (isSelected) Ac.withAlpha(0.12f) else Bg3)
            .border(1.dp, if (isSelected) Ac else Line, AppShapes.pill)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

private fun PluginItem.key(): String = when (this) {
    is PluginItem.Mcp -> "mcp-${server.id}"
    is PluginItem.Skill -> "skill-${skill.id}"
    is PluginItem.Wasm -> "wasm-${plugin.id}"
}
