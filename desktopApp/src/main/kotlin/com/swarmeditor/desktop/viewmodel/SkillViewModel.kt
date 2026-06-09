package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.desktop.api.ApiClient
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

    fun load() {
        scope.launch { _skills.value = ApiClient.getSkills() }
    }

    fun scan() {
        scope.launch { _skills.value = ApiClient.scanSkills() }
    }
}
