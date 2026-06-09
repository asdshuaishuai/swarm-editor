package com.swarmeditor.desktop.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.theme.*
import androidx.compose.ui.graphics.Color

/**
 * @agent mention dropdown — pops up when user types "@" in composer.
 * Shows filtered agent list with keyboard navigation.
 *
 * @param agents       All available agents
 * @param filter       Text typed after "@" (e.g. "cl" for "@cl")
 * @param onSelect     Called with selected agent name → inserts "@AgentName "
 * @param onDismiss    Called when user presses Escape or clicks outside
 */
@Composable
fun MentionDropdown(
    agents: List<AgentInfo>,
    filter: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val filtered = agents.filter {
        it.name.lowercase().contains(filter.lowercase())
    }
    if (filtered.isEmpty()) return

    var selectedIndex by remember(filter) { mutableIntStateOf(0) }
    val listState = rememberLazyListState()

    // Clamp selectedIndex when filter changes
    LaunchedEffect(filtered.size) {
        if (selectedIndex >= filtered.size) selectedIndex = (filtered.size - 1).coerceAtLeast(0)
    }

    // Scroll to keep selection visible
    LaunchedEffect(selectedIndex) {
        if (selectedIndex in filtered.indices) {
            listState.animateScrollToItem(selectedIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RR2))
            .background(Glass)
            .border(1.dp, Bd, RoundedCornerShape(RR2))
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionUp -> {
                        if (selectedIndex > 0) selectedIndex--
                        true
                    }
                    Key.DirectionDown -> {
                        if (selectedIndex < filtered.size - 1) selectedIndex++
                        true
                    }
                    Key.Enter -> {
                        if (selectedIndex in filtered.indices) {
                            onSelect(filtered[selectedIndex].name)
                        }
                        true
                    }
                    Key.Escape -> {
                        onDismiss()
                        true
                    }
                    else -> false
                }
            }
    ) {
        // Header
        Text(
            "选择 Agent",
            color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
            fontFamily = MonoFont, letterSpacing = 0.5.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
        )

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp)
        ) {
            itemsIndexed(filtered) { index, agent ->
                val isSelected = index == selectedIndex
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(agent.name) }
                        .background(if (isSelected) Surface2 else Color.Transparent)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Agent avatar circle
                    Box(
                        modifier = Modifier.size(24.dp).clip(CircleShape)
                            .background(agent.color.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(agent.emoji, fontSize = 10.sp)
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        agent.name,
                        color = if (isSelected) Tx else Tx2,
                        fontSize = 12.sp, fontWeight = FontWeight.Medium
                    )
                    Spacer(Modifier.weight(1f))
                    // Status dot
                    Box(
                        modifier = Modifier.size(6.dp).clip(CircleShape)
                            .background(if (agent.isConnected) Gn else Tx3)
                    )
                }
            }
        }
    }
}
