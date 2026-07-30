package com.swarmeditor.backend.pi

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.File
import java.security.MessageDigest
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

data class WasmModule(
    val id: String,
    val file: File,
    val sha256: String,
    val timeout: Duration = 5.seconds,
    val maxInputBytes: Int = 1024 * 1024,
    val maxOutputChars: Int = 4 * 1024 * 1024,
)

data class WasmExecutionResult(
    val output: JsonElement,
    val durationMillis: Long,
)

fun interface WasmSandbox {
    suspend fun execute(module: WasmModule, input: JsonElement): WasmExecutionResult
}

class WasmtimeCliSandbox(
    private val executable: File,
    private val expectedVersion: String = WASMTIME_VERSION,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val json: Json = Json,
) : WasmSandbox {
    private val verificationMutex = Mutex()
    private var runtimeVerified = false

    init {
        require(executable.nameWithoutExtension == "wasmtime") { "WASM sandbox executable must be Wasmtime" }
        require(executable.isFile && executable.canExecute()) { "Wasmtime executable is unavailable: $executable" }
        require(expectedVersion.matches(versionPattern)) { "Invalid Wasmtime version: $expectedVersion" }
    }

    override suspend fun execute(module: WasmModule, input: JsonElement): WasmExecutionResult {
        validateModule(module)
        verifyRuntime()
        val encodedInput = json.encodeToString(input)
        require(encodedInput.encodeToByteArray().size <= module.maxInputBytes) {
            "WASM module input exceeds ${module.maxInputBytes}B limit"
        }
        val result = commandRunner.run(
            CommandRequest(
                command = listOf(executable.canonicalPath, "run", module.file.canonicalPath),
                workingDirectory = module.file.canonicalFile.parentFile,
                stdin = encodedInput,
                timeout = module.timeout,
                maxOutputChars = module.maxOutputChars,
                environment = emptyMap(),
                inheritEnvironment = false,
            )
        )
        check(!result.timedOut) { "WASM module timed out: ${module.id}" }
        check(result.exitCode == 0) { "WASM module failed with exit code ${result.exitCode}: ${module.id}" }
        val output = runCatching { json.parseToJsonElement(result.output) }
            .getOrElse { error -> throw IllegalStateException("WASM module returned invalid JSON: ${module.id}", error) }
        return WasmExecutionResult(output, result.durationMillis)
    }

    private suspend fun verifyRuntime() = verificationMutex.withLock {
        if (runtimeVerified) return@withLock
        val result = commandRunner.run(
            CommandRequest(
                command = listOf(executable.canonicalPath, "--version"),
                workingDirectory = executable.canonicalFile.parentFile,
                timeout = 10.seconds,
                maxOutputChars = 4 * 1024,
                environment = emptyMap(),
                inheritEnvironment = false,
            )
        )
        check(result.exitCode == 0 && !result.timedOut) { "Wasmtime runtime preflight failed" }
        check(result.output.trim().startsWith("wasmtime $expectedVersion")) {
            "Wasmtime version mismatch: expected $expectedVersion, received ${result.output.trim()}"
        }
        runtimeVerified = true
    }

    private suspend fun validateModule(module: WasmModule) {
        require(module.id.matches(moduleIdPattern)) { "Invalid WASM module id: ${module.id}" }
        require(module.file.extension == "wasm" && module.file.isFile) { "WASM module is unavailable: ${module.file}" }
        require(module.sha256.matches(hashPattern)) { "Invalid WASM module SHA-256" }
        require(module.timeout.isPositive() && module.timeout <= 30.seconds) { "Invalid WASM module timeout" }
        require(module.maxInputBytes in 1..MAX_WASM_INPUT_BYTES) { "Invalid WASM module input limit" }
        require(module.maxOutputChars in 1..MAX_WASM_OUTPUT_CHARS) { "Invalid WASM module output limit" }
        val actualHash = withContext(Dispatchers.IO) { sha256(module.file) }
        check(actualHash == module.sha256) { "WASM module integrity check failed: ${module.id}" }
    }
}

private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

const val WASMTIME_VERSION = "47.0.2"
private const val MAX_WASM_INPUT_BYTES = 4 * 1024 * 1024
private const val MAX_WASM_OUTPUT_CHARS = 4 * 1024 * 1024
private val versionPattern = Regex("[1-9][0-9]{0,2}\\.[0-9]+\\.[0-9]+")
private val moduleIdPattern = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}")
private val hashPattern = Regex("[0-9a-f]{64}")
