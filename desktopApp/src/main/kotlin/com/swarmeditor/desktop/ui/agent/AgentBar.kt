package com.swarmeditor.desktop.ui.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*

@Composable
fun AgentBar(
    agents: List<AgentInfo>,
    selectedAgent: AgentInfo,
    onSelectAgent: (AgentInfo) -> Unit,
    onScan: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.width(58.dp).background(Color.Black.copy(alpha = 0.3f)).border(1.dp, Bd).padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Logo
        Box(
            modifier = Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)).background(Brush.linearGradient(listOf(Ac, Pr))),
            contentAlignment = Alignment.Center
        ) {
            Text("S", color = Bg, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace)
        }
        Spacer(Modifier.height(14.dp))

        // Agent 图标
        agents.forEach { agent ->
            Box(
                modifier = Modifier.size(42.dp).clip(RoundedCornerShape(12.dp))
                    .background(if (agent.id == selectedAgent.id) Surface else Color.Transparent)
                    .clickable { onSelectAgent(agent) },
                contentAlignment = Alignment.Center
            ) {
                Text(agent.emoji, fontSize = 20.sp)
                val dotColor = when { agent.isConnected -> Gn; else -> Tx3 }
                Box(modifier = Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(dotColor).align(Alignment.BottomEnd))
            }
            Spacer(Modifier.height(6.dp))
        }

        Spacer(Modifier.weight(1f))

        // 扫描按钮
        Box(
            modifier = Modifier.size(36.dp).clip(RoundedCornerShape(8.dp))
                .border(1.dp, Bd, RoundedCornerShape(8.dp))
                .clickable(onClick = onScan),
            contentAlignment = Alignment.Center
        ) {
            Text("🔍", fontSize = 16.sp)
        }
    }
}
