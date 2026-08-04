package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.*

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmText: String = "确认",
    cancelText: String = "取消",
    isDanger: Boolean = false,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    val backdropInteraction = remember { MutableInteractionSource() }
    val contentInteraction = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .overlayBackdrop(OverlayDepth.CRITICAL)
            .clickable(
                interactionSource = backdropInteraction,
                indication = null,
                onClick = onCancel,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(380.dp)
                .modalEnter(OverlayDepth.CRITICAL)
                .layeredSurface(
                    depth = OverlayDepth.CRITICAL,
                    bg = Bg2.copy(alpha = 0.99f),
                    border = Line2,
                    shape = AppShapes.lg,
                )
                .clickable(interactionSource = contentInteraction, indication = null) {}
                .padding(20.dp)
        ) {
            Text(title, color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text(message, color = Tx2, fontSize = 13.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(20.dp))
            Row(modifier = Modifier.align(Alignment.End)) {
                GhostButton(cancelText, onClick = onCancel)
                Spacer(Modifier.width(8.dp))
                GlowButton(
                    text = confirmText,
                    tone = if (isDanger) ActionTone.DESTRUCTIVE else ActionTone.PRIMARY,
                    onClick = onConfirm,
                )
            }
        }
    }
}
