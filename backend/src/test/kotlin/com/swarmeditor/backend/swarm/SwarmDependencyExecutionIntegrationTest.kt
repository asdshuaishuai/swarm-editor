package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.pi.PiSession
import com.swarmeditor.backend.pi.PiSessionEvent
import com.swarmeditor.backend.pi.PiSessionProvider
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.ImageData
import com.swarmeditor.common.model.SwarmExecutionPolicy
import com.swarmeditor.common.model.SwarmRepositoryBaseline
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.runTest

class SwarmDependencyExecutionIntegrationTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `downstream pi workspace contains upstream artifact changes`() = runTest {
        val root = Files.createTempDirectory("swarm-dependency-execution")
        try {
            val repository = File(root.toFile(), "repository").apply { mkdirs() }
            git(repository, "init")
            git(repository, "config", "user.email", "tests@swarm.local")
            git(repository, "config", "user.name", "Swarm Tests")
            File(repository, "base.txt").writeText("base\n")
            git(repository, "add", ".")
            git(repository, "commit", "-m", "baseline")
            val revision = git(repository, "rev-parse", "HEAD").trim()
            val tree = git(repository, "rev-parse", "HEAD^{tree}").trim()
            val timestamp = Clock.System.now()
            val first = SwarmTask(
                id = "first",
                title = "Generate source",
                prompt = "Generate upstream source",
                writePaths = listOf("generated.txt"),
            )
            val second = SwarmTask(
                id = "second",
                title = "Consume source",
                prompt = "Read upstream source and integrate it",
                dependsOn = listOf("first"),
                readPaths = listOf("generated.txt"),
                writePaths = listOf("result.txt"),
            )
            val run = SwarmRun(
                id = "run-dependency-execution",
                title = "Dependency execution",
                objective = "Verify code artifact data flow",
                createdAt = timestamp,
                updatedAt = timestamp,
                policy = SwarmExecutionPolicy(maxParallelism = 2, maxTaskAttempts = 1),
                repositoryBaseline = SwarmRepositoryBaseline(
                    revision = revision,
                    baseRevision = revision,
                    treeHash = tree,
                    dirty = false,
                    capturedAt = timestamp,
                ),
                tasks = listOf(first, second),
            )
            val runDirectory = File(root.toFile(), "runs")
            val evidenceStore = SwarmEvidenceStore(File(root.toFile(), "evidence"))
            val store = SwarmStore(runDirectory).also { it.load(); it.put(run) }
            val sessions = object : PiSessionProvider {
                override suspend fun getOrCreate(
                    sessionId: String,
                    config: AgentConfig,
                    remoteSessionId: String?,
                ): PiSession = error("Validated session creation is required")

                override suspend fun getOrCreateValidated(
                    sessionId: String,
                    config: AgentConfig,
                    remoteSessionId: String?,
                    isConfigCurrent: suspend () -> Boolean,
                ): PiSession {
                    assertTrue(isConfigCurrent())
                    return object : PiSession {
                        override val pid: Long? = null
                        override val remoteSessionId: String = "remote-$sessionId"

                        override suspend fun prompt(
                            message: String,
                            images: List<ImageData>,
                            onEvent: suspend (PiSessionEvent) -> Unit,
                        ): String {
                            val workspace = File(config.workingDirectory)
                            return when {
                                sessionId.endsWith(":first") -> {
                                    File(workspace, "generated.txt").writeText("from-first\n")
                                    "generated"
                                }
                                sessionId.endsWith(":second") -> {
                                    assertEquals("from-first", File(workspace, "generated.txt").readText().trim())
                                    File(workspace, "result.txt").writeText("integrated\n")
                                    "integrated"
                                }
                                else -> error("Unexpected session: $sessionId")
                            }
                        }

                        override suspend fun abort() = Unit
                        override suspend fun close() = Unit
                    }
                }

                override suspend fun abort(sessionId: String) = Unit
                override suspend fun close(sessionId: String) = Unit
            }
            val executor = PiSwarmTaskExecutor(
                sessions = sessions,
                workspaceManager = GitSwarmTaskWorkspaceManager(repository, File(root.toFile(), "worktrees")),
                workspaceDeltaCapturer = GitSwarmWorkspaceDeltaCapturer(
                    File(root.toFile(), "indexes"),
                    evidenceStore,
                ),
                baseRevisionResolver = GitDependencyAwareSwarmTaskBaseRevisionResolver(repository, evidenceStore),
                agentResolver = SwarmAgentResolver {
                    SwarmAgentAllocation(AgentConfig(id = "pi", name = "Pi"))
                },
            )
            val schedulerScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val scheduler = SwarmScheduler(store, executor, schedulerScope)
            try {
                scheduler.start(run.id)
                scheduler.await(run.id)
            } finally {
                scheduler.shutdown()
                schedulerScope.cancel()
            }

            val completed = store.get(run.id)!!
            assertEquals(
                SwarmRunStatus.SUCCEEDED,
                completed.status,
                completed.tasks.joinToString { task -> "${task.id}:${task.status}:${task.errorMessage}" },
            )
            assertTrue(completed.tasks.all { it.status == SwarmTaskStatus.SUCCEEDED })
            val secondEvidenceId = completed.tasks.single { it.id == "second" }
                .attemptRecords.single().workspaceDeltaEvidenceId!!
            val secondEvidence = evidenceStore.getWorkspaceDelta(secondEvidenceId)!!
            assertEquals(listOf("result.txt"), secondEvidence.changedPaths.map { it.path })
            assertEquals("from-first", git(repository, "show", "${secondEvidence.artifactRevision}:generated.txt").trim())
            assertEquals("integrated", git(repository, "show", "${secondEvidence.artifactRevision}:result.txt").trim())
            assertFalse(File(repository, "generated.txt").exists())
            assertFalse(File(repository, "result.txt").exists())
        } finally {
            root.deleteRecursively()
        }
    }

    private fun git(directory: File, vararg arguments: String): String {
        val process = ProcessBuilder(listOf("git") + arguments)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText()
        check(process.waitFor() == 0) { "git ${arguments.joinToString(" ")} failed: $output" }
        return output
    }
}
