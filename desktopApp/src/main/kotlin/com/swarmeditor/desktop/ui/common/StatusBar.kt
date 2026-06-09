package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

@Composable
fun StatusBar(
    agentName: String,
    isConnected: Boolean,
    mcpCount: Int,
    skillCount: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth().height(26.dp)
            .background(Glass2).border(1.dp, Bd)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 连接状态
        val dotColor = if (isConnected) Gn else Rd
        val dotSize = 5.dp
        Row(verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.size(dotSize).clip(RoundedCornerShape(dotSize / 2)).background(dotColor))
            Text(agentName, color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
            if (isConnected) Text(" 已连接", color = Gn, fontSize = 11.sp, fontFamily = MonoFont)
            else Text(" 未连接", color = Rd, fontSize = 11.sp, fontFamily = MonoFont)
        }
        Spacer(Modifier.weight(1f))
        Text("MCP $mcpCount", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
        Spacer(Modifier.padding(horizontal = 6.dp))
        Text("Skills $skillCount", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
        Spacer(Modifier.padding(horizontal = 6.dp))
        Text("v0.1.0", color = Tx3, fontSize = 11.sp, fontFamily = MonoFont)
    }
}
