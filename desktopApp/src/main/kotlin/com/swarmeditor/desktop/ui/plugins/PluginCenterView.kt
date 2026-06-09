package com.swarmeditor.desktop.ui.plugins

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow.Companion.Ellipsis
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarmeditor.desktop.api.McpServerDto
import com.swarmeditor.desktop.api.SkillDto
import com.swarmeditor.desktop.theme.*

/** Sub-tab options for the plugin center. */
enum class PluginSubTab(val label: String) {
    MCP("MCP Servers"),
    SKILLS("Skills")
}

/**
 * Two-state composable: list view ↔ detail view.
 * List state: hero section + search + category filters + card grid.
 * Detail state: delegates to McpDetailView or SkillDetailView.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PluginCenterView(
    mcpServers: List<McpServerDto>,
    skills: List<SkillDto>,
    modifier: Modifier = Modifier
) {
    // State: list vs detail
    var selectedItem by remember { mutableStateOf<PluginItem?>(null) }
    var activeSubTab by remember { mutableStateOf(PluginSubTab.MCP) }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }

    Box(modifier = modifier.fillMaxSize()) {
        if (selectedItem != null) {
            // Detail view
            when (val item = selectedItem!!) {
                is PluginItem.Mcp -> McpDetailView(
                    server = item.server,
                    onBack = { selectedItem = null },
                    modifier = Modifier.fillMaxSize()
                )
                is PluginItem.Skill -> SkillDetailView(
                    skill = item.skill,
                    onBack = { selectedItem = null },
                    modifier = Modifier.fillMaxSize()
                )
            }
        } else {
            // List view
            Column(modifier = Modifier.fillMaxSize()) {
                // Hero section
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Bg2)
                        .padding(horizontal = 24.dp, vertical = 18.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text(
                                text = "Plugin Center",
                                color = Tx,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "${mcpServers.size} MCP Servers",
                                    color = Tx2,
                                    fontSize = 12.sp,
                                    fontFamily = MonoFont
                                )
                                Spacer(Modifier.width(12.dp))
                                Text("·", color = Tx4, fontSize = 12.sp)
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    text = "${skills.size} Skills",
                                    color = Tx2,
                                    fontSize = 12.sp,
                                    fontFamily = MonoFont
                                )
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        // Search field
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Search plugins...", color = Tx3, fontSize = 12.sp) },
                            singleLine = true,
                            textStyle = androidx.compose.ui.text.TextStyle(
                                color = Tx,
                                fontSize = 12.sp,
                                fontFamily = MonoFont
                            ),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Ac,
                                unfocusedBorderColor = Bd,
                                cursorColor = Ac
                            ),
                            modifier = Modifier.width(240.dp).clip(RoundedCornerShape(8.dp))
                        )
                    }

                    Spacer(Modifier.height(14.dp))

                    // Sub-tab toggle: MCP / Skills
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Bg)
                            .border(1.dp, Bd, RoundedCornerShape(8.dp))
                    ) {
                        PluginSubTab.entries.forEach { tab ->
                            val isActive = activeSubTab == tab
                            Text(
                                text = tab.label,
                                color = if (isActive) Bg else Tx2,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                fontFamily = MonoFont,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(7.dp))
                                    .background(if (isActive) Ac else androidx.compose.ui.graphics.Color.Transparent)
                                    .clickable { activeSubTab = tab }
                                    .padding(horizontal = 16.dp, vertical = 7.dp)
                            )
                        }
                    }
                }

                // Category filter chips
                val categories = when (activeSubTab) {
                    PluginSubTab.MCP -> mcpServers.flatMap { it.categories }.distinct()
                    PluginSubTab.SKILLS -> skills.flatMap { it.tags }.distinct()
                }

                if (categories.isNotEmpty()) {
                    Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
                        Text(
                            text = "Categories",
                            color = Tx3,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = MonoFont
                        )
                        Spacer(Modifier.height(6.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            categories.forEach { category ->
                                Text(
                                    text = category,
                                    color = Tx2,
                                    fontSize = 10.sp,
                                    fontFamily = MonoFont,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(5.dp))
                                        .background(Surface)
                                        .border(1.dp, Bd, RoundedCornerShape(5.dp))
                                        .clickable { /* filter by category - placeholder */ }
                                        .padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }

                // Card grid
                val items: List<PluginItem> = when (activeSubTab) {
                    PluginSubTab.MCP -> {
                        val q = searchQuery.text.lowercase()
                        mcpServers
                            .filter { q.isEmpty() || it.name.lowercase().contains(q) || it.description.lowercase().contains(q) }
                            .map { PluginItem.Mcp(it) }
                    }
                    PluginSubTab.SKILLS -> {
                        val q = searchQuery.text.lowercase()
                        skills
                            .filter { q.isEmpty() || it.name.lowercase().contains(q) || it.description.lowercase().contains(q) }
                            .map { PluginItem.Skill(it) }
                    }
                }

                if (items.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = if (searchQuery.text.isNotEmpty()) "No results found" else "No ${activeSubTab.label.lowercase()} available",
                                color = Tx3,
                                fontSize = 13.sp,
                                fontFamily = MonoFont
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = if (searchQuery.text.isNotEmpty()) "Try a different search term" else "Add plugins to get started",
                                color = Tx4,
                                fontSize = 11.sp,
                                fontFamily = MonoFont
                            )
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 360.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 24.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(items, key = { it.key() }) { item ->
                            PluginTile(
                                item = item,
                                onClick = { selectedItem = item }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun PluginItem.key(): String = when (this) {
    is PluginItem.Mcp -> "mcp-${server.id}"
    is PluginItem.Skill -> "skill-${skill.id}"
}
