package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.GitBranch
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

/**
 * 底部状态栏 — 对齐核心稿 mvp-design-mockup.html 的 .statusbar：
 * 左：就绪 · main · 暂存/改动统计；右：当前 Agent · 插件数 · Kotlin · 版本。
 */
@Composable
fun StatusBar(
    agentName: String,
    agentColor: Color = AgentClaude,
    isConnected: Boolean = true,
    mcpCount: Int = 0,
    skillCount: Int = 0,
    modifier: Modifier = Modifier,
    branch: String = "main",
    gitStagedAdd: Int = 0,
    gitStagedDel: Int = 0,
    gitModified: Int = 0,
    gitUntracked: Int = 0,
    kotlinVersion: String = "2.3.10",
    appVersion: String = "v0.1.0"
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(24.dp)
            .background(Bg1)
            .border(width = 1.dp, color = Line)
            .padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 就绪（在线时脉冲）
        if (isConnected) PulseDot(Ok, dotSize = 7.dp) else SbDot(Err)
        Spacer(Modifier.width(5.dp))
        SbText("就绪")

        Spacer(Modifier.width(14.dp))
        Icon(imageVector = Feather.GitBranch, contentDescription = "Branch", tint = Tx3, modifier = Modifier.size(11.dp))
        Spacer(Modifier.width(5.dp))
            SbText(branch, modifier = Modifier.weight(1f, fill = false))

        if (gitStagedAdd > 0 || gitStagedDel > 0) {
            Spacer(Modifier.width(14.dp))
            Text("+${gitStagedAdd}", color = OkLight, fontSize = 11.sp, fontFamily = CodeFont)
            Spacer(Modifier.width(3.dp))
            Text("-${gitStagedDel}", color = ErrLight, fontSize = 11.sp, fontFamily = CodeFont)
            Spacer(Modifier.width(3.dp))
            SbText("S")
        }
        if (gitModified > 0 || gitUntracked > 0) {
            Spacer(Modifier.width(14.dp))
            if (gitModified > 0) {
                Text("M ${gitModified.compactCount()}", color = WarnLight, fontSize = 11.sp, fontFamily = CodeFont)
            }
            if (gitModified > 0 && gitUntracked > 0) Spacer(Modifier.width(8.dp))
            if (gitUntracked > 0) {
                Text("U ${gitUntracked.compactCount()}", color = Tx2, fontSize = 11.sp, fontFamily = CodeFont)
            }
        }

        Spacer(Modifier.weight(1f))

        // 当前 Agent
        SbDot(agentColor)
        Spacer(Modifier.width(5.dp))
        SbText(agentName, modifier = Modifier.width(96.dp))
        Spacer(Modifier.width(14.dp))
        SbText("EXT ${mcpCount + skillCount}")
        Spacer(Modifier.width(14.dp))
        SbText("K $kotlinVersion")
        Spacer(Modifier.width(14.dp))
        SbText(appVersion)
    }
}

@Composable
private fun SbDot(color: Color) {
    Box(
        modifier = Modifier
            .size(7.dp)
            .clip(CircleShape)
            .background(color)
    )
}

@Composable
private fun SbText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = Tx3,
        fontSize = 11.sp,
        fontFamily = CodeFont,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
    )
}

private fun Int.compactCount(): String = when {
    this >= 1_000_000 -> "${trimCount(this / 1_000_000f)}M"
    this >= 1_000 -> "${trimCount(this / 1_000f)}K"
    else -> toString()
}

private fun trimCount(value: Float): String =
    if (value >= 10f || value % 1f == 0f) value.toInt().toString() else "%.1f".format(value)
