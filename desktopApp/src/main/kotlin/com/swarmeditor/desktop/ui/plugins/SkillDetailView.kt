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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

private val SkillTabs = listOf("Overview", "Structure", "Agents", "Usage")

@Composable
fun SkillDetailView(
    skill: SkillDto,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedTab = remember { mutableIntStateOf(0) }
    val accent = accentFor(skill.name)

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
                fontFamily = MonoFont,
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
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(accent.copy(alpha = 0.15f))
                    .border(1.dp, accent.copy(alpha = 0.3f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = skill.name.take(1).uppercase(),
                    color = accent,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = skill.name,
                        color = Tx,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusChip(text = skill.scope, color = Pr)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = skill.id,
                    color = Tx3,
                    fontSize = 11.sp,
                    fontFamily = MonoFont
                )
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

        Spacer(Modifier.height(16.dp))

        // Tab headers
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
        ) {
            SkillTabs.forEachIndexed { index, tab ->
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
                            .background(if (isActive) Ac else androidx.compose.ui.graphics.Color.Transparent)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // Tab content
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            when (selectedTab.intValue) {
                0 -> SkillOverviewTab(skill)
                1 -> SkillStructureTab(skill)
                2 -> SkillAgentsTab(skill)
                3 -> SkillUsageTab(skill)
            }
        }
    }
}

@Composable
private fun SkillOverviewTab(skill: SkillDto) {
    if (skill.description.isNotEmpty()) {
        SkillSectionTitle("Description")
        Text(
            text = skill.description,
            color = Tx2,
            fontSize = 13.sp,
            lineHeight = 19.sp
        )
        Spacer(Modifier.height(16.dp))
    }

    SkillSectionTitle("Source")
    Text(
        text = skill.source,
        color = Ac,
        fontSize = 12.sp,
        fontFamily = MonoFont
    )
    Spacer(Modifier.height(16.dp))

    SkillSectionTitle("Scope")
    Text(
        text = skill.scope,
        color = Tx2,
        fontSize = 12.sp,
        fontFamily = MonoFont
    )
    Spacer(Modifier.height(16.dp))

    if (skill.path.isNotEmpty()) {
        SkillSectionTitle("Path")
        Text(
            text = skill.path,
            color = Tx2,
            fontSize = 12.sp,
            fontFamily = MonoFont,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RR))
                .background(Surface2)
                .border(1.dp, Bd, RoundedCornerShape(RR))
                .padding(10.dp)
        )
        Spacer(Modifier.height(16.dp))
    }

    if (skill.tags.isNotEmpty()) {
        SkillSectionTitle("Tags")
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            skill.tags.forEach { tag ->
                StatusChip(text = tag, color = Pr)
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
            Text("No file structure available", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
        }
        return
    }

    SkillSectionTitle("File Location")
    Text(
        text = skill.path,
        color = Ac,
        fontSize = 12.sp,
        fontFamily = MonoFont,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR))
            .background(Surface2)
            .padding(10.dp)
    )
    Spacer(Modifier.height(16.dp))

    // Tree-like directory display (simulated from path)
    SkillSectionTitle("Directory Tree")
    Spacer(Modifier.height(6.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR))
            .background(Surface2)
            .border(1.dp, Bd, RoundedCornerShape(RR))
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
                    fontFamily = MonoFont
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
            Text("No agents linked to this skill", color = Tx3, fontSize = 12.sp, fontFamily = MonoFont)
        }
        return
    }

    SkillSectionTitle("Linked Agents (${skill.enabledAgents.size})")
    Spacer(Modifier.height(8.dp))

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        skill.enabledAgents.forEach { (agentId, enabled) ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(RR))
                    .background(Surface2)
                    .border(1.dp, Bd, RoundedCornerShape(RR))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Pr.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentId.take(1).uppercase(),
                        color = Pr,
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
                        fontFamily = MonoFont
                    )
                }
                StatusChip(
                    text = if (enabled) "enabled" else "disabled",
                    color = if (enabled) Gn else Tx3
                )
            }
        }
    }

    Spacer(Modifier.height(16.dp))

    // Call stats placeholder
    SkillSectionTitle("Call Statistics")
    Spacer(Modifier.height(6.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR))
            .background(Surface2)
            .border(1.dp, Bd, RoundedCornerShape(RR))
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatBlock(label = "Total Calls", value = "—")
        StatBlock(label = "Success Rate", value = "—")
        StatBlock(label = "Avg Latency", value = "—")
    }
}

@Composable
private fun SkillUsageTab(skill: SkillDto) {
    SkillSectionTitle("Usage Instructions")
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

    SkillSectionTitle("Quick Reference")
    Spacer(Modifier.height(6.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR))
            .background(Surface2)
            .border(1.dp, Bd, RoundedCornerShape(RR))
            .padding(12.dp)
    ) {
        InfoRow("Skill ID", skill.id)
        InfoRow("Source", skill.source)
        InfoRow("Scope", skill.scope)
        if (skill.path.isNotEmpty()) {
            InfoRow("Path", skill.path)
        }
    }
    Spacer(Modifier.height(16.dp))

    if (skill.enabledAgents.isNotEmpty()) {
        SkillSectionTitle("Compatible Agents")
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            skill.enabledAgents.filter { it.value }.keys.forEach { agent ->
                StatusChip(text = agent, color = Gn)
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
            fontFamily = MonoFont,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(100.dp)
        )
        Text(
            text = value,
            color = Tx2,
            fontSize = 11.sp,
            fontFamily = MonoFont,
            maxLines = 2,
            overflow = Ellipsis,
            modifier = Modifier.weight(1f)
        )
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
            fontFamily = MonoFont
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = MonoFont
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
        fontFamily = MonoFont,
        letterSpacing = 0.8.sp
    )
    Spacer(Modifier.height(6.dp))
}
