package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmSandboxPreflightReport
import com.swarmeditor.common.model.SwarmSandboxProtection
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmVerificationEvidence
import com.swarmeditor.common.model.SwarmVerificationStatus
import java.io.File
import java.security.MessageDigest
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.CancellationException

data class SwarmTaskVerificationRequest(
    val runId: String,
    val task: SwarmTask,
    val workspace: SwarmTaskWorkspace,
    val workspaceDeltaEvidenceId: String,
    val beforeTree: String,
    val afterTree: String,
    val toolAuditIds: List<String> = emptyList(),
)

data class StoredSwarmVerification(
    val status: SwarmVerificationStatus,
    val evidenceId: String,
    val output: String,
    val exitCode: Int?,
    val timedOut: Boolean,
)

fun interface SwarmTaskVerifier {
    suspend fun verify(request: SwarmTaskVerificationRequest): StoredSwarmVerification
}

class EvidenceBackedSwarmTaskVerifier(
    private val evidenceStore: SwarmEvidenceStore,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val mode: SwarmTaskVerifierMode = SwarmTaskVerifierMode.fromEnvironment(),
    private val providerOverride: SwarmVerificationProvider? = null,
    private val commandTimeout: Duration = DEFAULT_COMMAND_TIMEOUT,
    private val maxOutputChars: Int = DEFAULT_MAX_OUTPUT_CHARS,
    private val now: () -> Instant = { Clock.System.now() },
) : SwarmTaskVerifier {
    init {
        require(commandTimeout.isPositive()) { "commandTimeout must be positive" }
        require(maxOutputChars > 0) { "maxOutputChars must be positive" }
    }

    override suspend fun verify(request: SwarmTaskVerificationRequest): StoredSwarmVerification {
        require(request.task.verificationCommands.isNotEmpty()) { "Verification commands cannot be empty" }
        require(request.workspace.directory.isDirectory) { "Task verification workspace does not exist" }
        val provider = providerOverride ?: providerFor(mode)
        val preflight = provider.preflight(commandRunner, request.workspace.directory, now())
        val preflightEvidenceId = evidenceStore.putSandboxPreflight(preflight)
        val startedAt = System.nanoTime()
        val output = StringBuilder()
        var lastResult: CommandResult? = null
        var outputTruncated = false
        if (preflight.passed) {
            for ((index, command) in request.task.verificationCommands.withIndex()) {
                appendOutput(output, "[verification ${index + 1}/${request.task.verificationCommands.size}] ${command.joinToString(" ")}")
                val result = try {
                    commandRunner.run(
                        CommandRequest(
                            command = provider.wrap(command, request.workspace.directory),
                            workingDirectory = request.workspace.directory,
                            timeout = commandTimeout,
                            maxOutputChars = maxOutputChars,
                        )
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    CommandResult(
                        exitCode = VERIFIER_LAUNCH_FAILURE_EXIT_CODE,
                        output = error.message ?: error::class.simpleName.orEmpty(),
                        durationMillis = 0,
                    )
                }
                lastResult = result
                outputTruncated = outputTruncated || result.output.length >= maxOutputChars
                appendOutput(output, result.output)
                if (result.exitCode != 0 || result.timedOut) break
            }
        } else {
            appendOutput(output, preflight.failureReasons.joinToString("\n"))
        }
        val commandResult = lastResult
        val status = if (preflight.passed && commandResult != null && commandResult.exitCode == 0 && !commandResult.timedOut) {
            SwarmVerificationStatus.PASSED
        } else {
            SwarmVerificationStatus.FAILED
        }
        val capturedOutput = output.toString()
        val evidence = SwarmVerificationEvidence(
            runId = request.runId,
            taskId = request.task.id,
            attempt = request.task.attempt,
            workspaceDeltaEvidenceId = request.workspaceDeltaEvidenceId,
            sandboxPreflightEvidenceId = preflightEvidenceId,
            status = status,
            policyId = provider.policyId,
            policyVersion = VERIFICATION_POLICY_VERSION,
            commandSha256 = sha256(canonicalCommands(request.task.verificationCommands)),
            beforeTree = request.beforeTree,
            afterTree = request.afterTree,
            toolAuditIds = request.toolAuditIds,
            exitCode = lastResult?.exitCode,
            timedOut = lastResult?.timedOut == true,
            durationMillis = (System.nanoTime() - startedAt) / 1_000_000,
            stdoutSha256 = capturedOutput.takeIf(String::isNotEmpty)?.let(::sha256),
            stdoutBytes = capturedOutput.toByteArray(Charsets.UTF_8).size.toLong(),
            stdoutTruncated = outputTruncated,
            environmentFingerprint = environmentFingerprint(),
            verifierVersion = VERIFIER_VERSION,
            createdAt = now(),
        )
        val evidenceId = evidenceStore.putVerification(evidence)
        return StoredSwarmVerification(
            status = status,
            evidenceId = evidenceId,
            output = capturedOutput,
            exitCode = lastResult?.exitCode,
            timedOut = lastResult?.timedOut == true,
        )
    }
}

enum class SwarmTaskVerifierMode {
    NATIVE,
    BUBBLEWRAP;

    companion object {
        fun fromEnvironment(value: String? = System.getenv(VERIFIER_MODE_ENV)): SwarmTaskVerifierMode = when (
            value?.trim()?.lowercase()
        ) {
            null, "", "native" -> NATIVE
            "bubblewrap", "bwrap" -> BUBBLEWRAP
            else -> throw IllegalArgumentException("Unsupported $VERIFIER_MODE_ENV mode: $value")
        }
    }
}

interface SwarmVerificationProvider {
    val policyId: String

    suspend fun preflight(
        commandRunner: CommandRunner,
        workspace: File,
        createdAt: Instant,
    ): SwarmSandboxPreflightReport

    fun wrap(command: List<String>, workspace: File): List<String>
}

private class NativeVerificationProvider : SwarmVerificationProvider {
    override val policyId = "native-isolated-process"

    override suspend fun preflight(
        commandRunner: CommandRunner,
        workspace: File,
        createdAt: Instant,
    ): SwarmSandboxPreflightReport {
        val javaBinary = File(System.getProperty("java.home"), "bin/${javaExecutableName()}")
        val failures = buildList {
            if (!javaBinary.isFile || !javaBinary.canRead()) {
                add("Java runtime executable is unavailable: ${javaBinary.path}")
            }
            if (!workspace.isDirectory) add("Verification workspace is unavailable: ${workspace.path}")
        }
        return preflightReport(
            provider = policyId,
            providerVersion = System.getProperty("java.runtime.version", "unknown"),
            binary = javaBinary,
            requiredProtections = NATIVE_PROTECTIONS,
            activeProtections = if (failures.isEmpty()) NATIVE_PROTECTIONS else emptySet(),
            failures = failures,
            createdAt = createdAt,
        )
    }

    override fun wrap(command: List<String>, workspace: File): List<String> = command
}

private class BubblewrapVerificationProvider(
    private val binary: File = resolveExecutable("bwrap") ?: File("bwrap"),
) : SwarmVerificationProvider {
    override val policyId = "bubblewrap-isolated-process"

    override suspend fun preflight(
        commandRunner: CommandRunner,
        workspace: File,
        createdAt: Instant,
    ): SwarmSandboxPreflightReport {
        val failures = mutableListOf<String>()
        var version = "unavailable"
        if (!isLinux()) failures += "Bubblewrap verification requires Linux"
        if (!binary.isFile || !binary.canRead() || !binary.canExecute()) {
            failures += "Bubblewrap executable is unavailable"
        }
        if (failures.isEmpty()) {
            val versionResult = try {
                commandRunner.run(
                    CommandRequest(
                        command = listOf(binary.absolutePath, "--version"),
                        workingDirectory = workspace,
                        timeout = PREFLIGHT_TIMEOUT,
                        maxOutputChars = 4 * 1024,
                    )
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                failures += "Bubblewrap version probe could not start: ${oneLine(error.message.orEmpty())}"
                null
            }
            if (versionResult != null && versionResult.exitCode == 0 && !versionResult.timedOut) {
                version = versionResult.output.trim().ifEmpty { "unknown" }
            } else if (versionResult != null) {
                failures += "Bubblewrap version probe failed"
            }
        }
        if (failures.isEmpty()) {
            val smokeResult = try {
                commandRunner.run(
                    CommandRequest(
                        command = wrap(listOf("/bin/true"), workspace),
                        workingDirectory = workspace,
                        timeout = PREFLIGHT_TIMEOUT,
                        maxOutputChars = 4 * 1024,
                    )
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                failures += "Bubblewrap namespace preflight could not start: ${oneLine(error.message.orEmpty())}"
                null
            }
            if (smokeResult != null && (smokeResult.exitCode != 0 || smokeResult.timedOut)) {
                failures += "Bubblewrap namespace preflight failed: ${oneLine(smokeResult.output).take(512)}"
            }
        }
        return preflightReport(
            provider = policyId,
            providerVersion = version,
            binary = binary,
            requiredProtections = BUBBLEWRAP_PROTECTIONS,
            activeProtections = if (failures.isEmpty()) BUBBLEWRAP_PROTECTIONS else emptySet(),
            failures = failures,
            createdAt = createdAt,
        )
    }

    override fun wrap(command: List<String>, workspace: File): List<String> {
        val path = workspace.absoluteFile.normalize().path
        return listOf(
            binary.absolutePath,
            "--die-with-parent",
            "--new-session",
            "--unshare-user",
            "--unshare-pid",
            "--unshare-net",
            "--unshare-ipc",
            "--unshare-uts",
            "--ro-bind", "/", "/",
            "--bind", path, path,
            "--chdir", path,
            "--proc", "/proc",
            "--dev", "/dev",
            "--tmpfs", "/tmp",
            "--",
        ) + command
    }
}

private fun providerFor(mode: SwarmTaskVerifierMode): SwarmVerificationProvider = when (mode) {
    SwarmTaskVerifierMode.NATIVE -> NativeVerificationProvider()
    SwarmTaskVerifierMode.BUBBLEWRAP -> BubblewrapVerificationProvider()
}

private fun preflightReport(
    provider: String,
    providerVersion: String,
    binary: File,
    requiredProtections: Set<SwarmSandboxProtection>,
    activeProtections: Set<SwarmSandboxProtection>,
    failures: List<String>,
    createdAt: Instant,
): SwarmSandboxPreflightReport {
    val passed = failures.isEmpty()
    return SwarmSandboxPreflightReport(
        provider = provider,
        providerVersion = providerVersion,
        binarySha256 = if (binary.isFile) sha256(binary.readBytes()) else sha256(binary.path),
        osName = System.getProperty("os.name", "unknown"),
        osVersion = System.getProperty("os.version", "unknown"),
        architecture = System.getProperty("os.arch", "unknown"),
        kernelVersion = System.getProperty("os.version"),
        requiredProtections = requiredProtections,
        activeProtections = activeProtections,
        unsupportedProtections = if (passed) emptySet() else requiredProtections - activeProtections,
        policyVersion = VERIFICATION_POLICY_VERSION,
        policySha256 = sha256("$provider|$VERIFICATION_POLICY_VERSION|${requiredProtections.sortedBy(Enum<*>::name)}"),
        passed = passed,
        failureReasons = failures,
        createdAt = createdAt,
    )
}

private fun canonicalCommands(commands: List<List<String>>): String = commands.joinToString("\u0000\u0000") { command ->
    command.joinToString("\u0000")
}

private fun appendOutput(output: StringBuilder, value: String) {
    if (value.isEmpty()) return
    if (output.isNotEmpty()) output.append('\n')
    output.append(value)
}

private fun oneLine(value: String): String = value
    .replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
    .trim()
    .ifEmpty { "unknown error" }

private fun environmentFingerprint(): String = sha256(
    listOf(
        System.getProperty("os.name", "unknown"),
        System.getProperty("os.version", "unknown"),
        System.getProperty("os.arch", "unknown"),
        System.getProperty("java.runtime.version", "unknown"),
    ).joinToString("|")
)

private fun resolveExecutable(name: String): File? = System.getenv("PATH")
    ?.split(File.pathSeparatorChar)
    ?.asSequence()
    ?.map { File(it, name) }
    ?.firstOrNull { it.isFile && it.canExecute() }

private fun javaExecutableName(): String = if (System.getProperty("os.name", "").startsWith("Windows", true)) {
    "java.exe"
} else {
    "java"
}

private fun isLinux(): Boolean = System.getProperty("os.name", "").contains("Linux", ignoreCase = true)

private fun sha256(value: String): String = sha256(value.toByteArray(Charsets.UTF_8))

private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }

private val NATIVE_PROTECTIONS = setOf(
    SwarmSandboxProtection.PROCESS,
    SwarmSandboxProtection.COPY_ON_WRITE,
)
private val BUBBLEWRAP_PROTECTIONS = NATIVE_PROTECTIONS + setOf(
    SwarmSandboxProtection.FILESYSTEM,
    SwarmSandboxProtection.NETWORK,
    SwarmSandboxProtection.IPC,
)
private val DEFAULT_COMMAND_TIMEOUT = 10.minutes
private val PREFLIGHT_TIMEOUT = 15.seconds
private const val DEFAULT_MAX_OUTPUT_CHARS = 128 * 1024
private const val VERIFIER_LAUNCH_FAILURE_EXIT_CODE = -2
private const val VERIFIER_MODE_ENV = "SWARM_TASK_VERIFIER"
private const val VERIFICATION_POLICY_VERSION = "swarm-task-verification-v1"
private const val VERIFIER_VERSION = "swarm-editor-verifier-1"
