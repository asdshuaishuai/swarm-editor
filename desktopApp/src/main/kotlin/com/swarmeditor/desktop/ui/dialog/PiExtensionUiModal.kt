package com.swarmeditor.desktop.ui.dialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.swarmeditor.backend.pi.PiExtensionUiMethod
import com.swarmeditor.backend.pi.PiExtensionUiRequest
import com.swarmeditor.backend.pi.PiExtensionUiResponse
import com.swarmeditor.desktop.theme.Ac
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.ActionTone
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.OverlayDepth
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.fluidClickable
import com.swarmeditor.desktop.theme.layeredSurface
import com.swarmeditor.desktop.theme.modalEnter
import com.swarmeditor.desktop.theme.overlayBackdrop

@Composable
internal fun PiExtensionUiModal(
    request: PiExtensionUiRequest,
    busy: Boolean,
    onRespond: (PiExtensionUiResponse) -> Unit,
    modifier: Modifier = Modifier,
) {
    val backdropInteraction = remember { MutableInteractionSource() }
    val contentInteraction = remember { MutableInteractionSource() }
    var value by remember(request.id) { mutableStateOf(request.prefill.orEmpty()) }
    val focusRequester = remember(request.id) { FocusRequester() }
    LaunchedEffect(request.id, request.method) {
        if (request.method == PiExtensionUiMethod.INPUT || request.method == PiExtensionUiMethod.EDITOR) {
            focusRequester.requestFocus()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .overlayBackdrop(OverlayDepth.CRITICAL)
            .clickable(
                interactionSource = backdropInteraction,
                indication = null,
                enabled = !busy,
                onClick = { onRespond(PiExtensionUiResponse.Cancelled) },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(if (request.method == PiExtensionUiMethod.EDITOR) 620.dp else 460.dp)
                .modalEnter(OverlayDepth.CRITICAL)
                .layeredSurface(
                    depth = OverlayDepth.CRITICAL,
                    bg = Bg2,
                    border = Line2,
                    shape = AppShapes.xl,
                )
                .clickable(interactionSource = contentInteraction, indication = null) {}
                .padding(22.dp),
        ) {
            Text("PI EXTENSION", color = Ac, style = AppType.caption, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(7.dp))
            Text(request.title.ifBlank { "扩展需要你的输入" }, color = Tx, style = AppType.title)
            request.message?.takeIf(String::isNotBlank)?.let { message ->
                Spacer(Modifier.height(8.dp))
                Text(message, color = Tx2, style = AppType.bodySm)
            }
            Spacer(Modifier.height(18.dp))

            when (request.method) {
                PiExtensionUiMethod.SELECT -> SelectOptions(
                    options = request.options,
                    enabled = !busy,
                    onSelect = { onRespond(PiExtensionUiResponse.Value(it)) },
                )
                PiExtensionUiMethod.CONFIRM -> Unit
                PiExtensionUiMethod.INPUT -> ExtensionTextField(
                    value = value,
                    onValueChange = { value = it },
                    placeholder = request.placeholder.orEmpty(),
                    singleLine = true,
                    enabled = !busy,
                    modifier = Modifier.focusRequester(focusRequester),
                )
                PiExtensionUiMethod.EDITOR -> ExtensionTextField(
                    value = value,
                    onValueChange = { value = it },
                    placeholder = request.placeholder.orEmpty(),
                    singleLine = false,
                    enabled = !busy,
                    modifier = Modifier.focusRequester(focusRequester),
                )
            }

            Spacer(Modifier.height(20.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ActionButton(
                    text = "取消",
                    tone = ActionTone.NEUTRAL,
                    prominent = false,
                    enabled = !busy,
                    onClick = { onRespond(PiExtensionUiResponse.Cancelled) },
                )
                Spacer(Modifier.width(8.dp))
                when (request.method) {
                    PiExtensionUiMethod.SELECT -> Unit
                    PiExtensionUiMethod.CONFIRM -> {
                        ActionButton(
                            text = "否",
                            tone = ActionTone.NEUTRAL,
                            prominent = false,
                            enabled = !busy,
                            onClick = { onRespond(PiExtensionUiResponse.Confirmation(false)) },
                        )
                        Spacer(Modifier.width(8.dp))
                        ActionButton(
                            text = if (busy) "提交中…" else "确认",
                            enabled = !busy,
                            onClick = { onRespond(PiExtensionUiResponse.Confirmation(true)) },
                        )
                    }
                    PiExtensionUiMethod.INPUT,
                    PiExtensionUiMethod.EDITOR -> ActionButton(
                        text = if (busy) "提交中…" else "提交",
                        enabled = !busy,
                        onClick = { onRespond(PiExtensionUiResponse.Value(value)) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectOptions(
    options: List<String>,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    if (options.isEmpty()) {
        Text("扩展没有提供可选项。", color = Tx3, style = AppType.bodySm)
        return
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 320.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val interaction = remember(option) { MutableInteractionSource() }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(AppShapes.md)
                    .background(Bg3)
                    .border(1.dp, Line, AppShapes.md)
                    .fluidClickable(
                        enabled = enabled,
                        interactionSource = interaction,
                        onClick = { onSelect(option) },
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(option, color = if (enabled) Tx else Tx3, style = AppType.bodySm)
            }
        }
    }
}

@Composable
private fun ExtensionTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    singleLine: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = singleLine,
        cursorBrush = SolidColor(Ac),
        textStyle = AppType.bodySm.copy(color = if (enabled) Tx else Tx3),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = if (singleLine) 44.dp else 180.dp, max = 360.dp)
            .clip(AppShapes.md)
            .background(Bg3)
            .border(1.dp, Line2, AppShapes.md)
            .padding(horizontal = 12.dp, vertical = 11.dp),
        decorationBox = { innerField ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
                if (value.isEmpty() && placeholder.isNotBlank()) {
                    Text(placeholder, color = Tx3, style = AppType.bodySm)
                }
                innerField()
            }
        },
    )
}
