package com.swarmeditor.desktop.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import com.woowla.compose.icon.collections.feather.Feather
import com.woowla.compose.icon.collections.feather.feather.Folder
import com.woowla.compose.icon.collections.feather.feather.RefreshCw
import com.woowla.compose.icon.collections.feather.feather.File
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
private fun FilterChip(label: String, active: Boolean, onClick: () -> Unit) {
    val bg = if (active) Ac.withAlpha(0.12f) else Bg2
    val fg = if (active) AcLight else Tx2
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

// ── Main composable：左 全高文件树侧栏 | 右 统计+详情 ─────────────

@Composable
fun FileExplorerView(modifier: Modifier = Modifier) {
    val tree = remember { mutableStateOf<FileNodeDto?>(null) }
    val expandedDirs = remember { mutableStateMapOf<String, Boolean>() }
    val selectedPath = remember { mutableStateOf<String?>(null) }
    val filterChangesOnly = remember { mutableStateOf(false) }
    val isLoading = remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        isLoading.value = true
        val result = ApiClient.getProjectTree()
        val root = if (result.name.isBlank()) demoTree() else result
        tree.value = root
        expandedDirs[root.path] = true
        root.children.filter { it.isDirectory }.forEach { expandedDirs[it.path] = true }
        isLoading.value = false
    }

    val rootNode = tree.value
    if (rootNode == null || isLoading.value) {
        Box(modifier.fillMaxSize().background(Bg2), contentAlignment = Alignment.Center) {
            Text("加载中...", color = Tx2, fontSize = 14.sp)
        }
        return
    }

    val totalFiles = countFiles(rootNode)
    val modifiedCount = countByStatus(rootNode, "modified")
    val newCount = countByStatus(rootNode, "new")

    Row(modifier.fillMaxSize().background(Bg0)) {
        // ── 左：文件树侧栏（全高，对齐全局侧栏样式 260dp）──────────
        Column(
            Modifier.width(260.dp).fillMaxHeight()
                .background(Bg1.copy(alpha = 0.85f)).border(1.dp, Line)
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("文件".uppercase(), color = Tx2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp)
                Spacer(Modifier.weight(1f))
                Box(Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).clickable { }, contentAlignment = Alignment.Center) {
                    Icon(imageVector = Feather.RefreshCw, contentDescription = "刷新", tint = Tx3, modifier = Modifier.size(15.dp))
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(6.dp)) {
                FileTreeView(
                    tree = rootNode,
                    expanded = expandedDirs,
                    selectedPath = selectedPath.value,
                    onSelectFile = { selectedPath.value = it.path },
                    onToggleDir = { path -> expandedDirs[path] = !(expandedDirs[path] ?: false) },
                    filterChangesOnly = filterChangesOnly.value
                )
            }
        }

        // ── 右：主区（topbar + 过滤 + 统计 + 详情）─────────────────
        Column(Modifier.weight(1f).fillMaxHeight().background(Bg2)) {
            // topbar
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(imageVector = Feather.Folder, contentDescription = "项目", tint = Warn, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(rootNode.name, color = Tx, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text("~/code/${rootNode.name} · $totalFiles 文件", color = Tx3, fontSize = 11.sp)
                }
                Spacer(Modifier.weight(1f))
                FilterChip("全部", !filterChangesOnly.value) { filterChangesOnly.value = false }
                Spacer(Modifier.width(6.dp))
                FilterChip("仅变更", filterChangesOnly.value) { filterChangesOnly.value = true }
            }

            // 统计卡
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard("总文件", totalFiles.toString(), Tx)
                StatCard("已修改", modifiedCount.toString(), WarnLight)
                StatCard("新增", newCount.toString(), OkLight)
            }

            Spacer(Modifier.height(10.dp))

            // 详情
            Box(Modifier.weight(1f).fillMaxWidth().background(Bg2), contentAlignment = Alignment.Center) {
                if (selectedPath.value != null) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(imageVector = Feather.File, contentDescription = "文件", modifier = Modifier.size(32.dp), tint = Tx2)
                        Spacer(Modifier.height(8.dp))
                        Text(selectedPath.value!!, color = Tx, fontSize = 13.sp)
                    }
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(56.dp).clip(RoundedCornerShape(14.dp))
                                .background(Bg3.copy(alpha = 0.6f)).border(1.dp, Line, RoundedCornerShape(14.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Feather.Folder, contentDescription = null, tint = Tx3, modifier = Modifier.size(26.dp))
                        }
                        Spacer(Modifier.height(12.dp))
                        Text("选择文件查看详情", color = Tx3, fontSize = 13.sp)
                        Spacer(Modifier.height(4.dp))
                        Text("从左侧文件树点击任意文件", color = Tx3, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, accentColor: Color) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Bg3)
            .border(1.dp, Line, RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(value, color = accentColor, fontSize = 20.sp, fontWeight = FontWeight.Bold, fontFamily = CodeFont)
        Spacer(Modifier.height(2.dp))
        Text(label, color = Tx2, fontSize = 10.sp)
    }
}
