package com.swarmeditor.backend.pi

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import java.nio.file.Files
import java.security.MessageDigest
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WasmSandboxTest {
    @Test
    fun `Wasmtime executes hash pinned modules without host capabilities`() = runTest {
        val directory = Files.createTempDirectory("wasmtime-sandbox")
        val executable = directory.resolve("wasmtime").toFile().apply { writeText(""); setExecutable(true) }
        val module = directory.resolve("formatter.wasm").toFile().apply { writeText("module") }
        try {
            val requests = mutableListOf<CommandRequest>()
            val runner = CommandRunner { request ->
                requests += request
                if (request.command.last() == "--version") {
                    CommandResult(0, "wasmtime 47.0.2 (release)", 1)
                } else {
                    CommandResult(0, "{\"formatted\":\"ok\"}", 7)
                }
            }
            val sandbox = WasmtimeCliSandbox(executable, commandRunner = runner)

            val result = sandbox.execute(
                WasmModule("formatter", module, sha256(module.readBytes())),
                buildJsonObject { put("source", "input") },
            )

            assertEquals("ok", result.output.jsonObject.getValue("formatted").jsonPrimitive.content)
            assertEquals(7, result.durationMillis)
            assertEquals(2, requests.size)
            val execution = requests.last()
            assertEquals(listOf(executable.canonicalPath, "run", module.canonicalPath), execution.command)
            assertEquals("{\"source\":\"input\"}", execution.stdin)
            assertTrue(execution.environment.isEmpty())
            assertFalse(execution.inheritEnvironment)
            assertFalse(execution.command.contains("--dir"))
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    @Test
    fun `module hash mismatch prevents Wasmtime execution`() = runTest {
        val directory = Files.createTempDirectory("wasmtime-hash")
        val executable = directory.resolve("wasmtime").toFile().apply { writeText(""); setExecutable(true) }
        val module = directory.resolve("parser.wasm").toFile().apply { writeText("module") }
        try {
            var requests = 0
            val sandbox = WasmtimeCliSandbox(
                executable,
                commandRunner = CommandRunner {
                    requests += 1
                    CommandResult(0, "wasmtime 47.0.2", 1)
                },
            )

            val failure = assertFailsWith<IllegalStateException> {
                sandbox.execute(WasmModule("parser", module, "0".repeat(64)), buildJsonObject {})
            }

            assertTrue(failure.message.orEmpty().contains("integrity"))
            assertEquals(0, requests)
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }
}
