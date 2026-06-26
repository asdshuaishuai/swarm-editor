package com.swarmeditor.desktop.ui.plugins

import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

private val SkillTabs = listOf("概览", "结构", "Agent", "使用")

@Composable
fun SkillDetailView(
    skill: SkillDto,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedTab = remember { mutableIntStateOf(0) }
    val accent = accentFor(skill.name)

    Column(modifier = modifier.fillMaxSize()) {
        // pd-header
        Column(
            modifier = Modifier.fillMaxWidth()
                .background(Brush.radialGradient(listOf(accent.withAlpha(0.08f), androidx.compose.ui.graphics.Color.Transparent)))
                .border(1.dp, Line)
                .padding(horizontal = 32.dp, vertical = 24.dp)
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

            Spacer(Modifier.height(18.dp))

        // pd-top
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            // pd-icon 84px
            Box(
                modifier = Modifier.size(84.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Bg0.copy(alpha = 0.6f))
                    .border(1.dp, Line2, RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (skill.source == "MCP") "🔌" else "🧩",
                    color = accent,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = skill.name,
                        color = Tx,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusChip(text = skill.source, color = if (skill.source == "MCP") AgentQwen else AgentGemini)
                    Spacer(Modifier.width(4.dp))
                    StatusChip(text = "已启用", color = AgentGemini)
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(skill.source, color = AcLight, fontSize = 11.sp, fontFamily = CodeFont)
                    Text("·", color = Tx3, fontSize = 11.sp)
                    Text(skill.scope, color = Tx3, fontSize = 11.sp, fontFamily = SansFont)
                }
                Spacer(Modifier.height(6.dp))
                if (skill.description.isNotEmpty()) {
                    Text(
                        text = skill.description,
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

            // pd-actions（设计稿：测试运行 + 编辑SKILL.md + 禁用）
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("▶ 测试运行", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Brush.linearGradient(listOf(Ac, Ac2))).clickable { }.padding(horizontal = 14.dp, vertical = 6.dp))
                Text("✎ 编辑 SKILL.md", color = Tx2, fontSize = 11.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Line2, RoundedCornerShape(6.dp)).clickable { }.padding(horizontal = 14.dp, vertical = 6.dp))
                Spacer(Modifier.weight(1f))
                Text("禁用", color = Err, fontSize = 11.sp, fontWeight = FontWeight.Medium, fontFamily = SansFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Err.withAlpha(0.3f), RoundedCornerShape(6.dp)).background(Err.withAlpha(0.06f)).clickable { }.padding(horizontal = 14.dp, vertical = 6.dp))
            }
        }  // 关闭 pd-header

        Spacer(Modifier.height(16.dp))

        // pd-tabs
        Row(
            modifier = Modifier.fillMaxWidth()
                .background(Bg1.copy(alpha = 0.4f))
                .border(1.dp, Line)
                .padding(horizontal = 32.dp)
        ) {
            SkillTabs.forEachIndexed { index, tab ->
                val isActive = selectedTab.intValue == index
                Column(
                    modifier = Modifier
                        .clickable { selectedTab.intValue = index }
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    val tabTextColor by animateColorAsState(
                        if (isActive) Ac else Tx3, Motion.colorDefault, label = "skillTabText"
                    )
                    val underlineColor by animateColorAsState(
                        if (isActive) Ac else Color.Transparent, Motion.colorDefault, label = "skillTabUnderline"
                    )
                    Text(
                        text = if (index == 2) "$tab ${skill.enabledAgents.size}" else tab,
                        color = tabTextColor,
                        fontSize = 13.sp,
                        fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal
                    )
                    Spacer(Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .height(2.dp)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(1.dp))
                            .background(underlineColor)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // pd-body（设计稿 grid 1fr:280px, gap 28）
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // pd-main
            Column(
                modifier = Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState())
            ) {
                when (selectedTab.intValue) {
                    0 -> SkillOverviewTab(skill)
                    1 -> SkillStructureTab(skill)
                    2 -> SkillAgentsTab(skill)
                    3 -> SkillUsageTab(skill)
                }
            }
            // pd-side（设计稿三面板：技能信息 / 标签 / 关联 Agent）
            SkillSidePanel(skill)
        }
    }
}

@Composable
private fun SkillOverviewTab(skill: SkillDto) {
    if (skill.description.isNotEmpty()) {
        SkillSectionTitle("描述")
        com.mikepenz.markdown.m3.Markdown(
            content = skill.description,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))
    }

    SkillSectionTitle("来源")
    Text(
        text = skill.source,
        color = Ac,
        fontSize = 12.sp,
        fontFamily = SansFont
    )
    Spacer(Modifier.height(16.dp))

    SkillSectionTitle("作用域")
    Text(
        text = skill.scope,
        color = Tx2,
        fontSize = 12.sp,
        fontFamily = SansFont
    )
    Spacer(Modifier.height(16.dp))

    if (skill.path.isNotEmpty()) {
        SkillSectionTitle("路径")
        Text(
            text = skill.path,
            color = Tx2,
            fontSize = 12.sp,
            fontFamily = SansFont,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(R8))
                .background(Bg3)
                .border(1.dp, Line, RoundedCornerShape(R8))
                .padding(10.dp)
        )
        Spacer(Modifier.height(16.dp))
    }

    if (skill.tags.isNotEmpty()) {
        SkillSectionTitle("标签")
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            skill.tags.forEach { tag ->
                StatusChip(text = tag, color = AgentClaude)
            }
        }
    }
}

@Composable
private fun SkillStructureTab(skill: SkillDto) {
    if (skill.path.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("暂无文件结构", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
        }
        return
    }

    SkillSectionTitle("文件位置")
    Text(
        text = skill.path,
        color = Ac,
        fontSize = 12.sp,
        fontFamily = SansFont,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .padding(10.dp)
    )
    Spacer(Modifier.height(16.dp))

    // Tree-like directory display (simulated from path)
    SkillSectionTitle("目录树")
    Spacer(Modifier.height(6.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .padding(12.dp)
    ) {
        val segments = skill.path.split("/")
        segments.forEachIndexed { index, segment ->
            val indent = "  ".repeat(index)
            val prefix = if (index == segments.lastIndex - 1) "└── " else "├── "
            if (segment.isNotEmpty()) {
                Text(
                    text = "$indent$prefix$segment",
                    color = if (index == segments.lastIndex) Ac else Tx2,
                    fontSize = 12.sp,
                    fontFamily = SansFont
                )
            }
        }
    }
}

@Composable
private fun SkillAgentsTab(skill: SkillDto) {
    if (skill.enabledAgents.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("暂无关联 Agent", color = Tx3, fontSize = 12.sp, fontFamily = SansFont)
        }
        return
    }

    SkillSectionTitle("关联 Agent (${skill.enabledAgents.size})")
    Spacer(Modifier.height(8.dp))

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        skill.enabledAgents.forEach { (agentId, enabled) ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(R8))
                    .background(Bg3)
                    .border(1.dp, Line, RoundedCornerShape(R8))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(AgentClaude.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentId.take(1).uppercase(),
                        color = AgentClaude,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = agentId,
                        color = Tx,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = SansFont
                    )
                }
                StatusChip(
                    text = if (enabled) "enabled" else "disabled",
                    color = if (enabled) AgentGemini else Tx3
                )
            }
        }
    }

    Spacer(Modifier.height(16.dp))

    // Call stats placeholder
    SkillSectionTitle("调用统计")
    Spacer(Modifier.height(6.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatBlock(label = "总调用", value = "—")
        StatBlock(label = "成功率", value = "—")
        StatBlock(label = "平均延迟", value = "—")
    }
}

@Composable
private fun SkillUsageTab(skill: SkillDto) {
    SkillSectionTitle("使用说明")
    Spacer(Modifier.height(6.dp))
    if (skill.description.isNotEmpty()) {
        Text(
            text = skill.description,
            color = Tx2,
            fontSize = 13.sp,
            lineHeight = 19.sp
        )
    }
    Spacer(Modifier.height(16.dp))

    SkillSectionTitle("快速参考")
    Spacer(Modifier.height(6.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .padding(12.dp)
    ) {
        InfoRow("Skill ID", skill.id)
        InfoRow("来源", skill.source)
        InfoRow("作用域", skill.scope)
        if (skill.path.isNotEmpty()) {
            InfoRow("路径", skill.path)
        }
    }
    Spacer(Modifier.height(16.dp))

    if (skill.enabledAgents.isNotEmpty()) {
        SkillSectionTitle("兼容 Agent")
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            skill.enabledAgents.filter { it.value }.keys.forEach { agent ->
                StatusChip(text = agent, color = AgentGemini)
            }
            skill.enabledAgents.filter { !it.value }.keys.forEach { agent ->
                StatusChip(text = agent, color = Tx3)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
    ) {
        Text(
            text = label,
            color = Tx3,
            fontSize = 11.sp,
            fontFamily = SansFont,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(100.dp)
        )
        Text(
            text = value,
            color = Tx2,
            fontSize = 11.sp,
            fontFamily = SansFont,
            maxLines = 2,
            overflow = Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun SkillSidePanel(skill: SkillDto) {
    Column(
        modifier = Modifier
            .width(280.dp)
            .fillMaxHeight()
            .verticalScroll(rememberScrollState())
            .clip(RoundedCornerShape(R8))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(R8))
            .padding(14.dp)
    ) {
        InfoRow("名称", skill.name)
        InfoRow("来源", skill.source)
        InfoRow("作用域", skill.scope)
        if (skill.path.isNotEmpty()) InfoRow("路径", skill.path)
        if (skill.tags.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("标签", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                skill.tags.forEach { StatusChip(text = it, color = AgentClaude) }
            }
        }
        if (skill.enabledAgents.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("关联 Agent", color = Tx3, fontSize = 10.sp, fontFamily = SansFont, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            skill.enabledAgents.keys.forEach { agent ->
                Text("• $agent", color = Tx2, fontSize = 11.sp, fontFamily = SansFont, modifier = Modifier.padding(start = 4.dp, bottom = 2.dp))
            }
        }
    }
}

@Composable
private fun StatBlock(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            color = Tx,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = SansFont
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = SansFont
        )
    }
}

@Composable
private fun SkillSectionTitle(title: String) {
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
