package com.swarmeditor.backend.service

import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.common.model.SkillConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class SkillService(private val store: SkillStore, private val scanner: SkillScanner) {
    private val _skills = MutableStateFlow<List<SkillConfig>>(emptyList())
    val skills: StateFlow<List<SkillConfig>> = _skills

    suspend fun init() { store.load(); refresh() }
    suspend fun scan() { scanner.scanGlobal().forEach { store.upsert(it) }; refresh() }
    suspend fun getAll() = store.getAll()
    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean) { store.toggleAgent(id, agentId, enabled); refresh() }
    private suspend fun refresh() { _skills.value = store.getAll() }
}
