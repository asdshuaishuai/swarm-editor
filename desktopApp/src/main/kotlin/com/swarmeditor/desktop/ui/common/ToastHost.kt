package com.swarmeditor.desktop.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*
import com.swarmeditor.desktop.viewmodel.ToastData
import com.swarmeditor.desktop.viewmodel.ToastType
import kotlinx.coroutines.delay

private val ToastShape = RoundedCornerShape(10.dp)
private const val DISMISS_AFTER_MS = 2600L

private val ToastIcon = mapOf(
    ToastType.SUCCESS to "✓",
    ToastType.INFO to "ⓘ",
    ToastType.ERROR to "✗"
)

private val ToastColor = mapOf(
    ToastType.SUCCESS to Gn,
    ToastType.INFO to Ac,
    ToastType.ERROR to Rd
)

@Composable
fun ToastHost(
    toasts: List<ToastData>,
    onDismiss: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomEnd
    ) {
        Column(
            modifier = Modifier.padding(end = 24.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.End
        ) {
            toasts.forEach { toast ->
                ToastItem(
                    toast = toast,
                    onDismiss = { onDismiss(toast.id) }
                )
            }
        }
    }
}

@Composable
private fun ToastItem(
    toast: ToastData,
    onDismiss: () -> Unit
) {
    val color = ToastColor[toast.type] ?: Ac
    val icon = ToastIcon[toast.type] ?: "ⓘ"

    // Auto-dismiss after 2.6s
    LaunchedEffect(toast.id) {
        delay(DISMISS_AFTER_MS)
        onDismiss()
    }

    AnimatedVisibility(
        visible = true,
        enter = slideInHorizontally(initialOffsetX = { it }),
        exit = slideOutHorizontally(targetOffsetX = { it })
    ) {
        Row(
            modifier = Modifier
                .width(260.dp)
                .clip(ToastShape)
                .background(Bg2)
                .border(1.dp, Bd, ToastShape)
                .clickable { onDismiss() }
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon circle
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = icon,
                    color = color,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(Modifier.size(10.dp))

            Text(
                text = toast.message,
                color = Tx,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 2
            )
        }
    }
}
