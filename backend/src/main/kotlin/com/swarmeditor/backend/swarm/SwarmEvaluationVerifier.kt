package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import java.io.File
import java.security.MessageDigest
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
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

class BubblewrapSwarmEvaluationVerifier(
    private val executable: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val timeout: Duration = 15.minutes,
    private val environment: Map<String, String> = System.getenv(),
    private val osName: String = System.getProperty("os.name", "unknown"),
) : SwarmEvaluationVerifier {
    private val preflightMutex = Mutex()
    private var preflightFingerprint: String? = null

    init {
        require(osName.contains("Linux", ignoreCase = true)) { "Bubblewrap evaluation requires Linux" }
        require(executable.nameWithoutExtension == "bwrap") { "Evaluation sandbox executable must be Bubblewrap" }
        require(executable.isFile && executable.canRead() && executable.canExecute()) {
            "Bubblewrap executable is unavailable: $executable"
        }
        require(timeout.isPositive()) { "Evaluation timeout must be positive" }
    }

    override fun environmentFingerprint(revision: String, command: List<String>): String = sha256(
        listOf(
            SECURITY_PROFILE_VERSION,
            executable.canonicalPath,
            sha256(executable.readBytes()),
            osName,
            revision,
            command.joinToString("\u0000"),
            timeout.inWholeSeconds.toString(),
            safeEnvironment().entries.sortedBy(Map.Entry<String, String>::key).joinToString("\u0000") { (key, value) ->
                "$key=$value"
            },
        ).joinToString("\n")
    )

    override suspend fun verify(workspace: File, command: List<String>): SwarmVerificationResult {
        require(workspace.isDirectory) { "Evaluation workspace does not exist" }
        require(command.isNotEmpty() && command.none(String::isBlank)) { "Verifier command cannot be empty" }
        ensurePreflight(workspace)
        val result = commandRunner.run(
            CommandRequest(
                command = sandboxCommand(workspace, command),
                workingDirectory = workspace,
                timeout = timeout,
                maxOutputChars = 512 * 1024,
                environment = emptyMap(),
                inheritEnvironment = false,
            )
        )
        return SwarmVerificationResult(
            passed = result.exitCode == 0 && !result.timedOut,
            output = result.output,
            durationMillis = result.durationMillis,
            timedOut = result.timedOut,
        )
    }

    private suspend fun ensurePreflight(workspace: File) = preflightMutex.withLock {
        if (preflightFingerprint != null) return@withLock
        val version = runProbe(
            CommandRequest(
                command = listOf(executable.canonicalPath, "--version"),
                workingDirectory = workspace,
                timeout = PREFLIGHT_TIMEOUT,
                maxOutputChars = 4 * 1024,
                environment = emptyMap(),
                inheritEnvironment = false,
            ),
            "Bubblewrap version probe",
        ).output.trim()
        runProbe(
            CommandRequest(
                command = sandboxCommand(workspace, listOf("/bin/true")),
                workingDirectory = workspace,
                timeout = PREFLIGHT_TIMEOUT,
                maxOutputChars = 4 * 1024,
                environment = emptyMap(),
                inheritEnvironment = false,
            ),
            "Bubblewrap namespace preflight",
        )
        preflightFingerprint = sha256("$version\n${sha256(executable.readBytes())}\n$SECURITY_PROFILE_VERSION")
    }

    private suspend fun runProbe(request: CommandRequest, label: String) = try {
        commandRunner.run(request).also { result ->
            check(result.exitCode == 0 && !result.timedOut) { "$label failed: ${result.output}" }
        }
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        throw IllegalStateException("$label could not establish an isolated evaluation environment", error)
    }

    private fun sandboxCommand(workspace: File, command: List<String>): List<String> {
        val canonicalWorkspace = workspace.canonicalPath
        return buildList {
            add(executable.canonicalPath)
            addAll(listOf("--die-with-parent", "--new-session", "--unshare-all"))
            addAll(listOf("--ro-bind", "/", "/"))
            addAll(listOf("--bind", canonicalWorkspace, canonicalWorkspace))
            addAll(listOf("--chdir", canonicalWorkspace))
            addAll(listOf("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/tmp/home"))
            add("--clearenv")
            safeEnvironment().forEach { (key, value) -> addAll(listOf("--setenv", key, value)) }
            addAll(listOf("--setenv", "HOME", "/tmp/home"))
            add("--")
            addAll(command)
        }
    }

    private fun safeEnvironment(): Map<String, String> = buildMap {
        SAFE_ENVIRONMENT_KEYS.forEach { key ->
            environment[key]?.takeIf(String::isNotBlank)?.let { value -> put(key, value) }
        }
        putIfAbsent("PATH", DEFAULT_PATH)
        putIfAbsent("LANG", "C.UTF-8")
    }
}

private fun sha256(value: String): String = sha256(value.toByteArray(Charsets.UTF_8))

private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }

private val PREFLIGHT_TIMEOUT = 15.seconds
private val SAFE_ENVIRONMENT_KEYS = setOf("PATH", "JAVA_HOME", "LANG", "LC_ALL", "TERM")
private const val DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin"
private const val SECURITY_PROFILE_VERSION = "bubblewrap-evaluation-v1"
