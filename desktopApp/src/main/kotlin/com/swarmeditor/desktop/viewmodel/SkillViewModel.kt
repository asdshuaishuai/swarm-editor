package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.backend.service.SkillService
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

    fun load() {
        scan(notifySuccess = false)
    }

    fun scan() {
        scan(notifySuccess = true)
    }

    private fun scan(notifySuccess: Boolean) {
        scope.launch {
            try {
                service.scan().fold(
                    onSuccess = {
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
}
