package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SwarmContainerVerifierTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `builds a local-image rootless offline verification command`() = runTest {
        val directory = Files.createTempDirectory("swarm-container-verifier")
        try {
            var captured: CommandRequest? = null
            val runner = CommandRunner { request ->
                if (request.command.getOrNull(1) == "info") {
                    CommandResult(exitCode = 0, output = "true", durationMillis = 5)
                } else {
                    captured = request
                    CommandResult(exitCode = 0, output = "tests passed", durationMillis = 40)
                }
            }
            val verifier = RootlessContainerSwarmVerifier(
                runtimeExecutable = "/usr/bin/podman",
                image = "localhost/swarm-eval:21-node22",
                commandRunner = runner,
            )

            val result = verifier.verify(directory.toFile(), listOf("./gradlew", "test", "--offline"))

            val command = captured!!.command
            assertTrue(result.passed)
            assertFalse(result.timedOut)
            assertContains(command, "--pull=never")
            assertContains(command, "--network=none")
            assertContains(command, "--read-only")
            assertContains(command, "--cap-drop=ALL")
            assertContains(command, "--security-opt=no-new-privileges")
            assertContains(command, "--userns=keep-id")
            assertContains(command, "localhost/swarm-eval:21-node22")
            assertEquals(listOf("./gradlew", "test", "--offline"), command.takeLast(3))
            val fingerprint = verifier.environmentFingerprint("abcdef1234567", listOf("./gradlew", "test"))
            assertEquals(fingerprint, verifier.environmentFingerprint("abcdef1234567", listOf("./gradlew", "test")))
            assertNotEquals(fingerprint, verifier.environmentFingerprint("abcdef1234567", listOf("./gradlew", "build")))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects a non-rootless podman runtime before starting a container`() = runTest {
        val directory = Files.createTempDirectory("swarm-container-rootless")
        try {
            var containerRequest: CommandRequest? = null
            val runner = CommandRunner { request ->
                if (request.command.getOrNull(1) == "info") {
                    CommandResult(exitCode = 0, output = "false", durationMillis = 5)
                } else {
                    containerRequest = request
                    CommandResult(exitCode = 0, output = "unexpected", durationMillis = 5)
                }
            }
            val verifier = RootlessContainerSwarmVerifier(
                runtimeExecutable = "podman",
                image = "localhost/swarm-eval:21-node22",
                commandRunner = runner,
            )

            val failure = runCatching {
                verifier.verify(directory.toFile(), listOf("./gradlew", "test", "--offline"))
            }.exceptionOrNull()

            assertIs<IllegalStateException>(failure)
            assertContains(failure.message.orEmpty(), "rootless Podman")
            assertNull(containerRequest)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `classifies podman exit codes 125 through 127 as infrastructure failures`() = runTest {
        val directory = Files.createTempDirectory("swarm-container-infrastructure")
        try {
            for (exitCode in 125..127) {
                val runner = CommandRunner { request ->
                    if (request.command.getOrNull(1) == "info") {
                        CommandResult(exitCode = 0, output = "true", durationMillis = 5)
                    } else {
                        CommandResult(exitCode = exitCode, output = "podman failure $exitCode", durationMillis = 10)
                    }
                }
                val verifier = RootlessContainerSwarmVerifier(
                    runtimeExecutable = "podman",
                    image = "localhost/swarm-eval:21-node22",
                    commandRunner = runner,
                )

                val failure = runCatching {
                    verifier.verify(directory.toFile(), listOf("./gradlew", "test", "--offline"))
                }.exceptionOrNull()

                assertIs<IllegalStateException>(failure)
                assertContains(failure.message.orEmpty(), "infrastructure failed with exit $exitCode")
            }
        } finally {
            directory.deleteRecursively()
        }
    }
}
