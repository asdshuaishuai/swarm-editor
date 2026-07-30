package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.ToolExecution
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class PiCommandParsingTest {
    @Test
    fun `parses skill prompt and extension commands returned by pi`() {
        val response = Json.parseToJsonElement(
            """
            {
              "success": true,
              "data": {
                "commands": [
                  {"name":"skill:review","description":"Review changes","source":"skill"},
                  {"name":"release","description":"Prepare release","source":"prompt"},
                  {"name":"mcp-status","source":"extension"}
                ]
              }
            }
            """.trimIndent()
        ).jsonObject

        assertEquals(
            listOf(
                PiCommandInfo("skill:review", "Review changes", "skill"),
                PiCommandInfo("release", "Prepare release", "prompt"),
                PiCommandInfo("mcp-status", "", "extension"),
            ),
            parsePiCommands(response),
        )
    }

    @Test
    fun `parses and sorts available pi models`() {
        val response = Json.parseToJsonElement(
            """
            {
              "success": true,
              "data": {
                "models": [
                  {
                    "provider":"openai",
                    "id":"gpt-5.6",
                    "name":"GPT-5.6",
                    "api":"openai-responses",
                    "reasoning":true,
                    "input":["text","image"],
                    "contextWindow":400000,
                    "maxTokens":128000
                  },
                  {
                    "provider":"anthropic",
                    "id":"claude-sonnet",
                    "name":"Claude Sonnet",
                    "api":"anthropic-messages",
                    "reasoning":false,
                    "input":["text"],
                    "contextWindow":200000,
                    "maxTokens":16000
                  }
                ]
              }
            }
            """.trimIndent()
        ).jsonObject

        assertEquals(
            listOf(
                PiModelInfo("anthropic", "claude-sonnet", "Claude Sonnet", "anthropic-messages", false, 200000, 16000, listOf("text")),
                PiModelInfo("openai", "gpt-5.6", "GPT-5.6", "openai-responses", true, 400000, 128000, listOf("text", "image")),
            ),
            parsePiAvailableModels(response),
        )
    }

    @Test
    fun `parses pi conversation history and nested branch tree`() {
        val messages = Json.parseToJsonElement(
            """
            {"data":{"messages":[
              {"role":"user","content":"Review this module","timestamp":1000},
              {"role":"assistant","content":[
                {"type":"thinking","thinking":"..."},
                {"type":"text","text":"I found two issues."},
                {"type":"toolCall","id":"tool-1","name":"read","arguments":{"path":"README.md"}}
              ],"timestamp":2000},
              {"role":"toolResult","toolCallId":"tool-1","toolName":"read","content":[{"type":"text","text":"README contents"}],"isError":false,"timestamp":3000}
            ]}}
            """.trimIndent()
        ).jsonObject
        val tree = Json.parseToJsonElement(
            """
            {"data":{"leafId":"assistant-1","tree":[{
              "entry":{"id":"user-1","parentId":null,"type":"message","timestamp":"2026-07-24","message":{"role":"user","content":"Review this module"}},
              "children":[{
                "entry":{"id":"assistant-1","parentId":"user-1","type":"message","message":{"role":"assistant","content":[{"type":"text","text":"I found two issues."}]}},
                "children":[]
              }]
            }]}}
            """.trimIndent()
        ).jsonObject

        assertEquals(
            listOf(
                PiConversationMessage("user", "Review this module", 1000),
                PiConversationMessage(
                    "assistant",
                    "I found two issues.",
                    2000,
                    listOf(
                        ToolExecution(
                            id = "tool-1",
                            name = "read",
                            arguments = "{\"path\":\"README.md\"}",
                            output = "README contents",
                        )
                    ),
                ),
            ),
            parsePiConversationMessages(messages),
        )
        val parsed = parsePiSessionTree(tree)
        assertEquals("assistant-1", parsed.leafId)
        assertEquals("Review this module", parsed.roots.single().text)
        assertEquals("I found two issues.", parsed.roots.single().children.single().text)
    }

    @Test
    fun `extracts textual output from pi tool results`() {
        val result = Json.parseToJsonElement(
            """
            {
              "content": [
                {"type":"text","text":"README contents"},
                {"type":"image","data":"ignored","mimeType":"image/png"}
              ],
              "details": {"path":"README.md"}
            }
            """.trimIndent()
        )

        assertEquals("README contents", extractPiToolOutput(result))
    }
}
