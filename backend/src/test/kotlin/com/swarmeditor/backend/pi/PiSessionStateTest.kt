package com.swarmeditor.backend.pi

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import com.swarmeditor.common.model.ImageData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PiSessionStateTest {
    @Test
    fun `parses rpc session state and model metadata`() {
        val data = Json.parseToJsonElement(
            """
            {
              "model": {
                "provider": "anthropic",
                "id": "claude-sonnet-4",
                "name": "Claude Sonnet 4",
                "contextWindow": 200000,
                "maxTokens": 8192
              },
              "thinkingLevel": "high",
              "isStreaming": true,
              "isCompacting": false,
              "sessionId": "remote-1",
              "sessionName": "Refactor",
              "autoCompactionEnabled": true,
              "messageCount": 12,
              "pendingMessageCount": 1
            }
            """.trimIndent()
        ).jsonObject

        val state = parsePiSessionState(data, 42)

        assertEquals(42, state.pid)
        assertEquals("remote-1", state.sessionId)
        assertEquals("anthropic", state.provider)
        assertEquals("claude-sonnet-4", state.modelId)
        assertEquals(200000, state.contextWindow)
        assertEquals(8192, state.maxTokens)
        assertEquals("high", state.thinkingLevel)
        assertTrue(state.isStreaming)
        assertFalse(state.isCompacting)
        assertEquals(12, state.messageCount)
        assertEquals(1, state.pendingMessageCount)
    }

    @Test
    fun `accepts state without an active model`() {
        val data = Json.parseToJsonElement(
            """{
              "thinkingLevel":"off",
              "isStreaming":false,
              "isCompacting":false,
              "sessionId":"remote-2",
              "autoCompactionEnabled":false,
              "messageCount":0,
              "pendingMessageCount":0
            }"""
        ).jsonObject

        val state = parsePiSessionState(data, null)

        assertEquals(null, state.provider)
        assertEquals(null, state.modelId)
        assertTrue(state.isAlive)
    }

    @Test
    fun `parses session statistics and context usage`() {
        val data = Json.parseToJsonElement(
            """{
              "sessionId":"remote-3",
              "userMessages":4,
              "assistantMessages":3,
              "toolCalls":2,
              "toolResults":2,
              "totalMessages":11,
              "tokens":{"input":1000,"output":200,"cacheRead":300,"cacheWrite":50,"total":1550},
              "cost":0.1234,
              "contextUsage":{"tokens":1200,"contextWindow":200000,"percent":0.6}
            }"""
        ).jsonObject

        val stats = parsePiSessionStats(data)

        assertEquals(11, stats.totalMessages)
        assertEquals(1550, stats.tokens.total)
        assertEquals(0.1234, stats.cost)
        assertEquals(1200, stats.contextUsage?.tokens)
        assertEquals(0.6, stats.contextUsage?.percent)
    }

    @Test
    fun `parses compaction result`() {
        val data = Json.parseToJsonElement(
            """{
              "summary":"summary",
              "firstKeptEntryId":"entry-4",
              "tokensBefore":42000,
              "estimatedTokensAfter":12000
            }"""
        ).jsonObject

        val result = parsePiCompactionResult(data)

        assertEquals("entry-4", result.firstKeptEntryId)
        assertEquals(42000, result.tokensBefore)
        assertEquals(12000, result.estimatedTokensAfter)
    }

    @Test
    fun `builds rpc image payload`() {
        val payload = buildJsonObject {
            putPiPromptPayload(
                message = "describe",
                images = listOf(ImageData("aGVsbG8=", "image/png", "screen.png"))
            )
        }

        val image = payload["images"]!!.jsonArray.single().jsonObject
        assertEquals("describe", payload["message"]?.jsonPrimitive?.content)
        assertEquals("image", image["type"]?.jsonPrimitive?.content)
        assertEquals("aGVsbG8=", image["data"]?.jsonPrimitive?.content)
        assertEquals("image/png", image["mimeType"]?.jsonPrimitive?.content)
    }
}
