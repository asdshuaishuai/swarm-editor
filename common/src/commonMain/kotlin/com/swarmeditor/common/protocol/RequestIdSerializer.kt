package com.swarmeditor.common.protocol

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull

/**
 * RequestId 的自定义序列化器。
 *
 * JSON-RPC 2.0 的 id 字段可以是 number 或 string，
 * 此序列化器处理两种情况的读写。
 */
object RequestIdSerializer : KSerializer<RequestId> {
    override val descriptor = buildClassSerialDescriptor("RequestId")

    override fun deserialize(decoder: Decoder): RequestId {
        val jsonDecoder = decoder as? JsonDecoder
            ?: error("RequestIdSerializer only works with JSON")
        val element = jsonDecoder.decodeJsonElement()
        return when {
            element is JsonPrimitive && element.isString -> RequestId.StringId(element.content)
            element is JsonPrimitive && element.longOrNull != null -> RequestId.NumericId(element.long)
            else -> RequestId.StringId(element.toString())
        }
    }

    override fun serialize(encoder: Encoder, value: RequestId) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: error("RequestIdSerializer only works with JSON")
        val element = when (value) {
            is RequestId.NumericId -> JsonPrimitive(value.value)
            is RequestId.StringId -> JsonPrimitive(value.value)
        }
        jsonEncoder.encodeJsonElement(element)
    }
}
