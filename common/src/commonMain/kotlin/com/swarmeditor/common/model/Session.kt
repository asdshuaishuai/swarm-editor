package com.swarmeditor.common.model

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/** 会话 */
@Serializable
data class Session(
    val id: String,
    val agentId: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val messages: List<Message> = emptyList(),
    val status: SessionStatus = SessionStatus.ACTIVE
)

/** 会话状态 */
@Serializable
enum class SessionStatus {
    ACTIVE,
    CLOSED,
    ARCHIVED
}

/** 消息 */
@Serializable
data class Message(
    val id: String,
    val role: MessageRole,
    val content: List<ContentBlock>,
    val createdAt: Instant
)

/** 消息角色 */
@Serializable
enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM
}

/** 内容块 */
@Serializable
data class ContentBlock(
    val type: String = "text",
    val text: String = "",
    val resource: ResourceRef? = null,
    val image: ImageData? = null
)

/** 资源引用 */
@Serializable
data class ResourceRef(
    val uri: String,
    val mimeType: String = ""
)

/** 图片数据 */
@Serializable
data class ImageData(
    val base64: String,
    val mimeType: String = "image/png"
)
