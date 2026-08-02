package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SwarmEvaluationVerifierTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `builds an offline bubblewrap verification command with a scrubbed environment`() = runTest {
        val root = Files.createTempDirectory("swarm-bubblewrap-verifier")
        try {
            val executable = root.resolve("bwrap").toFile().apply {
                writeText("test bubblewrap")
                setExecutable(true)
            }
            val workspace = root.resolve("workspace").toFile().apply { mkdirs() }
            var captured: CommandRequest? = null
            val runner = CommandRunner { request ->
                when {
                    request.command.getOrNull(1) == "--version" ->
                        CommandResult(exitCode = 0, output = "bubblewrap 0.11.0", durationMillis = 2)
                    request.command.lastOrNull() == "/bin/true" ->
                        CommandResult(exitCode = 0, output = "", durationMillis = 3)
                    else -> {
                        captured = request
                        CommandResult(exitCode = 0, output = "tests passed", durationMillis = 40)
                    }
                }
            }
            val verifier = BubblewrapSwarmEvaluationVerifier(
                executable = executable,
                commandRunner = runner,
                environment = mapOf(
                    "PATH" to "/usr/bin:/bin",
                    "JAVA_HOME" to "/opt/jdk",
                    "SECRET_TOKEN" to "must-not-leak",
                ),
                osName = "Linux",
            )

            val result = verifier.verify(workspace, listOf("./gradlew", "test", "--offline"))

            assertTrue(result.passed)
            val request = checkNotNull(captured)
            assertFalse(request.inheritEnvironment)
            assertContains(request.command, "--unshare-all")
            assertContains(request.command, "--ro-bind")
            assertContains(request.command, "--clearenv")
            assertContains(request.command, "--bind")
            assertEquals(listOf("./gradlew", "test", "--offline"), request.command.takeLast(3))
            assertFalse(request.command.any { it.contains("SECRET_TOKEN") || it.contains("must-not-leak") })
            val fingerprint = verifier.environmentFingerprint("abcdef1", listOf("./gradlew", "test"))
            assertEquals(fingerprint, verifier.environmentFingerprint("abcdef1", listOf("./gradlew", "test")))
            assertNotEquals(fingerprint, verifier.environmentFingerprint("abcdef1", listOf("./gradlew", "build")))
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects evaluation when bubblewrap namespace preflight fails`() = runTest {
        val root = Files.createTempDirectory("swarm-bubblewrap-preflight")
        try {
            val executable = root.resolve("bwrap").toFile().apply {
                writeText("test bubblewrap")
                setExecutable(true)
            }
            val workspace = root.resolve("workspace").toFile().apply { mkdirs() }
            val commands = mutableListOf<List<String>>()
            val runner = CommandRunner { request ->
                commands += request.command
                if (request.command.getOrNull(1) == "--version") {
                    CommandResult(exitCode = 0, output = "bubblewrap 0.11.0", durationMillis = 2)
                } else {
                    CommandResult(exitCode = 1, output = "user namespaces disabled", durationMillis = 3)
                }
            }
            val verifier = BubblewrapSwarmEvaluationVerifier(
                executable = executable,
                commandRunner = runner,
                environment = mapOf("PATH" to "/usr/bin:/bin"),
                osName = "Linux",
            )

            assertFailsWith<IllegalStateException> {
                verifier.verify(workspace, listOf("must-not-run"))
            }

            assertEquals(2, commands.size)
            assertFalse(commands.any { it.lastOrNull() == "must-not-run" })
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `reports verifier timeout as a failed evaluation`() = runTest {
        val root = Files.createTempDirectory("swarm-bubblewrap-timeout")
        try {
            val executable = root.resolve("bwrap").toFile().apply {
                writeText("test bubblewrap")
                setExecutable(true)
            }
            val workspace = root.resolve("workspace").toFile().apply { mkdirs() }
            var invocation = 0
            val runner = CommandRunner { request ->
                invocation += 1
                when (invocation) {
                    1 -> CommandResult(exitCode = 0, output = "bubblewrap 0.11.0", durationMillis = 2)
                    2 -> CommandResult(exitCode = 0, output = "", durationMillis = 3)
                    else -> CommandResult(exitCode = -1, output = "timed out", durationMillis = 500, timedOut = true)
                }
            }
            val verifier = BubblewrapSwarmEvaluationVerifier(
                executable = executable,
                commandRunner = runner,
                environment = mapOf("PATH" to "/usr/bin:/bin"),
                osName = "Linux",
            )

            val result = verifier.verify(workspace, listOf("slow-check"))

            assertFalse(result.passed)
            assertTrue(result.timedOut)
        } finally {
            root.deleteRecursively()
        }
    }
}
