package com.swarmeditor.desktop.ui.plugins
import com.swarmeditor.desktop.AgentInfo

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.agentDisplayName
import com.swarmeditor.desktop.theme.*
import com.mikepenz.markdown.m3.Markdown

private val DetailTabs = listOf("详情", "工具", "配置", "更新日志")

@Composable
fun McpDetailView(
    server: McpServerDto,
    agents: List<AgentInfo>,
    onBack: () -> Unit,
    onConfigure: (String) -> Unit = {},
    onCopy: (McpServerDto) -> Unit = {},
    onDelete: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val selectedTab = remember { mutableIntStateOf(0) }
    val accent = accentFor(server.name)
    var confirmDelete by remember(server.id) { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize()) {
        // pd-header（对齐设计稿 .pd-header: padding 24px 32px, radial gradient bg）
        Column(
            modifier = Modifier.fillMaxWidth()
                .background(Brush.radialGradient(listOf(accent.withAlpha(0.08f), Color.Transparent)))
                .border(1.dp, Line)
                .padding(horizontal = 24.dp, vertical = 18.dp)
        ) {
            PluginDetailBackButton(accent = accent, onClick = onBack)

            Spacer(Modifier.height(12.dp))

        // Hero section（pd-top: icon 84px + meta, gap 18px）— 并入 pd-header 渐变容器
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // pd-icon: 84px, radius 18dp, bg Bg0 0.6 + Line2 border（设计稿 .pd-icon）
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Bg0.copy(alpha = 0.6f))
                    .border(1.dp, Line2, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "MCP",
                    color = accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                // pd-name: 22sp（设计稿 .pd-name）
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = server.name,
                        color = Tx,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusChip(
                        text = mcpRuntimeLabel(server.runtimeStatus),
                        color = mcpRuntimeColor(server.runtimeStatus)
                    )
                }
                Spacer(Modifier.height(4.dp))
                // pd-pub（设计稿单行：v · ★rating(count) · downloads）
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (server.version.isNotEmpty()) Text("v${server.version}", color = AcLight, fontSize = 11.sp, fontFamily = CodeFont)
                    if (server.rating > 0) {
                        Text("★ ${"%.1f".format(server.rating)}", color = Warn, fontSize = 11.sp, fontFamily = SansFont)
                        Text("(${server.ratingCount})", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                    }
                    if (server.downloads.isNotEmpty()) Text("${server.downloads} 下载", color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
                }
                Spacer(Modifier.height(6.dp))
                if (server.description.isNotEmpty()) {
                    Text(
                        text = server.description,
                        color = Tx2,
                        fontSize = 13.sp,
                        maxLines = 3,
                        overflow = Ellipsis,
                        lineHeight = 18.sp
                    )
                }
                if (server.runtimeMessage.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = server.runtimeMessage,
                        color = mcpRuntimeColor(server.runtimeStatus),
                        fontSize = 11.sp,
                        fontFamily = SansFont
                    )
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        // pd-actions（设计稿 .pd-actions: gap 8dp; 卸载 margin-left:auto 推到最右）
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (confirmDelete) {
                Text("确认删除 ${server.name}？", color = ErrLight, fontSize = 11.sp, fontFamily = SansFont)
                ActionButton(
                    text = "取消",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    compact = true,
                    onClick = { confirmDelete = false },
                )
                ActionButton(
                    text = "确认卸载",
                    tone = ActionTone.DESTRUCTIVE,
                    compact = true,
                    onClick = {
                        onDelete(server.id)
                        onBack()
                    }
                )
            } else {
                ActionButton(
                    text = "复制配置",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    compact = true,
                    onClick = { onCopy(server) },
                )
                ActionButton(
                    text = "配置",
                    tone = ActionTone.SECONDARY,
                    prominent = false,
                    compact = true,
                    onClick = { onConfigure(server.id) },
                )
                Spacer(Modifier.weight(1f))
                ActionButton(
                    text = "卸载",
                    tone = ActionTone.DESTRUCTIVE,
                    prominent = false,
                    compact = true,
                    onClick = { confirmDelete = true },
                )
            }
        }
        }  // 关闭 pd-header（渐变容器包住 返回 + hero + actions）

        Spacer(Modifier.height(10.dp))

        // pd-tabs（设计稿 .pd-tabs: padding 0 32px, sticky, backdrop blur）
        PluginDetailTabBar(
            tabs = DetailTabs.mapIndexed { index, tab -> if (index == 1) "$tab ${server.tools.size}" else tab },
            selectedIndex = selectedTab.intValue,
            accent = accent,
            onSelect = { selectedTab.intValue = it },
        )

        Spacer(Modifier.height(6.dp))

        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            val layout = pluginDetailLayout(maxWidth.value.toInt())
            key(selectedTab.intValue, layout.stacked) {
                if (layout.stacked) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(
                                horizontal = layout.horizontalPadding.dp,
                                vertical = layout.verticalPadding.dp,
                            ),
                    ) {
                        McpTabContent(selectedTab.intValue, server, agents)
                        Spacer(Modifier.height(layout.gap.dp))
                        McpSidePanel(server, Modifier.fillMaxWidth())
                    }
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(
                                horizontal = layout.horizontalPadding.dp,
                                vertical = layout.verticalPadding.dp,
                            ),
                        horizontalArrangement = Arrangement.spacedBy(layout.gap.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                        ) {
                            McpTabContent(selectedTab.intValue, server, agents)
                        }
                        McpSidePanel(
                            server = server,
                            modifier = Modifier
                                .width(layout.sidePanelWidth.dp)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                        )
                    }
                }
            }
        }
    }

}

@Composable
private fun McpTabContent(tabIndex: Int, server: McpServerDto, agents: List<AgentInfo>) {
    when (tabIndex) {
        0 -> McpDetailsTab(server)
        1 -> McpToolsTab(server)
        2 -> McpConfigTab(server, agents)
        3 -> McpChangelogTab(server)
    }
}

@Composable
private fun McpDetailsTab(server: McpServerDto) {
    if (server.description.isNotEmpty()) {
        SectionTitle("描述")
        Markdown(
            content = server.description,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))
    }
    if (server.command.isNotEmpty()) {
        SectionTitle("命令")
        Text(
            text = server.command,
            color = Ac,
            fontSize = 12.sp,
            fontFamily = SansFont,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .background(Bg2)
                .padding(10.dp)
        )
        Spacer(Modifier.height(16.dp))
    }
    if (server.args.isNotEmpty()) {
        SectionTitle("参数")
        server.args.forEach { arg ->
            Text(
                text = arg,
                color = Tx2,
                fontSize = 12.sp,
                fontFamily = SansFont,
                modifier = Modifier.padding(start = 8.dp, bottom = 2.dp)
            )
        }
        Spacer(Modifier.height(16.dp))
    }
    if (server.url.isNotEmpty()) {
        SectionTitle("URL")
        Text(
            text = server.url,
            color = Ac,
            fontSize = 12.sp,
            fontFamily = SansFont
        )
        Spacer(Modifier.height(16.dp))
    }
    if (server.tags.isNotEmpty()) {
        SectionTitle("标签")
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            server.tags.forEach { tag ->
                StatusChip(text = tag, color = AgentClaude)
            }
        }
    }
}

@Composable
private fun McpToolsTab(server: McpServerDto) {
    if (server.tools.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = server.runtimeMessage.ifEmpty { "当前会话未发现工具" },
                color = mcpRuntimeColor(server.runtimeStatus),
                fontSize = 12.sp,
                fontFamily = SansFont
            )
        }
        return
    }

    SectionTitle("工具 (${server.tools.size})")
    Spacer(Modifier.height(8.dp))

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        server.tools.forEach { tool ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(R8))
                    .background(Bg3)
                    .border(1.dp, Line, RoundedCornerShape(R8))
                    .padding(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = tool.name,
                        color = Tx,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = SansFont
                    )
                    Spacer(Modifier.weight(1f))
                    StatusChip(
                        text = if (tool.active) "active" else "inactive",
                        color = if (tool.active) AgentGemini else Tx3
                    )
                    Spacer(Modifier.width(6.dp))
                    if (tool.params.any { it.required }) {
                        StatusChip(text = "req", color = AgentOpenCode)
                    }
                }
                if (tool.description.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = tool.description,
                        color = Tx2,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                }
                if (tool.params.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("参数：", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                    Spacer(Modifier.height(4.dp))
                    tool.params.forEach { param ->
                        Row(
                            modifier = Modifier.padding(start = 8.dp, bottom = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = param.name,
                                color = Ac,
                                fontSize = 11.sp,
                                fontFamily = SansFont
                            )
                            if (param.required) {
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "required",
                                    color = AgentOpenCode,
                                    fontSize = 9.sp,
                                    fontFamily = SansFont,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(3.dp))
                                        .background(AgentOpenCode.withAlpha(0.12f))
                                        .padding(horizontal = 4.dp, vertical = 1.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun McpConfigTab(server: McpServerDto, agents: List<AgentInfo>) {
    // 启动配置（对齐核心稿 openMcpConfig）
    SectionTitle("启动配置")
    Spacer(Modifier.height(8.dp))
    if (server.command.isNotEmpty()) {
        Text("启动命令", color = Tx3, fontSize = 11.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont)
        Spacer(Modifier.height(6.dp))
        Box(
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Bg3.copy(alpha = 0.6f))
                .border(1.dp, Line, RoundedCornerShape(8.dp))
                .padding(horizontal = 11.dp, vertical = 8.dp)
        ) {
            Text(server.command, color = Tx, fontSize = 12.sp, fontFamily = SansFont)
        }
        Spacer(Modifier.height(12.dp))
    }
    // 传输协议
    Text("传输协议", color = Tx3, fontSize = 11.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont)
    Spacer(Modifier.height(6.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("stdio", "sse", "http").forEach { p ->
            val active = server.type == p
            Text(
                p, color = if (active) OnAccent else Tx2,
                fontSize = 12.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (active) Ac else Bg2)
                    .border(1.dp, if (active) Ac else Line, RoundedCornerShape(8.dp))
                    .padding(vertical = 8.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    }
    Spacer(Modifier.height(16.dp))
    // 环境变量
    SectionTitle("环境变量")
    Spacer(Modifier.height(8.dp))
    if (server.env.isNotEmpty()) {
        Column(
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Bg3.copy(alpha = 0.3f))
                .border(1.dp, Line, RoundedCornerShape(8.dp))
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            server.env.forEach { (key, value) ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(key, color = Tx, fontSize = 12.sp, fontFamily = SansFont,
                        modifier = Modifier.weight(1f)
                            .clip(RoundedCornerShape(8.dp)).background(Bg3.copy(alpha = 0.6f))
                            .border(1.dp, Line, RoundedCornerShape(8.dp))
                            .padding(horizontal = 11.dp, vertical = 8.dp))
                    Text("*".repeat(value.length.coerceIn(6, 16)), color = Tx2, fontSize = 12.sp, fontFamily = SansFont,
                        modifier = Modifier.weight(1.5f)
                            .clip(RoundedCornerShape(8.dp)).background(Bg3.copy(alpha = 0.6f))
                            .border(1.dp, Line, RoundedCornerShape(8.dp))
                            .padding(horizontal = 11.dp, vertical = 8.dp))
                }
            }
        }
    } else {
        Text("暂无环境变量", color = Tx3, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                .background(Bg2.copy(alpha = 0.3f)).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
    Spacer(Modifier.height(16.dp))
    // 可用工具
    SectionTitle("可用工具 (${server.tools.size})")
    Spacer(Modifier.height(8.dp))
    if (server.tools.isNotEmpty()) {
        Column(
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Bg2.copy(alpha = 0.3f))
                .border(1.dp, Line, RoundedCornerShape(8.dp))
                .padding(10.dp)
        ) {
            server.tools.forEach { tool ->
                Row(modifier = Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(OkLight))
                    Spacer(Modifier.width(6.dp))
                    Text(tool.name, color = Tx2, fontSize = 11.sp, fontFamily = SansFont)
                    if (tool.description.isNotEmpty()) {
                        Spacer(Modifier.width(6.dp))
                        Text("- ${tool.description}", color = Tx3, fontSize = 10.sp, fontFamily = SansFont)
                    }
                }
            }
        }
    } else {
        Text("暂无工具", color = Tx3, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                .background(Bg2.copy(alpha = 0.3f)).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(12.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
    Spacer(Modifier.height(16.dp))
    // 授权 Agent
    SectionTitle("授权主智能体")
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        agents.forEach { agent ->
            val allowed = server.enabledAgents.isEmpty() || server.enabledAgents[agent.id] == true
            Text(agent.name, color = if (allowed) AcLight else Tx3, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.clip(RoundedCornerShape(8.dp))
                    .background(if (allowed) Ac.withAlpha(0.12f) else Color.Transparent)
                    .border(1.dp, if (allowed) Ac else Line, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp))
        }
    }
}


@Composable
private fun McpChangelogTab(server: McpServerDto) {
    if (server.updated.isNotEmpty()) {
        SectionTitle("最后更新")
        Text(
            text = server.updated,
            color = Tx2,
            fontSize = 12.sp,
            fontFamily = SansFont
        )
        Spacer(Modifier.height(12.dp))
    }
    if (server.published.isNotEmpty()) {
        SectionTitle("发布日期")
        Text(
            text = server.published,
            color = Tx2,
            fontSize = 12.sp,
            fontFamily = SansFont
        )
        Spacer(Modifier.height(12.dp))
    }
    Box(
        modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
        contentAlignment = Alignment.Center
    ) {
        Text("暂无更新日志", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun McpSidePanel(server: McpServerDto, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .padding(14.dp)
    ) {
        SidePanelRow("标识符", server.id)
        SidePanelRow("类型", server.type)
        if (server.repository.isNotEmpty()) {
            SidePanelRow("仓库", server.repository)
        }
        if (server.categories.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Text("分类", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                server.categories.forEach { cat ->
                    StatusChip(text = cat, color = AgentClaude)
                }
            }
        }
        if (server.agents.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("授权主智能体", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            server.agents.forEach { agent ->
                Text(
                    text = "• ${agentDisplayName(agent)}",
                    color = Tx2,
                    fontSize = 11.sp,
                    fontFamily = SansFont,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                )
            }
        }
        if (server.enabledAgents.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("已启用主智能体", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            server.enabledAgents.filter { it.value }.keys.forEach { agent ->
                StatusChip(text = agentDisplayName(agent), color = AgentGemini)
                Spacer(Modifier.height(2.dp))
            }
        }
    }
}

@Composable
private fun SidePanelRow(label: String, value: String) {
    Text(label, color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(2.dp))
    Text(
        text = value,
        color = Tx2,
        fontSize = 11.sp,
        fontFamily = SansFont,
        maxLines = 3,
        overflow = Ellipsis
    )
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        color = Tx3,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        fontFamily = SansFont,
        letterSpacing = 0.8.sp
    )
    Spacer(Modifier.height(6.dp))
}
