package com.swarmeditor.desktop.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

data class ToolCardData(
    val title: String,
    val icon: String = "⚙",
    val duration: String = "",
    val command: String = "",
    val output: String = "",
    val resultOk: Boolean = true,
    val resultDuration: String = ""
)

@Composable
fun ToolCard(
    card: ToolCardData,
    defaultExpanded: Boolean = false,
    modifier: Modifier = Modifier
) {
    val expanded = remember { mutableStateOf(defaultExpanded) }
    val shape = RoundedCornerShape(RR)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Glass)
            .border(1.dp, Bd, shape)
    ) {
        // Header — clickable to toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded.value = !expanded.value }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(card.icon, fontSize = 13.sp)
            Spacer(Modifier.width(8.dp))
            Text(card.title, color = Tx, fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium, fontFamily = MonoFont)
            if (card.duration.isNotEmpty()) {
                Spacer(Modifier.width(8.dp))
                Text(card.duration, color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
            }
            Spacer(Modifier.weight(1f))
            Text(
                if (expanded.value) "▼" else "▶",
                color = Tx3,
                fontSize = 10.sp,
                fontFamily = MonoFont
            )
        }

        // Expanded body — command output
        AnimatedVisibility(
            visible = expanded.value,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            if (card.output.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Surface2)
                        .padding(12.dp)
                ) {
                    Text(
                        card.output,
                        color = Tx2,
                        fontSize = 11.sp,
                        fontFamily = MonoFont,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        // Result line
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // OK pill
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (card.resultOk) GnD else RdD)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    if (card.resultOk) "✓ OK" else "✗ FAIL",
                    color = if (card.resultOk) Gn else Rd,
                    fontSize = 10.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    fontFamily = MonoFont
                )
            }
            if (card.resultDuration.isNotEmpty()) {
                Spacer(Modifier.width(8.dp))
                Text(card.resultDuration, color = Tx3, fontSize = 10.sp, fontFamily = MonoFont)
            }
        }
    }
}
