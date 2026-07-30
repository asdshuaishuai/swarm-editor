package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.File
import java.security.MessageDigest
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class SwarmVerificationResult(
    val passed: Boolean,
    val output: String,
    val durationMillis: Long,
    val timedOut: Boolean,
)

interface SwarmEvaluationVerifier {
    fun environmentFingerprint(revision: String, command: List<String>): String
    suspend fun verify(workspace: File, command: List<String>): SwarmVerificationResult
}

class RootlessContainerSwarmVerifier(
    private val runtimeExecutable: String,
    private val image: String,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val timeout: Duration = 15.minutes,
    private val memoryLimit: String = "4g",
    private val cpuLimit: String = "2",
) : SwarmEvaluationVerifier {
    private val runtimeMutex = Mutex()
    private var rootlessVerified = false

    init {
        require(runtimeExecutable.isNotBlank()) { "Container runtime cannot be blank" }
        require(runtimeExecutable.substringAfterLast(File.separatorChar) == "podman") {
            "Counterfactual verification requires rootless Podman"
        }
        require(image.matches(imagePattern)) { "Invalid evaluation container image" }
        require(timeout.isPositive()) { "Evaluation timeout must be positive" }
        require(memoryLimit.matches(resourcePattern)) { "Invalid memory limit" }
        require(cpuLimit.matches(cpuPattern)) { "Invalid CPU limit" }
    }

    override fun environmentFingerprint(revision: String, command: List<String>): String = sha256(
        listOf(
            SECURITY_PROFILE_VERSION,
            runtimeExecutable.substringAfterLast(File.separatorChar),
            image,
            revision,
            command.joinToString("\u0000"),
            timeout.inWholeSeconds.toString(),
            memoryLimit,
            cpuLimit,
        ).joinToString("\n")
    )

    override suspend fun verify(workspace: File, command: List<String>): SwarmVerificationResult {
        require(workspace.isDirectory) { "Evaluation workspace does not exist" }
        require(command.isNotEmpty() && command.none(String::isBlank)) { "Verifier command cannot be empty" }
        ensureRootless(workspace)
        val containerCommand = buildList {
            add(runtimeExecutable)
            addAll(listOf("run", "--rm", "--pull=never", "--network=none", "--read-only"))
            addAll(listOf("--cap-drop=ALL", "--security-opt=no-new-privileges", "--ipc=private"))
            addAll(listOf("--pids-limit=512", "--memory=$memoryLimit", "--cpus=$cpuLimit"))
            addAll(listOf("--tmpfs", "/tmp:rw,nosuid,nodev,size=512m"))
            add("--userns=keep-id")
            addAll(listOf("--volume", "${workspace.absolutePath}:/workspace:rw,Z"))
            addAll(listOf("--workdir", "/workspace", "--env", "HOME=/tmp"))
            add(image)
            addAll(command)
        }
        val result = commandRunner.run(
            CommandRequest(
                command = containerCommand,
                workingDirectory = workspace,
                timeout = timeout,
                maxOutputChars = 512 * 1024,
            )
        )
        check(result.exitCode !in CONTAINER_INFRASTRUCTURE_EXIT_CODES) {
            "Evaluation container infrastructure failed with exit ${result.exitCode}: ${result.output}"
        }
        return SwarmVerificationResult(
            passed = result.exitCode == 0,
            output = result.output,
            durationMillis = result.durationMillis,
            timedOut = result.timedOut,
        )
    }

    private suspend fun ensureRootless(workingDirectory: File) = runtimeMutex.withLock {
        if (rootlessVerified) return@withLock
        val result = commandRunner.run(
            CommandRequest(
                command = listOf(runtimeExecutable, "info", "--format", "{{.Host.Security.Rootless}}"),
                workingDirectory = workingDirectory,
                timeout = 20.seconds,
                maxOutputChars = 4 * 1024,
            )
        )
        check(result.exitCode == 0 && result.output.trim().equals("true", ignoreCase = true)) {
            "Counterfactual verification requires a functioning rootless Podman runtime: ${result.output}"
        }
        rootlessVerified = true
    }
}

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private val imagePattern = Regex("[a-zA-Z0-9][a-zA-Z0-9._/:@-]{1,255}")
private val resourcePattern = Regex("[1-9][0-9]*[kKmMgG]?")
private val cpuPattern = Regex("[0-9]+(?:\\.[0-9]+)?")
private val CONTAINER_INFRASTRUCTURE_EXIT_CODES = 125..127
private const val SECURITY_PROFILE_VERSION = "rootless-container-v1"
