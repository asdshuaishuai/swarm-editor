package com.swarmeditor.backend.pi

import java.security.MessageDigest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class PiToolBrokerRequest(
    val requestId: String,
    val sessionNonce: String,
    val tool: String,
    val operation: String,
    val arguments: JsonObject,
    val argumentsHash: String,
    val deadlineMillis: Long,
)

data class PiToolBrokerResult(
    val result: JsonElement,
    val auditId: String,
)

fun interface PiToolBroker {
    suspend fun execute(request: PiToolBrokerRequest): PiToolBrokerResult

    val brokerSessionId: String?
        get() = null

    fun auditIds(): List<String> = emptyList()

    suspend fun close() = Unit
}

fun interface PiToolBrokerFactory {
    fun create(config: com.swarmeditor.common.model.AgentConfig, workingDirectory: java.io.File): PiToolBroker?
}

internal fun parsePiToolBrokerRequest(
    payload: JsonObject,
    expectedNonce: String,
    nowMillis: Long = System.currentTimeMillis(),
): PiToolBrokerRequest {
    require(payload.toString().encodeToByteArray().size <= MAX_PI_TOOL_BROKER_REQUEST_BYTES) {
        "Tool broker request exceeds ${MAX_PI_TOOL_BROKER_REQUEST_BYTES}B limit"
    }
    val requestId = payload.string("requestId")
    require(requestId.matches(requestIdPattern)) { "Invalid tool broker request id" }
    val nonce = payload.string("sessionNonce")
    require(nonce == expectedNonce) { "Tool broker session nonce mismatch" }
    val tool = payload.string("tool")
    val operation = payload.string("operation")
    require(operation in allowedOperations[tool].orEmpty()) { "Unsupported tool broker operation: $tool.$operation" }
    val arguments = payload["arguments"]?.jsonObject ?: error("Tool broker arguments are required")
    val deadlineMillis = payload["deadlineMillis"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
        ?: error("Tool broker deadline is required")
    require(deadlineMillis > nowMillis) { "Tool broker request deadline expired" }
    return PiToolBrokerRequest(
        requestId = requestId,
        sessionNonce = nonce,
        tool = tool,
        operation = operation,
        arguments = arguments,
        argumentsHash = sha256(arguments.canonicalJson()),
        deadlineMillis = deadlineMillis,
    )
}

private fun JsonObject.string(name: String): String =
    this[name]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)
        ?: error("Tool broker $name is required")

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.encodeToByteArray())
    .joinToString("") { byte -> "%02x".format(byte) }

private fun JsonElement.canonicalJson(): String = when (this) {
    is JsonObject -> entries.sortedBy(Map.Entry<String, JsonElement>::key)
        .joinToString(prefix = "{", postfix = "}") { (key, value) ->
            "${Json.encodeToString(key)}:${value.canonicalJson()}"
        }
    is JsonArray -> joinToString(prefix = "[", postfix = "]") { it.canonicalJson() }
    else -> toString()
}

private val requestIdPattern = Regex("tr-[1-9][0-9]{0,18}")
internal const val MAX_PI_TOOL_BROKER_REQUEST_BYTES = 1024 * 1024
internal const val MAX_PI_TOOL_BROKER_RESPONSE_BYTES = 4 * 1024 * 1024
private val allowedOperations = mapOf(
    "read" to setOf("access", "readFile", "detectImageMimeType"),
    "bash" to setOf("exec"),
    "edit" to setOf("access", "readFile", "writeFile"),
    "write" to setOf("mkdir", "writeFile"),
)
