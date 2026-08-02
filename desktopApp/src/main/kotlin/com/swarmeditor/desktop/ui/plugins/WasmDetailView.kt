package com.swarmeditor.desktop.ui.plugins

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.WasmPluginDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeDto
import com.swarmeditor.desktop.api.WasmtimeRuntimeHealthDto
import com.swarmeditor.desktop.theme.AcLight
import com.swarmeditor.desktop.theme.ActionButton
import com.swarmeditor.desktop.theme.ActionTone
import com.swarmeditor.desktop.theme.AgentGemini
import com.swarmeditor.desktop.theme.AgentKimi
import com.swarmeditor.desktop.theme.AppShapes
import com.swarmeditor.desktop.theme.AppType
import com.swarmeditor.desktop.theme.Bg0
import com.swarmeditor.desktop.theme.Bg1
import com.swarmeditor.desktop.theme.Bg2
import com.swarmeditor.desktop.theme.Bg3
import com.swarmeditor.desktop.theme.CodeFont
import com.swarmeditor.desktop.theme.Err
import com.swarmeditor.desktop.theme.Line
import com.swarmeditor.desktop.theme.Line2
import com.swarmeditor.desktop.theme.Spacing
import com.swarmeditor.desktop.theme.Tx
import com.swarmeditor.desktop.theme.Tx2
import com.swarmeditor.desktop.theme.Tx3
import com.swarmeditor.desktop.theme.Warn
import com.swarmeditor.desktop.theme.withAlpha
import com.swarmeditor.desktop.viewmodel.WasmPluginExecutionState

@Composable
fun WasmDetailView(
    plugin: WasmPluginDto,
    runtime: WasmtimeRuntimeDto?,
    validationErrors: List<String>,
    pluginDirectory: String,
    execution: WasmPluginExecutionState,
    installingRuntime: Boolean,
    onBack: () -> Unit,
    onOpenDirectory: () -> Unit,
    onInstallRuntime: () -> Unit,
    onInputChange: (String) -> Unit,
    onExecute: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = accentFor("wasm-${plugin.name}")
    val runtimeReady = runtime?.health == WasmtimeRuntimeHealthDto.READY
    val pluginExecution = execution.takeIf { it.pluginId == plugin.id }

    Column(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.radialGradient(listOf(accent.withAlpha(0.09f), Color.Transparent)))
                .border(1.dp, Line)
                .padding(horizontal = 24.dp, vertical = 18.dp),
        ) {
            PluginDetailBackButton(accent = accent, onClick = onBack)
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Bg0.copy(alpha = 0.62f))
                        .border(1.dp, accent.withAlpha(0.32f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("WASM", color = accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            plugin.name,
                            color = Tx,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.width(8.dp))
                        StatusChip("SHA-256 已验证", AgentGemini)
                        Spacer(Modifier.width(4.dp))
                        StatusChip(
                            wasmRuntimeLabel(runtime?.health),
                            wasmRuntimeColor(runtime?.health),
                        )
                    }
                    Spacer(Modifier.height(5.dp))
                    Text(
                        "${plugin.id} · ${plugin.moduleFileName}",
                        color = AcLight,
                        fontSize = 11.sp,
                        fontFamily = CodeFont,
                    )
                    if (plugin.description.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(plugin.description, color = Tx2, style = AppType.bodySm, lineHeight = 18.sp)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(
                    text = "打开插件目录",
                    tone = ActionTone.SECONDARY,
                    prominent = false,
                    compact = true,
                    onClick = onOpenDirectory,
                )
                if (!runtimeReady && runtime?.installSupported == true) {
                    ActionButton(
                        text = if (installingRuntime) {
                            "安装中…"
                        } else if (runtime.health == WasmtimeRuntimeHealthDto.MISSING) {
                            "安装 Wasmtime"
                        } else {
                            "修复 Wasmtime"
                        },
                        tone = ActionTone.PRIMARY,
                        compact = true,
                        enabled = !installingRuntime,
                        onClick = onInstallRuntime,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            WasmPanel(title = "运行时") {
                InfoRow("状态", runtime?.message ?: "正在检测运行时")
                InfoRow("固定版本", runtime?.expectedVersion ?: "—")
                InfoRow("平台", runtime?.platform ?: "—")
                InfoRow("来源", runtimeSourceLabel(runtime?.source))
                runtime?.executablePath?.takeIf(String::isNotBlank)?.let { path ->
                    InfoRow("可执行文件", path, code = true)
                }
                runtime?.artifactSha256?.takeIf(String::isNotBlank)?.let { hash ->
                    InfoRow("发布包 SHA-256", hash, code = true)
                }
                runtime?.binarySha256?.takeIf(String::isNotBlank)?.let { hash ->
                    InfoRow("二进制 SHA-256", hash, code = true)
                }
            }

            WasmPanel(title = "模块完整性") {
                InfoRow("插件目录", pluginDirectory, code = true)
                InfoRow("模块", plugin.moduleFileName, code = true)
                InfoRow("模块 SHA-256", plugin.sha256, code = true)
                InfoRow("超时", "${plugin.timeoutMillis} ms")
                InfoRow("输入上限", formatWasmBytes(plugin.maxInputBytes))
                InfoRow("输出上限", "${plugin.maxOutputChars} chars")
            }

            if (validationErrors.isNotEmpty()) {
                WasmPanel(title = "清单错误", tone = Err) {
                    validationErrors.forEach { error ->
                        Text("• $error", color = Err, style = AppType.bodySm, lineHeight = 18.sp)
                    }
                }
            }

            WasmPanel(title = "JSON 试运行", tone = AgentKimi) {
                Text(
                    "输入会直接传入固定哈希模块。默认不继承环境变量，也不授予文件系统或网络能力。",
                    color = Tx2,
                    style = AppType.bodySm,
                    lineHeight = 18.sp,
                )
                Spacer(Modifier.height(10.dp))
                BasicTextField(
                    value = execution.input,
                    onValueChange = onInputChange,
                    enabled = !execution.isRunning,
                    textStyle = TextStyle(color = Tx, fontSize = 12.sp, fontFamily = CodeFont, lineHeight = 18.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 112.dp)
                        .clip(AppShapes.sm)
                        .background(Bg0.copy(alpha = 0.72f))
                        .border(1.dp, Line2, AppShapes.sm)
                        .padding(12.dp),
                )
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ActionButton(
                        text = if (execution.isRunning && execution.pluginId == plugin.id) "执行中…" else "执行插件",
                        tone = ActionTone.POSITIVE,
                        compact = true,
                        enabled = runtimeReady && !execution.isRunning,
                        onClick = { onExecute(plugin.id) },
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        if (runtimeReady) "通过 Pi 的 WASM 能力执行" else "先安装并校验 Wasmtime 运行时",
                        color = if (runtimeReady) AgentGemini else Warn,
                        fontSize = 11.sp,
                    )
                }
                pluginExecution?.let { result ->
                    Spacer(Modifier.height(12.dp))
                    val resultText = result.error ?: result.output
                    val resultColor = if (result.error == null) Tx2 else Err
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(AppShapes.sm)
                            .background(Bg0.copy(alpha = 0.78f))
                            .border(1.dp, if (result.error == null) Line else Err.withAlpha(0.42f), AppShapes.sm)
                            .padding(12.dp),
                    ) {
                        Column {
                            result.durationMillis?.let { duration ->
                                Text("${duration} ms", color = AgentGemini, fontSize = 10.sp, fontFamily = CodeFont)
                                Spacer(Modifier.height(6.dp))
                            }
                            Text(
                                resultText.ifBlank { "无输出" },
                                color = resultColor,
                                fontSize = 12.sp,
                                fontFamily = CodeFont,
                                lineHeight = 18.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WasmPanel(
    title: String,
    tone: Color = AcLight,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AppShapes.md)
            .background(Bg2.copy(alpha = 0.86f))
            .border(1.dp, Line, AppShapes.md)
            .padding(Spacing.md),
    ) {
        Text(title, color = tone, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Spacer(Modifier.height(10.dp))
        content()
    }
}

@Composable
private fun InfoRow(label: String, value: String, code: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, color = Tx3, fontSize = 11.sp, modifier = Modifier.width(116.dp))
        Text(
            value,
            color = Tx2,
            fontSize = 11.sp,
            fontFamily = if (code) CodeFont else null,
            lineHeight = 17.sp,
            modifier = Modifier.weight(1f),
        )
    }
}

internal fun wasmRuntimeLabel(health: WasmtimeRuntimeHealthDto?): String = when (health) {
    WasmtimeRuntimeHealthDto.READY -> "运行时就绪"
    WasmtimeRuntimeHealthDto.MISSING -> "未安装"
    WasmtimeRuntimeHealthDto.INVALID -> "校验失败"
    WasmtimeRuntimeHealthDto.UNSUPPORTED -> "平台不支持"
    null -> "检测中"
}

internal fun wasmRuntimeColor(health: WasmtimeRuntimeHealthDto?): Color = when (health) {
    WasmtimeRuntimeHealthDto.READY -> AgentGemini
    WasmtimeRuntimeHealthDto.MISSING -> Warn
    WasmtimeRuntimeHealthDto.INVALID -> Err
    WasmtimeRuntimeHealthDto.UNSUPPORTED -> Tx3
    null -> Tx3
}

internal fun runtimeSourceLabel(source: String?): String = when (source) {
    "managed" -> "Swarm Editor 管理"
    "packaged" -> "应用内置"
    "environment" -> "SWARM_WASMTIME"
    "path" -> "系统 PATH"
    else -> "未发现"
}

internal fun formatWasmBytes(bytes: Int): String = when {
    bytes >= 1024 * 1024 -> "${bytes / (1024 * 1024)} MiB"
    bytes >= 1024 -> "${bytes / 1024} KiB"
    else -> "$bytes B"
}
