package com.swarmeditor.desktop.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.OverlayDepth
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.layeredSurface
import com.swarmeditor.desktop.theme.modalInputBarrier
import com.swarmeditor.desktop.theme.overlayBackdrop
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.X

@Composable
fun IdeDialogShell(
    title: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    detail: String? = null,
    maxWidth: Dp = 760.dp,
    heightFraction: Float = 0.82f,
    footer: @Composable RowScope.() -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .modalInputBarrier()
            .overlayBackdrop(OverlayDepth.SECONDARY)
            .padding(horizontal = 28.dp, vertical = 22.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(heightFraction)
                .widthIn(max = maxWidth)
                .layeredSurface(
                    depth = OverlayDepth.SECONDARY,
                    bg = Bg1.copy(alpha = 0.99f),
                    border = Line2,
                    shape = AppShapes.sm,
                ),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().height(42.dp).background(Bg2).border(1.dp, Line)
                    .padding(start = 13.dp, end = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, color = Tx, style = AppType.bodySm, fontWeight = FontWeight.SemiBold)
                if (!detail.isNullOrBlank()) {
                    Spacer(Modifier.width(8.dp))
                    Text(detail, color = Tx3, style = AppType.caption, maxLines = 1)
                }
                Spacer(Modifier.weight(1f))
                IdeActionButton(Feather.X, "关闭$title", onClose)
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                content()
            }
            Row(
                modifier = Modifier.fillMaxWidth().height(44.dp).background(Bg2).border(1.dp, Line)
                    .padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = footer,
            )
        }
    }
}
