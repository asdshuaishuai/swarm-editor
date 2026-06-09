package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onCancel), contentAlignment = Alignment.Center) {
        Column(modifier = Modifier.width(380.dp).clip(RoundedCornerShape(12.dp)).background(Bg2).border(1.dp, Bd2, RoundedCornerShape(12.dp)).padding(20.dp)) {
            Text(title, color = Tx, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text(message, color = Tx2, fontSize = 13.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(20.dp))
            Row(modifier = Modifier.align(Alignment.End)) {
                Text(cancelText, color = Tx2, fontSize = 12.sp, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, Bd2, RoundedCornerShape(6.dp)).clickable(onClick = onCancel).padding(horizontal = 14.dp, vertical = 7.dp))
                Spacer(Modifier.width(8.dp))
                val confirmBg = if (isDanger) Rd else Ac
                val confirmColor = if (isDanger) Color.White else Bg
                Text(confirmText, color = confirmColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = MonoFont,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(confirmBg).clickable(onClick = onConfirm).padding(horizontal = 14.dp, vertical = 7.dp))
            }
        }
    }
}
