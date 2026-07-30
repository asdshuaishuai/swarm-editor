package com.swarmeditor.backend.swarm

import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SwarmRepositorySnapshotTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `captures tracked and untracked working tree state without changing the user index`() = runTest {
        val directory = Files.createTempDirectory("swarm-repository-snapshot")
        try {
            val repository = directory.resolve("repository").toFile().apply { mkdirs() }
            git(repository, "init")
            git(repository, "config", "user.email", "tests@swarm.local")
            git(repository, "config", "user.name", "Swarm Tests")
            File(repository, "result.txt").writeText("base\n")
            git(repository, "add", "result.txt")
            git(repository, "commit", "-m", "baseline")
            val baseRevision = git(repository, "rev-parse", "HEAD").trim()

            File(repository, "result.txt").writeText("staged\n")
            git(repository, "add", "result.txt")
            File(repository, "result.txt").writeText("working\n")
            File(repository, "untracked.txt").writeText("untracked\n")
            val snapshotter = GitContentAddressedSnapshotter(
                repositoryRoot = repository,
                indexRoot = directory.resolve("indexes").toFile(),
            )

            val first = snapshotter.snapshot()
            val second = snapshotter.snapshot()

            assertTrue(first.dirty)
            assertEquals(baseRevision, first.baseRevision)
            assertEquals(first, second)
            assertEquals("working", git(repository, "show", "${first.revision}:result.txt").trim())
            assertEquals("untracked", git(repository, "show", "${first.revision}:untracked.txt").trim())
            assertEquals("staged", git(repository, "show", ":result.txt").trim())
            assertEquals("working", File(repository, "result.txt").readText().trim())
            assertNotNull(first.pinnedReference)
            assertEquals(first.revision, git(repository, "rev-parse", first.pinnedReference).trim())
            assertTrue(directory.resolve("indexes").toFile().listFiles().orEmpty().isEmpty())
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `reuses head directly when the working tree is clean`() = runTest {
        val directory = Files.createTempDirectory("swarm-clean-snapshot")
        try {
            val repository = directory.resolve("repository").toFile().apply { mkdirs() }
            git(repository, "init")
            git(repository, "config", "user.email", "tests@swarm.local")
            git(repository, "config", "user.name", "Swarm Tests")
            File(repository, "result.txt").writeText("base\n")
            git(repository, "add", "result.txt")
            git(repository, "commit", "-m", "baseline")
            val head = git(repository, "rev-parse", "HEAD").trim()
            val snapshotter = GitContentAddressedSnapshotter(
                repositoryRoot = repository,
                indexRoot = directory.resolve("indexes").toFile(),
            )

            val snapshot = snapshotter.snapshot()

            assertFalse(snapshot.dirty)
            assertEquals(head, snapshot.revision)
            assertEquals(head, snapshot.baseRevision)
            assertEquals(null, snapshot.pinnedReference)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun git(directory: File, vararg arguments: String): String {
        val process = ProcessBuilder(listOf("git") + arguments)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        check(process.waitFor() == 0) { "git ${arguments.joinToString(" ")} failed: $output" }
        return output
    }
}
