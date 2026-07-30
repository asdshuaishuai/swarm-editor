package com.swarmeditor.desktop.viewmodel

import java.util.UUID

enum class ToastType {
    INFO, SUCCESS, ERROR
}

@androidx.compose.runtime.Immutable
data class ToastData(
    val id: String = UUID.randomUUID().toString(),
    val message: String,
    val type: ToastType = ToastType.INFO,
    val createdAt: Long = System.currentTimeMillis()
)
