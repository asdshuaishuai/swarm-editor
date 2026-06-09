package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.ApiClient
import com.swarmeditor.desktop.api.FileNodeDto
import com.swarmeditor.desktop.theme.*

// ── Stats helpers ──────────────────────────────────────────────────

private fun countFiles(node: FileNodeDto): Int =
    if (node.isDirectory) node.children.sumOf { countFiles(it) } else 1

private fun countByStatus(node: FileNodeDto, status: String): Int {
    if (node.isDirectory) return node.children.sumOf { countByStatus(it, status) }
    return if (node.changeStatus == status) 1 else 0
}

// ── Demo data ──────────────────────────────────────────────────────

private fun demoTree(): FileNodeDto = FileNodeDto(
    name = "swarm-editor",
    path = ".",
    isDirectory = true,
    children = listOf(
        FileNodeDto("common", "common", true, listOf(
            FileNodeDto("src", "common/src", true, listOf(
                FileNodeDto("commonMain", "common/src/commonMain", true, listOf(
                    FileNodeDto("models.kt", "common/src/commonMain/models.kt", false, changeStatus = "modified"),
                    FileNodeDto("protocol.kt", "common/src/commonMain/protocol.kt", false)
                ))
            )),
            FileNodeDto("build.gradle.kts", "common/build.gradle.kts", false)
        )),
        FileNodeDto("backend", "backend", true, listOf(
            FileNodeDto("src", "backend/src", true, listOf(
                FileNodeDto("Main.kt", "backend/src/Main.kt", false, changeStatus = "modified"),
                FileNodeDto("AgentService.kt", "backend/src/AgentService.kt", false)
            )),
            FileNodeDto("build.gradle.kts", "backend/build.gradle.kts", false)
        )),
        FileNodeDto("desktopApp", "desktopApp", true, listOf(
            FileNodeDto("src", "desktopApp/src", true, listOf(
                FileNodeDto("App.kt", "desktopApp/src/App.kt", false, changeStatus = "new"),
                FileNodeDto("Theme.kt", "desktopApp/src/Theme.kt", false)
            )),
            FileNodeDto("build.gradle.kts", "desktopApp/build.gradle.kts", false)
        )),
        FileNodeDto("README.md", "README.md", false),
        FileNodeDto("settings.gradle.kts", "settings.gradle.kts", false),
        FileNodeDto("gradle.properties", "gradle.properties", false, changeStatus = "new")
    )
)

// ── Filter chip ────────────────────────────────────────────────────

@Composable
private fun FilterChip(
    label: String,
    active: Boolean,
    onClick: () -> Unit
) {
    val bg = if (active) Ac.copy(alpha = 0.12f) else Bg2
    val fg = if (active) Ac else Tx2
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 5.dp)
    ) {
        Text(label, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

// ── Stat card ──────────────────────────────────────────────────────

@Composable
private fun StatCard(label: String, value: String, accentColor: androidx.compose.ui.graphics.Color) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Surface2)
            .then(
                Modifier.background(Bd.copy(alpha = 0.3f)) // border simulation
            )
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(value, color = accentColor, fontSize = 20.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
        Spacer(Modifier.height(2.dp))
        Text(label, color = Tx2, fontSize = 10.sp)
    }
}

// ── Main composable ────────────────────────────────────────────────

@Composable
fun FileExplorerView(modifier: Modifier = Modifier) {
    val tree = remember { mutableStateOf<FileNodeDto?>(null) }
    val expandedDirs = remember { mutableStateMapOf<String, Boolean>() }
    val selectedPath = remember { mutableStateOf<String?>(null) }
    val filterChangesOnly = remember { mutableStateOf(false) }
    val isLoading = remember { mutableStateOf(true) }

    // Fetch project tree from API; fall back to demo data
    LaunchedEffect(Unit) {
        isLoading.value = true
        val result = ApiClient.getProjectTree()
        tree.value = if (result.name.isBlank()) demoTree() else result
        isLoading.value = false
    }

    val rootNode = tree.value
    if (rootNode == null || isLoading.value) {
        Box(
            modifier.fillMaxSize().background(Bg),
            contentAlignment = Alignment.Center
        ) {
            Text("加载中...", color = Tx2, fontSize = 14.sp)
        }
        return
    }

    val totalFiles = countFiles(rootNode)
    val modifiedCount = countByStatus(rootNode, "modified")
    val newCount = countByStatus(rootNode, "new")

    Column(modifier.fillMaxSize().background(Bg)) {
        // ── Top bar ────────────────────────────────────────────
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("📁", fontSize = 16.sp)
                Column {
                    Text(rootNode.name, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(rootNode.path, color = Tx3, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                }
            }
            Text("$totalFiles 文件", color = Tx2, fontSize = 11.sp)
        }

        // ── Filter chips ───────────────────────────────────────
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip("全部", !filterChangesOnly.value) { filterChangesOnly.value = false }
            FilterChip("仅变更", filterChangesOnly.value) { filterChangesOnly.value = true }
        }

        Spacer(Modifier.height(10.dp))

        // ── Stats cards ────────────────────────────────────────
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatCard("Total", totalFiles.toString(), Ac)
            StatCard("Modified", modifiedCount.toString(), Gd)
            StatCard("New", newCount.toString(), Gn)
        }

        Spacer(Modifier.height(10.dp))

        // ── Split: file tree (left) + content area (right) ─────
        Row(Modifier.fillMaxWidth().weight(1f)) {
            // Left: FileTreeView
            Column(
                Modifier
                    .width(280.dp)
                    .fillMaxHeight()
                    .background(Bg2)
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 6.dp)
            ) {
                FileTreeView(
                    tree = rootNode,
                    expanded = expandedDirs,
                    selectedPath = selectedPath.value,
                    onSelectFile = { selectedPath.value = it.path },
                    onToggleDir = { path ->
                        expandedDirs[path] = !(expandedDirs[path] ?: false)
                    },
                    filterChangesOnly = filterChangesOnly.value
                )
            }

            // Right: content placeholder
            Box(
                Modifier.weight(1f).fillMaxHeight().background(Bg),
                contentAlignment = Alignment.Center
            ) {
                if (selectedPath.value != null) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📄", fontSize = 32.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(selectedPath.value!!, color = Tx, fontSize = 13.sp, fontFamily = FontFamily.Monospace)
                        Spacer(Modifier.height(4.dp))
                        Text("选择文件查看详情", color = Tx3, fontSize = 11.sp)
                    }
                } else {
                    Text("选择文件查看详情", color = Tx3, fontSize = 13.sp)
                }
            }
        }
    }
}
