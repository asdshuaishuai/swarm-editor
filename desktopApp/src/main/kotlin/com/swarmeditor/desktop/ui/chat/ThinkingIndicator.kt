package com.swarmeditor.desktop.ui.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.theme.InlineLoadingState

/**
 * 三个依次闪烁的点（对齐核心稿 .thinking <i>×3，blink 动画）。
 * 纯内联，无容器底色；可选 text 显示在点之后。
 */
@Composable
fun ThinkingIndicator(
    text: String = "",
    modifier: Modifier = Modifier
) {
    InlineLoadingState(text = text, modifier = modifier, minHeight = 0.dp)
}
