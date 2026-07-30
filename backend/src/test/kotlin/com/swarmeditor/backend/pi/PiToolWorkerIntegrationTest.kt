package com.swarmeditor.backend.pi

import java.nio.file.Files
import java.util.Base64
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PiToolWorkerIntegrationTest {
    @Test
    fun `worker performs bounded workspace file and bash operations`() = runBlocking {
        val root = Files.createTempDirectory("pi-tool-worker")
        Files.writeString(root.resolve("input.txt"), "hello")
        val worker = localWorker(root.toFile())
        try {
            val read = worker.execute(request("read", "readFile", arguments("path", "input.txt")))
            assertEquals("hello", String(Base64.getDecoder().decode(read.result.jsonObject["base64"]!!.jsonPrimitive.content)))

            worker.execute(request("write", "mkdir", arguments("path", "generated"), requestId = "tr-2"))
            worker.execute(
                request(
                    "write",
                    "writeFile",
                    buildJsonObject {
                        put("path", "generated/output.txt")
                        put("content", "created")
                    },
                    requestId = "tr-3",
                )
            )
            assertEquals("created", Files.readString(root.resolve("generated/output.txt")))

            val bash = worker.execute(
                request(
                    "bash",
                    "exec",
                    buildJsonObject {
                        put("command", "printf '%s:%s' \"\${HOST_SECRET-unset}\" \"\$HOME\"")
                        put("cwd", ".")
                    },
                    requestId = "tr-4",
                )
            )
            assertEquals("unset:/tmp", bash.result.jsonObject["output"]!!.jsonPrimitive.content)
            assertEquals(0, bash.result.jsonObject["exitCode"]!!.jsonPrimitive.intOrNull)
            assertEquals(0, bash.exitCode)
        } finally {
            worker.close()
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `worker rejects traversal and symbolic links`() = runBlocking {
        val root = Files.createTempDirectory("pi-tool-worker-paths")
        val outside = Files.createTempFile("pi-tool-worker-outside", ".txt")
        Files.writeString(outside, "outside")
        Files.createSymbolicLink(root.resolve("link.txt"), outside)
        val worker = localWorker(root.toFile())
        try {
            val traversal = assertFailsWith<IllegalStateException> {
                worker.execute(request("read", "readFile", arguments("path", "../outside.txt")))
            }
            val symlink = assertFailsWith<IllegalStateException> {
                worker.execute(request("read", "readFile", arguments("path", "link.txt"), requestId = "tr-2"))
            }

            assertTrue(traversal.message.orEmpty().contains("escapes"))
            assertTrue(symlink.message.orEmpty().contains("Symbolic links"))
        } finally {
            worker.close()
            root.toFile().deleteRecursively()
            Files.deleteIfExists(outside)
        }
    }

    @Test
    fun `worker bounds output and remains usable after cancellation`() = runBlocking {
        val root = Files.createTempDirectory("pi-tool-worker-cancel")
        Files.writeString(root.resolve("ready.txt"), "ready")
        val worker = localWorker(root.toFile())
        try {
            val large = worker.execute(
                request(
                    "bash",
                    "exec",
                    buildJsonObject {
                        put("command", "head -c 700000 /dev/zero | tr '\\0' x")
                        put("cwd", ".")
                    },
                )
            )
            assertTrue(large.outputTruncated)
            assertTrue(large.result.jsonObject["output"]!!.jsonPrimitive.content.length <= 512 * 1024)

            val running = async {
                worker.execute(
                    request(
                        "bash",
                        "exec",
                        buildJsonObject {
                            put("command", "sleep 30")
                            put("cwd", ".")
                        },
                        requestId = "tr-2",
                    )
                )
            }
            delay(150)
            running.cancelAndJoin()

            val read = worker.execute(
                request("read", "readFile", arguments("path", "ready.txt"), requestId = "tr-3")
            )
            assertEquals("ready", String(Base64.getDecoder().decode(read.result.jsonObject["base64"]!!.jsonPrimitive.content)))
        } finally {
            worker.close()
            root.toFile().deleteRecursively()
        }
    }

    private fun localWorker(root: java.io.File): PiToolWorker = JsonLinePiToolWorker(
        command = listOf("node", "-e", PI_TOOL_WORKER_SCRIPT),
        workingDirectory = root,
        environment = mapOf(
            "SWARM_TOOL_WORKSPACE" to root.absolutePath,
            "HOST_SECRET" to "must-not-reach-bash",
        ),
    )

    private fun arguments(name: String, value: String): JsonObject = buildJsonObject { put(name, value) }

    private fun request(
        tool: String,
        operation: String,
        arguments: JsonObject,
        requestId: String = "tr-1",
    ) = PiToolBrokerRequest(
        requestId = requestId,
        sessionNonce = "0123456789abcdef",
        tool = tool,
        operation = operation,
        arguments = arguments,
        argumentsHash = "a".repeat(64),
        deadlineMillis = System.currentTimeMillis() + 10_000,
    )
}
