package com.swarmeditor.desktop.ui.plugins

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

/** Sub-tab options for the plugin center. */
enum class PluginSubTab(val label: String) {
    MCP("MCP Servers"),
    SKILLS("Skills")
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
    modifier: Modifier = Modifier,
    activeTab: String = "mcp",
    selectedItem: PluginItem? = null,
    onSelectedItemChange: (PluginItem?) -> Unit = {}
) {
    var activeSubTab by remember { mutableStateOf(PluginSubTab.MCP) }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }

    // 设计稿 setPluginSideTab：切换 tab 时强制退出详情页
    LaunchedEffect(activeTab) {
        onSelectedItemChange(null)
    }

    Box(modifier = modifier.fillMaxSize()) {
        if (selectedItem != null) {
            // Detail view
            when (selectedItem) {
                is PluginItem.Mcp -> McpDetailView(
                    server = selectedItem.server,
                    onBack = { onSelectedItemChange(null) },
                    modifier = Modifier.fillMaxSize()
                )
                is PluginItem.Skill -> SkillDetailView(
                    skill = selectedItem.skill,
                    onBack = { onSelectedItemChange(null) },
                    modifier = Modifier.fillMaxSize()
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
                        .padding(horizontal = 24.dp, vertical = 18.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text(
                                text = if (activeTab == "mcp") "MCP Servers" else "Skills",
                                color = Tx,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = if (activeTab == "mcp")
                                    "Model Context Protocol 服务，让 Agent 能够连接外部工具和数据源。"
                                else
                                    "可复用的 Agent 能力模块。基于 SKILL.md 规范，一次定义，多 Agent 共享使用。",
                                color = Tx2,
                                fontSize = 12.sp,
                                fontFamily = SansFont,
                                maxLines = 2
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        // Search field
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = {
                                Text(
                                    if (activeTab == "mcp") "搜索 MCP Server…" else "搜索 Skill…",
                                    color = Tx3, fontSize = 12.sp
                                )
                            },
                            singleLine = true,
                            textStyle = androidx.compose.ui.text.TextStyle(
                                color = Tx,
                                fontSize = 12.sp,
                                fontFamily = SansFont
                            ),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Ac,
                                unfocusedBorderColor = Line,
                                cursorColor = Ac
                            ),
                            modifier = Modifier.width(240.dp).clip(RoundedCornerShape(R8))
                        )
                    }

                    // hero 统计行（设计稿 .plugin-hero-stats）
                    val stats = if (activeTab == "mcp") listOf(
                        "${mcpServers.size}" to "已安装",
                        "${mcpServers.sumOf { it.tools.size }}" to "可用工具",
                        "${mcpServers.size}" to "运行中",
                        "347" to "今日调用"
                    ) else listOf(
                        "${skills.size}" to "已安装",
                        "${skills.count { it.source == "本地" }}" to "本地",
                        "${skills.count { it.source == "MCP" }}" to "MCP 发现",
                        "${skills.size}" to "已启用"
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        stats.forEach { (value, label) ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(value, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = CodeFont)
                                Text(label, color = Tx2, fontSize = 12.sp, fontFamily = SansFont)
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // 扫描 / 添加 按钮（对齐核心稿；MCP/Skills 切换在左侧栏）
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("扫描", color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(horizontal = 14.dp, vertical = 7.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("+ 添加", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Ac).padding(horizontal = 14.dp, vertical = 7.dp))
                    }
                }

                // 分类标签（按当前 tab 筛选）
                val categories = if (activeTab == "mcp") mcpServers.flatMap { it.categories }.distinct() else skills.flatMap { it.tags }.distinct()

                if (categories.isNotEmpty()) {
                    Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = if (activeTab == "mcp") "已安装的 MCP Servers" else "已安装的 Skills",
                                color = Tx2,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = SansFont,
                                letterSpacing = 0.8.sp
                            )
                            Text(
                                text = if (activeTab == "mcp") "${mcpServers.size}" else "${skills.size}",
                                color = AcLight,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = CodeFont,
                                modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(Ac.withAlpha(0.12f)).padding(horizontal = 7.dp, vertical = 2.dp)
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            categories.forEach { category ->
                                Text(
                                    text = category,
                                    color = Tx2,
                                    fontSize = 10.sp,
                                    fontFamily = SansFont,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(Bg3)
                                        .border(1.dp, Line, RoundedCornerShape(6.dp))
                                        .clickable { /* filter by category - placeholder */ }
                                        .padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }

                // 卡片网格：按当前 tab 筛选 MCP 或 Skills
                val q = searchQuery.text.lowercase()
                val items: List<PluginItem> = if (activeTab == "mcp") {
                    mcpServers.filter { q.isEmpty() || it.name.lowercase().contains(q) || it.description.lowercase().contains(q) }
                        .map { PluginItem.Mcp(it) }
                } else {
                    skills.filter { q.isEmpty() || it.name.lowercase().contains(q) || it.description.lowercase().contains(q) }
                        .map { PluginItem.Skill(it) }
                }

                if (items.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = if (searchQuery.text.isNotEmpty()) "未找到结果" else "暂无插件",
                                color = Tx3,
                                fontSize = 13.sp,
                                fontFamily = SansFont
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = if (searchQuery.text.isNotEmpty()) "换个关键词试试" else "添加插件以开始",
                                color = Tx3,
                                fontSize = 11.sp,
                                fontFamily = SansFont
                            )
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 360.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 24.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(items, key = { it.key() }) { item ->
                            PluginTile(
                                item = item,
                                onClick = { onSelectedItemChange(item) },
                                modifier = Modifier.animateItem()
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun PluginItem.key(): String = when (this) {
    is PluginItem.Mcp -> "mcp-${server.id}"
    is PluginItem.Skill -> "skill-${skill.id}"
}
