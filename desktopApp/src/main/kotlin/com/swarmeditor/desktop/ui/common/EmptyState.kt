package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.theme.SansFont
import com.swarmeditor.desktop.theme.Tx3

@Composable
fun EmptyState(
    icon: String,
    title: String,
    subtitle: String = "",
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(icon, fontSize = 32.sp)
            Spacer(Modifier.height(8.dp))
            Text(title, color = Tx3, fontSize = 13.sp, fontFamily = SansFont, textAlign = TextAlign.Center)
            if (subtitle.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(subtitle, color = Tx3.copy(alpha = 0.6f), fontSize = 11.sp, fontFamily = SansFont, textAlign = TextAlign.Center)
            }
        }
    }
}
