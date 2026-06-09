package com.swarmeditor.common.protocol

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement

/**
 * JSON-RPC 2.0 消息类型定义。
 *
 * ACP 和 MCP 均基于 JSON-RPC 2.0 协议，此处定义共用的消息结构。
 */

/** 请求 ID（支持 int 和 string） */
@Serializable(with = RequestIdSerializer::class)
sealed interface RequestId {
    @Serializable
    data class NumericId(val value: Long) : RequestId

    @Serializable
    data class StringId(val value: String) : RequestId
}

/** JSON-RPC 2.0 错误 */
@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null
)

/** JSON-RPC 2.0 请求 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class JsonRpcRequest(
    @EncodeDefault val jsonrpc: String = "2.0",
    val id: RequestId,
    val method: String,
    val params: JsonElement? = null
)

/** JSON-RPC 2.0 响应 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class JsonRpcResponse(
    @EncodeDefault val jsonrpc: String = "2.0",
    val id: RequestId? = null,
    val result: JsonElement? = null,
    val error: JsonRpcError? = null
)

/** JSON-RPC 2.0 通知（无 id） */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class JsonRpcNotification(
    @EncodeDefault val jsonrpc: String = "2.0",
    val method: String,
    val params: JsonElement? = null
)

/** ACP 自定义错误码 */
object AcpErrorCodes {
    const val PARSE_ERROR = -32700
    const val INVALID_REQUEST = -32600
    const val METHOD_NOT_FOUND = -32601
    const val INVALID_PARAMS = -32602
    const val INTERNAL_ERROR = -32603
    const val SESSION_NOT_FOUND = -32001
    const val AGENT_NOT_READY = -32002
    const val PERMISSION_DENIED = -32003
    const val TOOL_EXECUTION = -32004
    const val AUTHENTICATION = -32005
    const val SESSION_CANCELLED = -32006
    const val CAPABILITY_NOT_SUPPORTED = -32007
}
