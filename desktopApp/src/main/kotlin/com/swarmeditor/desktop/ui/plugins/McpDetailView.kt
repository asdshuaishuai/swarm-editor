package com.swarmeditor.desktop.ui.plugins

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.theme.*

private val DetailTabs = listOf("详情", "工具", "配置", "更新日志")

@Composable
fun McpDetailView(
    server: McpServerDto,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedTab = remember { mutableIntStateOf(0) }
    val accent = accentFor(server.name)

    Column(modifier = modifier.fillMaxSize()) {
        // Back button row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "← 返回",
                color = Ac,
                fontSize = 12.sp,
                fontFamily = SansFont,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(onClick = onBack)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        // Hero section
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
        ) {
            // 84px icon
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(accent.withAlpha(0.15f))
                    .border(1.dp, accent.withAlpha(0.3f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = server.icon.ifEmpty { server.name.take(1).uppercase() },
                    color = accent,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = server.name,
                        color = Tx,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusChip(text = "运行中", color = Gn)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = server.id,
                    color = Tx3,
                    fontSize = 11.sp,
                    fontFamily = SansFont
                )
                Spacer(Modifier.height(6.dp))
                if (server.rating > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("★ ${"%.1f".format(server.rating)}", color = Gd, fontSize = 12.sp, fontFamily = SansFont)
                        Spacer(Modifier.width(6.dp))
                        Text("(${server.ratingCount})", color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
                    }
                    Spacer(Modifier.height(4.dp))
                }
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
            }
        }

        Spacer(Modifier.height(14.dp))

        // Action buttons row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            ActionButton(text = "⟳ 重启", color = Ac)
            ActionButton(text = "⎘ 复制配置", color = Tx2)
            ActionButton(text = "删除", color = Rd)
        }

        Spacer(Modifier.height(16.dp))

        // Tab headers
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
        ) {
            DetailTabs.forEachIndexed { index, tab ->
                val isActive = selectedTab.intValue == index
                Column(
                    modifier = Modifier
                        .clickable { selectedTab.intValue = index }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = tab,
                        color = if (isActive) Ac else Tx3,
                        fontSize = 13.sp,
                        fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal
                    )
                    Spacer(Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .height(2.dp)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(1.dp))
                            .background(if (isActive) Ac else Color.Transparent)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // Tab content + side panel
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
        ) {
            // Main content area
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(end = 16.dp)
            ) {
                when (selectedTab.intValue) {
                    0 -> McpDetailsTab(server)
                    1 -> McpToolsTab(server)
                    2 -> McpConfigTab(server)
                    3 -> McpChangelogTab(server)
                }
            }

            // Side info panel (only for Details tab)
            if (selectedTab.intValue == 0) {
                McpSidePanel(server)
            }
        }
    }
}

@Composable
private fun ActionButton(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text = text,
        color = color,
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        fontFamily = SansFont,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, color.withAlpha(0.3f), RoundedCornerShape(6.dp))
            .background(color.withAlpha(0.06f))
            .clickable { /* placeholder */ }
            .padding(horizontal = 14.dp, vertical = 6.dp)
    )
}

@Composable
private fun McpDetailsTab(server: McpServerDto) {
    if (server.description.isNotEmpty()) {
        SectionTitle("描述")
        Text(
            text = server.description,
            color = Tx2,
            fontSize = 13.sp,
            lineHeight = 19.sp
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
            Text("暂无工具", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
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
                    if (tool.params.any { it.required }) {
                        StatusChip(text = "req", color = Or)
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
                                    color = Or,
                                    fontSize = 9.sp,
                                    fontFamily = SansFont,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(3.dp))
                                        .background(Or.withAlpha(0.12f))
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
private fun McpConfigTab(server: McpServerDto) {
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
                p, color = if (active) Color.White else Tx2,
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
    SectionTitle("授权 Agent")
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("claude-code" to "Claude Code", "qwen-code" to "QwenCode", "gemini-cli" to "Gemini",
            "kimi-code" to "Kimi", "opencode" to "OpenCode").forEach { (id, name) ->
            val allowed = server.agents.any { it.equals(id.substringBefore("-"), true) || it == id }
            Text(name, color = if (allowed) AcLight else Tx3, fontSize = 11.sp, fontWeight = FontWeight.Medium,
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

@Composable
private fun McpSidePanel(server: McpServerDto) {
    Column(
        modifier = Modifier
            .width(220.dp)
            .fillMaxHeight()
            .verticalScroll(rememberScrollState())
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
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                server.categories.forEach { cat ->
                    StatusChip(text = cat, color = AgentClaude)
                }
            }
        }
        if (server.agents.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("授权 Agent", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            server.agents.forEach { agent ->
                Text(
                    text = "• $agent",
                    color = Tx2,
                    fontSize = 11.sp,
                    fontFamily = SansFont,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                )
            }
        }
        if (server.enabledAgents.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("已启用 Agent", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            server.enabledAgents.filter { it.value }.keys.forEach { agent ->
                StatusChip(text = agent, color = Gn)
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
