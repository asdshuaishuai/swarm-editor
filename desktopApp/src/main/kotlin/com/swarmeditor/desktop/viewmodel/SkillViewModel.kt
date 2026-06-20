package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.SkillDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class SkillViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _skills = MutableStateFlow<List<SkillDto>>(emptyList())
    val skills: StateFlow<List<SkillDto>> = _skills

    // 设计稿示例 Skills（mvp-design-mockup.html · skills）
    private val mockSkills = listOf(
        SkillDto(id = "code-review", name = "code-review", description = "自动代码审查 — 检查质量、安全与最佳实践，输出结构化报告。", source = "本地", tags = listOf("review", "质量")),
        SkillDto(id = "test-generator", name = "test-generator", description = "自动生成单元测试 — 支持 JUnit、pytest、Jest 多框架。", source = "本地", tags = listOf("test")),
        SkillDto(id = "github-tools", name = "github-tools", description = "GitHub 工具集 — 8 个工具 · 从 github MCP 自动发现并封装。", source = "MCP", tags = listOf("github"))
    )

    fun load() {
        scope.launch { _skills.value = mockSkills }
    }

    fun scan() {
        scope.launch { _skills.value = mockSkills }
    }
}
