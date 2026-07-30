package com.swarmeditor.backend.pi

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PiToolBrokerProtocolTest {
    @Test
    fun `parses valid requests and hashes arguments deterministically`() {
        val payload = requestPayload()

        val first = parsePiToolBrokerRequest(payload, NONCE, nowMillis = 1_000)
        val second = parsePiToolBrokerRequest(payload, NONCE, nowMillis = 1_000)

        assertEquals("tr-1", first.requestId)
        assertEquals("read", first.tool)
        assertEquals("readFile", first.operation)
        assertEquals(2_000, first.deadlineMillis)
        assertEquals(first.argumentsHash, second.argumentsHash)
        assertTrue(first.argumentsHash.matches(Regex("[0-9a-f]{64}")))
        assertNotEquals("README.md", first.argumentsHash)
    }

    @Test
    fun `argument hash ignores object key ordering`() {
        val first = requestPayload(arguments = buildJsonObject {
            put("path", "README.md")
            put("offset", 4)
        })
        val second = requestPayload(arguments = buildJsonObject {
            put("offset", 4)
            put("path", "README.md")
        })

        assertEquals(
            parsePiToolBrokerRequest(first, NONCE, nowMillis = 1_000).argumentsHash,
            parsePiToolBrokerRequest(second, NONCE, nowMillis = 1_000).argumentsHash,
        )
    }

    @Test
    fun `rejects expired requests`() {
        val error = assertFailsWith<IllegalArgumentException> {
            parsePiToolBrokerRequest(requestPayload(deadlineMillis = 1_000), NONCE, nowMillis = 1_000)
        }

        assertTrue(error.message.orEmpty().contains("expired"))
    }

    @Test
    fun `rejects requests from another session`() {
        val error = assertFailsWith<IllegalArgumentException> {
            parsePiToolBrokerRequest(requestPayload(), "different-nonce", nowMillis = 1_000)
        }

        assertTrue(error.message.orEmpty().contains("nonce"))
    }

    @Test
    fun `rejects unsupported tool operations`() {
        val error = assertFailsWith<IllegalArgumentException> {
            parsePiToolBrokerRequest(
                requestPayload(tool = "bash", operation = "readFile"),
                NONCE,
                nowMillis = 1_000,
            )
        }

        assertTrue(error.message.orEmpty().contains("Unsupported"))
    }

    @Test
    fun `rejects oversized requests`() {
        val error = assertFailsWith<IllegalArgumentException> {
            parsePiToolBrokerRequest(
                requestPayload(arguments = buildJsonObject {
                    put("path", "x".repeat(MAX_PI_TOOL_BROKER_REQUEST_BYTES))
                }),
                NONCE,
                nowMillis = 1_000,
            )
        }

        assertTrue(error.message.orEmpty().contains("limit"))
    }

    private fun requestPayload(
        tool: String = "read",
        operation: String = "readFile",
        deadlineMillis: Long = 2_000,
        arguments: kotlinx.serialization.json.JsonObject = buildJsonObject { put("path", "README.md") },
    ) = buildJsonObject {
        put("type", "tool_request")
        put("requestId", "tr-1")
        put("sessionNonce", NONCE)
        put("tool", tool)
        put("operation", operation)
        put("arguments", arguments)
        put("deadlineMillis", deadlineMillis)
    }

    private companion object {
        const val NONCE = "0123456789abcdef"
    }
}
