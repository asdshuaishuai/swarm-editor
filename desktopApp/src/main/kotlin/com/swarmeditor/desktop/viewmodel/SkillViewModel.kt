package com.swarmeditor.desktop.viewmodel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class SkillViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _skills = MutableStateFlow<List<com.swarmeditor.desktop.api.SkillDto>>(emptyList())
    val skills: StateFlow<List<com.swarmeditor.desktop.api.SkillDto>> = _skills

    fun load() {
        scope.launch { _skills.value = demoSkills }
    }

    fun scan() {
        scope.launch { _skills.value = demoSkills }
    }
}
