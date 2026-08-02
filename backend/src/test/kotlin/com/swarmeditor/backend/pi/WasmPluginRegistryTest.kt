package com.swarmeditor.backend.pi

import java.nio.file.Files
import java.security.MessageDigest
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeBytes
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@OptIn(ExperimentalPathApi::class)
class WasmPluginRegistryTest {
    @Test
    fun `registry loads enabled hash pinned plugins and reports invalid manifests`() = runTest {
        val root = Files.createTempDirectory("wasm-plugin-registry")
        try {
            root.resolve("formatter").createDirectories()
            val module = byteArrayOf(0, 97, 115, 109)
            root.resolve("formatter/module.wasm").writeBytes(module)
            root.resolve("formatter/plugin.json").writeText(manifest("formatter", sha256(module)))
            root.resolve("escape").createDirectories()
            root.resolve("escape/plugin.json").writeText(manifest("escape", "b".repeat(64), module = "../escape.wasm"))

            val catalog = WasmPluginRegistry(root.toFile()).scan()

            assertEquals(listOf("formatter"), catalog.plugins.map(WasmPluginDefinition::id))
            assertEquals("module.wasm", catalog.plugins.single().module.file.name)
            assertEquals(1, catalog.errors.size)
            assertContains(catalog.errors.single(), "Module must be a direct .wasm file")
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `capability lists catalog status and executes selected plugin`() = runTest {
        val root = Files.createTempDirectory("wasm-plugin-capability")
        try {
            root.resolve("formatter").createDirectories()
            val module = byteArrayOf(0, 97, 115, 109)
            root.resolve("formatter/module.wasm").writeBytes(module)
            root.resolve("formatter/plugin.json").writeText(manifest("formatter", sha256(module)))
            var receivedInput: JsonElement? = null
            val executor = WasmPluginCapabilityExecutor(
                registry = WasmPluginRegistry(root.toFile()),
                sandboxProvider = {
                    WasmSandbox { module, input ->
                        assertEquals("formatter", module.id)
                        receivedInput = input
                        WasmExecutionResult(buildJsonObject { put("formatted", true) }, 12)
                    }
                },
            )

            val listed = executor.execute(request("list", buildJsonObject {})).result.jsonObject
            val executed = executor.execute(
                request(
                    "execute",
                    buildJsonObject {
                        put("plugin", "formatter")
                        put("input", buildJsonObject { put("source", "x") })
                    },
                ),
            ).result.jsonObject

            assertTrue(listed["runtimeAvailable"]!!.jsonPrimitive.content.toBoolean())
            assertEquals("formatter", listed["plugins"]!!.jsonArray.single().jsonObject["id"]!!.jsonPrimitive.content)
            assertEquals("x", receivedInput!!.jsonObject["source"]!!.jsonPrimitive.content)
            assertEquals("formatter", executed["plugin"]!!.jsonPrimitive.content)
            assertTrue(executed["output"]!!.jsonObject["formatted"]!!.jsonPrimitive.content.toBoolean())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `capability reports unavailable runtime without exposing disabled plugins`() = runTest {
        val root = Files.createTempDirectory("wasm-plugin-disabled")
        try {
            root.resolve("disabled").createDirectories()
            val module = byteArrayOf(0, 97, 115, 109)
            root.resolve("disabled/module.wasm").writeBytes(module)
            root.resolve("disabled/plugin.json").writeText(manifest("disabled", sha256(module), enabled = false))
            val executor = WasmPluginCapabilityExecutor(
                registry = WasmPluginRegistry(root.toFile()),
                sandboxProvider = { null },
            )

            val listed = executor.execute(request("list", buildJsonObject {})).result.jsonObject

            assertFalse(listed["runtimeAvailable"]!!.jsonPrimitive.content.toBoolean())
            assertTrue(listed["plugins"]!!.jsonArray.isEmpty())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `wasm only broker preserves local core tools and audits requests`() = runTest {
        val workspace = Files.createTempDirectory("wasm-only-broker")
        val records = mutableListOf<PiToolAuditRecord>()
        try {
            val factory = WasmPiToolBrokerFactory(
                executor = PiToolCapabilityExecutor {
                    PiToolCapabilityResult(buildJsonObject { put("ok", true) })
                },
                auditStore = PiToolAuditStore(records::add),
            )
            val broker = factory.create(
                com.swarmeditor.common.model.AgentConfig(id = "main", name = "Main"),
                workspace.toFile(),
            )

            val result = broker.execute(request("list", buildJsonObject {}))

            assertFalse(broker.brokersCoreTools)
            assertNotNull(result.auditId)
            assertEquals(listOf("wasm"), records.map(PiToolAuditRecord::tool))
        } finally {
            workspace.deleteRecursively()
        }
    }

    private fun request(operation: String, arguments: kotlinx.serialization.json.JsonObject) = PiToolBrokerRequest(
        requestId = "tr-1",
        sessionNonce = "0123456789abcdef",
        tool = "wasm",
        operation = operation,
        arguments = arguments,
        argumentsHash = "a".repeat(64),
        deadlineMillis = System.currentTimeMillis() + 5_000,
    )

    private fun manifest(
        id: String,
        sha256: String,
        module: String = "module.wasm",
        enabled: Boolean = true,
    ): String = """
        {
          "id": "$id",
          "name": "${id.replaceFirstChar(Char::uppercase)}",
          "description": "Test plugin",
          "module": "$module",
          "sha256": "$sha256",
          "enabled": $enabled
        }
    """.trimIndent()

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }
}
