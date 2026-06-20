package com.swarmeditor.desktop.ui.session

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.AgentInfo
import com.swarmeditor.desktop.api.GitStatusDto
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

// ── Tab definitions ──────────────────────────────────────────────────────
private data class TabDef(val id: String, val label: String)
private val TABS = listOf(
    TabDef("changes", "变更"),
    TabDef("inspector", "检查"),
    TabDef("log", "日志"),
)

// ── Placeholder file-change data for the 变更 tab ───────────────────────
private data class FileChange(
    val path: String,
    val name: String,
    val extension: String,
    val added: Int,
    val removed: Int,
    val isNew: Boolean = false,
    val diffLines: List<String> = emptyList(),
)

private val PLACEHOLDER_CHANGES = listOf(
    FileChange(
        path = "src/backend/AcpConnectionManager.kt",
        name = "AcpConnectionManager.kt",
        extension = "kt",
        added = 45,
        removed = 12,
        diffLines = listOf(
            "+ class AcpConnectionManager {",
            "+     private val connections = mutableMapOf<String, AcpConnection>()",
            "+",
            "+     suspend fun connect(config: AgentConfig): AcpConnection {",
            "+         val adapter = AgentAdapterFactory.create(config.agentType)",
            "-     // TODO: implement",
            "+         return AcpConnection(config.id, process)",
            "+     }",
            "+     suspend fun disconnect(agentId: String) {",
            "+         connections.remove(agentId)?.close()",
            "+     }",
            "+ }",
        ),
    ),
    FileChange(
        path = "src/backend/AcpSession.kt",
        name = "AcpSession.kt",
        extension = "kt",
        added = 28,
        removed = 0,
        isNew = true,
        diffLines = listOf(
            "+ class AcpSession(val id: String) {",
            "+     val messages = mutableListOf<Message>()",
            "+     suspend fun send(content: String) { /* ... */ }",
            "+ }",
        ),
    ),
    FileChange(
        path = "config/agents.json",
        name = "agents.json",
        extension = "json",
        added = 5,
        removed = 2,
        diffLines = listOf(
            "+   \"claude\": {",
            "+     \"command\": \"claude acp\"",
            "-   \"legacy\": {",
        ),
    ),
)

// ── Placeholder log entries ──────────────────────────────────────────────
private data class LogEntry(
    val time: String,
    val actor: String,
    val action: String,
    val detail: String,
    val type: String, // "mcp" | "file" | "cmd"
)

private val PLACEHOLDER_LOGS = listOf(
    LogEntry("17:10", "Claude", "探索", "1 search, 1 file", "cmd"),
    LogEntry("17:10", "Claude", "写入", "AcpConnectionManager.kt +67", "file"),
    LogEntry("17:11", "Claude", "运行", "./gradlew :backend:compileKotlin", "cmd"),
    LogEntry("17:11", "Claude", "验证通过", "BUILD SUCCESSFUL", "cmd"),
    LogEntry("17:09", "MCP", "github.search_repos", "3 results", "mcp"),
    LogEntry("17:08", "MCP", "filesystem.read_file", "src/Main.kt", "mcp"),
)

// ── Extension chip color helper ──────────────────────────────────────────
private fun extColor(ext: String): Color = when (ext) {
    "kt", "json", "kts" -> AgentKimi
    "md" -> Tx
    "toml", "yaml", "yml" -> Ac
    else -> Tx2
}

private fun logDotColor(type: String): Color = when (type) {
    "mcp" -> Gn
    "file" -> AgentClaude
    "cmd" -> Ac
    else -> Tx3
}

// ════════════════════════════════════════════════════════════════════════
//  Main composable
// ════════════════════════════════════════════════════════════════════════

@Composable
fun RightPanel(
    selectedAgent: AgentInfo,
    currentTab: String,
    onTabChange: (String) -> Unit,
    mcpServers: List<McpServerDto>,
    skills: List<SkillDto>,
    gitStatus: GitStatusDto = GitStatusDto(),
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.width(320.dp).background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)) {
        // ── Tab header row ───────────────────────────────────────────────
        TabHeader(currentTab, onTabChange)

        // ── Tab content ──────────────────────────────────────────────────
        when (currentTab) {
            "changes" -> ChangesTab(gitStatus)
            "inspector" -> InspectorTab()
            "log" -> LogTab()
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
//  Tab Header
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun TabHeader(currentTab: String, onTabChange: (String) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().border(1.dp, Line)) {
        TABS.forEach { (id, label) ->
            val isActive = currentTab == id
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onTabChange(id) }
                    .padding(vertical = 10.dp, horizontal = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    label,
                    color = if (isActive) Ac else Tx3,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = SansFont,
                )
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .clip(RoundedCornerShape(1.dp))
                        .background(if (isActive) Ac else Color.Transparent),
                )
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
//  变更 Tab — Change Management
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.ChangesTab(gitStatus: GitStatusDto) {
    // Accept/reject state: filePath → "accepted" | "rejected" | null
    val fileStates = remember { mutableStateMapOf<String, String?>() }
    var selectedFile by remember { mutableStateOf<String?>(null) }
    val changes = PLACEHOLDER_CHANGES // placeholder data

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f)
            .verticalScroll(rememberScrollState()),
    ) {
        // ── Header with "全部接受" button ────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "变更文件 (${changes.size})",
                color = Tx3,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont,
                letterSpacing = 0.7.sp,
            )
            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(Ac.withAlpha(0.12f))
                    .border(1.dp, Ac.withAlpha(0.3f), RoundedCornerShape(4.dp))
                    .clickable {
                        changes.forEach { fileStates[it.path] = "accepted" }
                    }
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text("全部接受", color = Ac, fontSize = 9.sp, fontFamily = SansFont)
            }
        }

        // ── File change list ─────────────────────────────────────────────
        changes.forEach { change ->
            val state = fileStates[change.path]
            val isRejected = state == "rejected"
            val isSelected = selectedFile == change.path

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 3.dp)
                    .alpha(if (isRejected) 0.5f else 1f),
            ) {
                // File row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(9.dp))
                        .background(Bg3.copy(alpha = 0.35f))
                        .border(1.dp, if (isSelected) Ac.withAlpha(0.4f) else Line, RoundedCornerShape(9.dp))
                        .clickable { selectedFile = if (isSelected) null else change.path }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Extension chip
                    ExtensionChip(change.extension)
                    Spacer(Modifier.width(6.dp))

                    // Filename + optional NEW badge
                    Text(
                        change.name,
                        color = Tx,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = SansFont,
                    )
                    if (change.isNew) {
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "NEW",
                            color = Ac,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = SansFont,
                        )
                    }
                    Spacer(Modifier.width(6.dp))

                    // Diff stats
                    if (change.added > 0) {
                        Text("+${change.added}", color = Gn, fontSize = 10.sp, fontFamily = SansFont)
                    }
                    if (change.removed > 0) {
                        Spacer(Modifier.width(4.dp))
                        Text("-${change.removed}", color = Rd, fontSize = 10.sp, fontFamily = SansFont)
                    }

                    Spacer(Modifier.weight(1f))

                    // Accept / Reject icon buttons (✓ / ✗) — 对齐核心稿 .btn-accept / .btn-reject
                    if (state != "accepted") {
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .clip(RoundedCornerShape(5.dp))
                                .border(1.dp, Line, RoundedCornerShape(5.dp))
                                .clickable { fileStates[change.path] = "accepted" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Check, contentDescription = "接受", tint = Gn, modifier = Modifier.size(12.dp))
                        }
                    }
                    if (state != "rejected") {
                        Spacer(Modifier.width(4.dp))
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .clip(RoundedCornerShape(5.dp))
                                .border(1.dp, Line, RoundedCornerShape(5.dp))
                                .clickable { fileStates[change.path] = "rejected" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "拒绝", tint = Rd, modifier = Modifier.size(12.dp))
                        }
                    }
                    if (state == "accepted") {
                        Icon(Icons.Filled.Check, contentDescription = "已接受", tint = Gn, modifier = Modifier.size(14.dp))
                    }
                }

                // ── Expanded diff preview ─────────────────────────────────
                AnimatedVisibility(
                    visible = isSelected && change.diffLines.isNotEmpty(),
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 4.dp)
                            .clip(RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp))
                            .background(Bg3)
                            .border(1.dp, Line, RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        change.diffLines.forEach { line ->
                            val isAdd = line.startsWith("+")
                            val isDel = line.startsWith("-")
                            val bgColor = when {
                                isAdd -> Gn.withAlpha(0.06f)
                                isDel -> Rd.withAlpha(0.06f)
                                else -> Color.Transparent
                            }
                            val fgColor = when {
                                isAdd -> Gn
                                isDel -> Rd
                                else -> Tx3
                            }
                            Text(
                                line,
                                color = fgColor,
                                fontSize = 10.sp,
                                fontFamily = CodeFont,
                                lineHeight = 16.sp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(bgColor, RoundedCornerShape(2.dp))
                                    .padding(horizontal = 4.dp, vertical = 0.5.dp),
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ── Session stats grid (2×2) ─────────────────────────────────────
        SessionStatsGrid()
    }
}

// ── Extension chip ───────────────────────────────────────────────────────

@Composable
private fun ExtensionChip(ext: String) {
    val color = extColor(ext)
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .background(color.withAlpha(0.15f))
            .padding(horizontal = 5.dp, vertical = 1.dp),
    ) {
        Text(ext, color = color, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
    }
}

// ── Session stats 2×2 grid ──────────────────────────────────────────────

@Composable
private fun SessionStatsGrid() {
    val stats = listOf(
        "Token" to "12,450",
        "工具调用" to "23",
        "耗时" to "4m 32s",
        "成本" to "\$0.08",
    )

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Text(
            "会话统计",
            color = Tx3,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont,
            letterSpacing = 0.7.sp,
        )
        Spacer(Modifier.height(6.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            stats.take(2).forEach { (label, value) ->
                StatCell(label, value, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            stats.drop(2).forEach { (label, value) ->
                StatCell(label, value, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(6.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Text(label, color = Tx3, fontSize = 9.sp, fontFamily = SansFont)
        Spacer(Modifier.height(2.dp))
        Text(value, color = Tx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, fontFamily = SansFont)
    }
}

// ════════════════════════════════════════════════════════════════════════
//  检查 Tab — Inspector
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.InspectorTab() {
    // Placeholder: show a selected file's details
    val fileName = "AcpConnectionManager.kt"
    val filePath = "src/backend/AcpConnectionManager.kt"
    val ext = "kt"
    val size = "4.2 KB"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f)
            .verticalScroll(rememberScrollState())
            .padding(12.dp),
    ) {
        Text(
            "文件检查",
            color = Tx3,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont,
            letterSpacing = 0.7.sp,
        )
        Spacer(Modifier.height(12.dp))

        // ── Icon box + filename ───────────────────────────────────────────
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(extColor(ext).withAlpha(0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    ext.uppercase(),
                    color = extColor(ext),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SansFont,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                fileName,
                color = Tx,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont,
            )
        }

        Spacer(Modifier.height(16.dp))

        // ── Detail rows ──────────────────────────────────────────────────
        InspectorRow("路径", filePath)
        InspectorRow("扩展名", ".$ext")
        InspectorRow("大小", size)
        InspectorRow("修改状态", "Modified")
    }
}

@Composable
private fun InspectorRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(6.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Tx3, fontSize = 10.sp, fontFamily = SansFont, modifier = Modifier.width(56.dp))
        Text(value, color = Tx, fontSize = 11.sp, fontFamily = SansFont)
    }
}

// ════════════════════════════════════════════════════════════════════════
//  日志 Tab — Activity Log
// ════════════════════════════════════════════════════════════════════════

@Composable
private fun ColumnScope.LogTab() {
    var activeFilter by remember { mutableStateOf("全部") }
    val filters = listOf("全部", "MCP", "文件")

    Column(modifier = Modifier.fillMaxWidth().weight(1f)) {
        // ── Filter chips ─────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "活动日志",
                color = Tx3,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = SansFont,
                letterSpacing = 0.6.sp,
            )
            Spacer(Modifier.weight(1f))
            filters.forEach { label ->
                val isActive = activeFilter == label
                Box(
                    modifier = Modifier
                        .padding(start = 4.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .then(
                            if (isActive) Modifier.border(1.dp, Ac, RoundedCornerShape(5.dp)).background(Ac.withAlpha(0.12f))
                            else Modifier,
                        )
                        .clickable { activeFilter = label }
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                ) {
                    Text(
                        label,
                        color = if (isActive) Ac else Tx3,
                        fontSize = 10.sp,
                        fontFamily = SansFont,
                    )
                }
            }
        }

        // ── Timeline entries ─────────────────────────────────────────────
        val filtered = PLACEHOLDER_LOGS.filter { entry ->
            when (activeFilter) {
                "MCP" -> entry.type == "mcp"
                "文件" -> entry.type == "file"
                else -> true
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        ) {
            items(filtered) { entry ->
                TimelineEntry(entry)
            }
        }
    }
}

@Composable
private fun TimelineEntry(entry: LogEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Colored dot
        Box(
            modifier = Modifier
                .padding(top = 3.dp)
                .size(6.dp)
                .clip(CircleShape)
                .background(logDotColor(entry.type)),
        )
        Spacer(Modifier.width(8.dp))

        // Timestamp
        Text(
            entry.time,
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = SansFont,
            modifier = Modifier.width(36.dp),
        )
        Spacer(Modifier.width(4.dp))

        // Actor
        Text(
            entry.actor,
            color = Ac,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = SansFont,
            modifier = Modifier.width(44.dp),
        )

        // Action
        Text(
            entry.action,
            color = when (entry.action) {
                "验证通过" -> Gn
                else -> Tx
            },
            fontSize = 11.sp,
            fontFamily = SansFont,
            modifier = Modifier.weight(1f),
        )

        // Detail
        Text(
            entry.detail,
            color = Tx3,
            fontSize = 10.sp,
            fontFamily = SansFont,
        )
    }
}
