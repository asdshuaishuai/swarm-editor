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
 * @agent mention dropdown — aligned with mvp-design-mockup.html.
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

    LaunchedEffect(filtered.size) {
        if (selectedIndex >= filtered.size) selectedIndex = (filtered.size - 1).coerceAtLeast(0)
    }

    LaunchedEffect(selectedIndex) {
        if (selectedIndex in filtered.indices) {
            listState.animateScrollToItem(selectedIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Bg1.copy(alpha = 0.98f))
            .border(1.dp, Line2, RoundedCornerShape(10.dp))
            .padding(6.dp)
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
        Text(
            "AGENTS",
            color = Tx3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont, letterSpacing = 0.5.sp,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp)
        ) {
            itemsIndexed(filtered, key = { _, agent -> agent.id }) { index, agent ->
                val isSelected = index == selectedIndex
                Row(
                    modifier = Modifier
                        .fillMaxWidth().animateItem()
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) Ac.withAlpha(0.12f) else Color.Transparent)
                        .clickable { onSelect(agent.name) }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(22.dp).clip(RoundedCornerShape(6.dp))
                            .background(agent.color),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(agent.letter, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                    Spacer(Modifier.width(9.dp))
                    Text(
                        agent.name,
                        color = if (isSelected) Ac else Tx,
                        fontSize = 12.sp, fontWeight = FontWeight.Medium
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        if (agent.isConnected) "online" else "offline",
                        color = Tx3, fontSize = 11.sp, fontFamily = SansFont
                    )
                }
            }
        }
    }
}
