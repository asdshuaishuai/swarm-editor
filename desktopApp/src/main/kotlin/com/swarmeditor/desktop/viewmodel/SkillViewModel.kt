package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.skill.ProjectSkillTrustStatus
import com.swarmeditor.desktop.api.SkillDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SkillActionEvent(val message: String, val type: ToastType)

class SkillViewModel(
    private val service: SkillService,
    private val scope: CoroutineScope
) {
    private val eventChannel = Channel<SkillActionEvent>(Channel.BUFFERED)
    val events = eventChannel.receiveAsFlow()

    val skills: StateFlow<List<SkillDto>> = service.skills
        .map { skills -> skills.map { it.toDto() } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _projectSkillTrust = kotlinx.coroutines.flow.MutableStateFlow<ProjectSkillTrustStatus?>(null)
    val projectSkillTrust: StateFlow<ProjectSkillTrustStatus?> = _projectSkillTrust

    fun load() {
        scan(notifySuccess = false)
    }

    fun scan() {
        scan(notifySuccess = true)
    }

    fun trustProjectSkills() {
        scope.launch {
            try {
                service.trustProjectSkills().fold(
                    onSuccess = { status ->
                        _projectSkillTrust.value = status
                        eventChannel.send(SkillActionEvent("项目 Skills 已信任", ToastType.SUCCESS))
                    },
                    onFailure = { eventChannel.send(SkillActionEvent(it.message ?: "项目 Skills 信任失败", ToastType.ERROR)) },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(SkillActionEvent(error.message ?: "项目 Skills 信任失败", ToastType.ERROR))
            }
        }
    }

    fun revokeProjectSkillTrust() {
        scope.launch {
            try {
                service.revokeProjectSkillTrust().fold(
                    onSuccess = {
                        refreshProjectSkillTrustNow()
                        eventChannel.send(SkillActionEvent("项目 Skills 信任已撤销", ToastType.INFO))
                    },
                    onFailure = { eventChannel.send(SkillActionEvent(it.message ?: "项目 Skills 撤销失败", ToastType.ERROR)) },
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(SkillActionEvent(error.message ?: "项目 Skills 撤销失败", ToastType.ERROR))
            }
        }
    }

    private fun scan(notifySuccess: Boolean) {
        scope.launch {
            try {
                service.scan().fold(
                    onSuccess = {
                        refreshProjectSkillTrustNow()
                        if (notifySuccess) {
                            eventChannel.send(SkillActionEvent("Skills 扫描完成", ToastType.SUCCESS))
                        }
                    },
                    onFailure = { eventChannel.send(SkillActionEvent(it.message ?: "Skills 扫描失败", ToastType.ERROR)) }
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                eventChannel.send(SkillActionEvent(error.message ?: "Skills 扫描失败", ToastType.ERROR))
            }
        }
    }

    private suspend fun refreshProjectSkillTrustNow() {
        service.getProjectSkillTrust().onSuccess { _projectSkillTrust.value = it }
    }
}
