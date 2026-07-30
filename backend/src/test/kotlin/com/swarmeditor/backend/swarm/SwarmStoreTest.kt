package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskStatus
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `recovers interrupted running tasks as retryable failures`() = runTest {
        val directory = Files.createTempDirectory("swarm-store-recovery")
        try {
            val timestamp = Clock.System.now()
            val store = SwarmStore(directory.toFile())
            store.put(
                SwarmRun(
                    id = "run-recovery",
                    title = "Recovery",
                    objective = "Recover interrupted run",
                    createdAt = timestamp,
                    updatedAt = timestamp,
                    status = SwarmRunStatus.RUNNING,
                    tasks = listOf(
                        SwarmTask(
                            id = "task",
                            title = "Task",
                            prompt = "Execute",
                            status = SwarmTaskStatus.RUNNING,
                        )
                    ),
                )
            )

            val reloaded = SwarmStore(directory.toFile()).also { it.load() }
            val recovered = reloaded.get("run-recovery")!!

            assertEquals(SwarmRunStatus.FAILED, recovered.status)
            assertEquals(SwarmTaskStatus.FAILED, recovered.tasks.single().status)
            assertTrue(directory.resolve("run-recovery.json").toFile().readText().contains("\"status\": \"FAILED\""))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `rejects unsafe run ids before writing files`() = runTest {
        val directory = Files.createTempDirectory("swarm-store-safe-id")
        try {
            val timestamp = Clock.System.now()
            val store = SwarmStore(directory.toFile())
            val unsafe = SwarmRun(
                id = "../escaped",
                title = "Unsafe",
                objective = "Must not escape",
                createdAt = timestamp,
                updatedAt = timestamp,
                tasks = listOf(SwarmTask(id = "task", title = "Task", prompt = "Execute")),
            )

            assertFailsWith<IllegalArgumentException> { store.put(unsafe) }
            assertEquals(emptyList(), store.runs.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `quarantines malformed swarm run files`() = runTest {
        val directory = Files.createTempDirectory("swarm-store-corrupt")
        try {
            val runFile = directory.resolve("run-corrupt.json").toFile().apply { writeText("not-json") }
            val store = SwarmStore(directory.toFile())

            store.load()

            assertEquals(emptyList(), store.runs.value)
            assertFalse(runFile.exists())
            assertEquals(
                1,
                directory.toFile().listFiles().orEmpty().count { it.name.startsWith("run-corrupt.json.corrupt-") },
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `oversized swarm run rolls back memory and disk`() = runTest {
        val directory = Files.createTempDirectory("swarm-store-size")
        try {
            val timestamp = Clock.System.now()
            val store = SwarmStore(directory.toFile(), maxFileBytes = 500)
            val oversized = SwarmRun(
                id = "run-large",
                title = "Large",
                objective = "x".repeat(2_000),
                createdAt = timestamp,
                updatedAt = timestamp,
                tasks = listOf(SwarmTask(id = "task", title = "Task", prompt = "Execute")),
            )

            assertFailsWith<IllegalArgumentException> { store.put(oversized) }

            assertEquals(emptyList(), store.runs.value)
            assertTrue(directory.toFile().listFiles().orEmpty().isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }
}
