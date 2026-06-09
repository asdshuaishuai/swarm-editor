package com.swarmeditor.backend.acp

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// --- ACP 消息类型定义 ---

@Serializable
data class InitializeParams(
    @SerialName("protocolVersion") val protocolVersion: String,
    @SerialName("clientInfo") val clientInfo: ClientInfo
)

@Serializable
data class ClientInfo(
    val name: String,
    val version: String
)

@Serializable
data class SessionNewParams(
    val mode: String = "default"
)

@Serializable
data class SessionNewResult(
    @SerialName("sessionId") val sessionId: String
)

@Serializable
data class SessionPromptParams(
    @SerialName("sessionId") val sessionId: String,
    val prompt: PromptContent
)

@Serializable
data class PromptContent(
    val content: List<ContentBlock>
)

@Serializable
data class ContentBlock(
    val type: String = "text",
    val text: String = "",
    val mimeType: String = ""
)

@Serializable
data class SessionPromptResult(
    val content: List<ContentBlock> = emptyList()
)

@Serializable
data class SessionCloseParams(
    @SerialName("sessionId") val sessionId: String
)

@Serializable
data class SessionUpdate(
    @SerialName("sessionId") val sessionId: String,
    val update: JsonElement? = null
)
