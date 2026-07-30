package com.swarmeditor.backend.process

import java.io.File
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

data class CommandRequest(
    val command: List<String>,
    val workingDirectory: File,
    val stdin: String? = null,
    val timeout: Duration = 60.seconds,
    val maxOutputChars: Int = 256 * 1024,
    val environment: Map<String, String> = emptyMap(),
    val inheritEnvironment: Boolean = true,
)

data class CommandResult(
    val exitCode: Int,
    val output: String,
    val durationMillis: Long,
    val timedOut: Boolean = false,
)

fun interface CommandRunner {
    suspend fun run(request: CommandRequest): CommandResult
}

class LocalCommandRunner : CommandRunner {
    override suspend fun run(request: CommandRequest): CommandResult = coroutineScope {
        require(request.command.isNotEmpty()) { "Command cannot be empty" }
        require(request.command.none(String::isBlank)) { "Command arguments cannot be blank" }
        require(request.workingDirectory.isDirectory) { "Working directory does not exist" }
        require(request.timeout.isPositive()) { "Command timeout must be positive" }
        require(request.maxOutputChars > 0) { "maxOutputChars must be positive" }
        require(request.environment.keys.none(String::isBlank)) { "Environment variable names cannot be blank" }
        val startedAt = System.nanoTime()
        val process = withContext(Dispatchers.IO) {
            val builder = ProcessBuilder(request.command)
                .directory(request.workingDirectory)
                .redirectErrorStream(true)
            if (!request.inheritEnvironment) builder.environment().clear()
            builder.environment().putAll(request.environment)
            builder.start()
        }
        try {
            withContext(Dispatchers.IO) {
                process.outputStream.bufferedWriter().use { writer ->
                    request.stdin?.let(writer::write)
                }
            }
            val output = StringBuilder()
            val outputReader = async {
                readTruncatedUtf8Lines(process.inputStream) { line ->
                    if (output.length < request.maxOutputChars) {
                        val remaining = request.maxOutputChars - output.length
                        if (output.isNotEmpty() && remaining > 0) output.append('\n')
                        if (output.length < request.maxOutputChars) {
                            output.append(line.take(request.maxOutputChars - output.length))
                        }
                    }
                }
            }
            val completed = runInterruptible(Dispatchers.IO) {
                process.waitFor(request.timeout.inWholeMilliseconds, TimeUnit.MILLISECONDS)
            }
            if (!completed) terminate(process)
            outputReader.await()
            CommandResult(
                exitCode = if (completed) process.exitValue() else TIMEOUT_EXIT_CODE,
                output = output.toString(),
                durationMillis = (System.nanoTime() - startedAt) / 1_000_000,
                timedOut = !completed,
            )
        } catch (error: CancellationException) {
            withContext(NonCancellable) { terminate(process) }
            throw error
        } catch (error: Throwable) {
            withContext(NonCancellable) { terminate(process) }
            throw error
        }
    }

    private suspend fun terminate(process: Process) = withContext(Dispatchers.IO) {
        process.toHandle().descendants().forEach { descendant -> descendant.destroyForcibly() }
        process.destroyForcibly()
        process.waitFor()
    }
}

private const val TIMEOUT_EXIT_CODE = -1
