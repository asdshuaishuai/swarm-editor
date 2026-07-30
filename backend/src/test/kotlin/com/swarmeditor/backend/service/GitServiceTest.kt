package com.swarmeditor.backend.service

import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class GitServiceTest {
    @Test
    fun `reads working tree changes and stages selected paths`() {
        val directory = Files.createTempDirectory("git-service")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "test@example.com")
            runGit(root, "config", "user.name", "Git Service Test")
            File(root, "tracked.txt").writeText("before\n")
            runGit(root, "add", "tracked.txt")
            runGit(root, "commit", "-qm", "initial")

            File(root, "tracked.txt").writeText("before\nafter\n")
            File(root, "new.txt").writeText("new line\n")

            val service = GitService(root)
            val workingTree = service.getStatus()
            assertEquals(0, workingTree.staged)
            assertEquals(1, workingTree.modified)
            assertEquals(1, workingTree.untracked)
            assertEquals(setOf("tracked.txt", "new.txt"), workingTree.changes.map { it.path }.toSet())
            val trackedChange = workingTree.changes.single { it.path == "tracked.txt" }
            assertTrue(trackedChange.added > 0)
            assertTrue(trackedChange.diffLines.none { it.startsWith("+++") || it.startsWith("---") })
            assertTrue(trackedChange.diffLines.first().startsWith("@@"))
            assertTrue(trackedChange.diffLines.any { it == " before" })
            assertTrue(trackedChange.diffLines.any { it == "+after" })
            val untrackedChange = workingTree.changes.single { it.path == "new.txt" }
            assertEquals("@@ -0,0 +1,1 @@", untrackedChange.diffLines.first())
            assertEquals("+new line", untrackedChange.diffLines.last())

            service.stage(listOf("new.txt", "tracked.txt"))
            val fullyStaged = service.getStatus()
            assertEquals(2, fullyStaged.staged)
            assertEquals(0, fullyStaged.modified)
            File(root, "tracked.txt").appendText("still working\n")
            val staged = service.getStatus()
            assertEquals(2, staged.staged)
            assertEquals(1, staged.modified)
            val partiallyStaged = staged.changes.single { it.path == "tracked.txt" }
            assertTrue(partiallyStaged.hasStagedChanges)
            assertTrue(partiallyStaged.hasUnstagedChanges)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `unstage keeps file in working tree`() {
        val directory = Files.createTempDirectory("git-service-unstage")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "test@example.com")
            runGit(root, "config", "user.name", "Git Service Test")
            File(root, "new.txt").writeText("new line\n")

            val service = GitService(root)
            service.stage("new.txt")
            service.unstage("new.txt")

            val status = service.getStatus()
            assertEquals(0, status.staged)
            assertEquals(1, status.untracked)
            assertTrue(status.changes.single().isUntracked)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `supports paths containing spaces`() {
        val directory = Files.createTempDirectory("git-service-spaces")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            File(root, "space name.txt").writeText("content\n")

            val service = GitService(root)
            assertEquals("space name.txt", service.getStatus().changes.single().path)
            assertFailsWith<IllegalArgumentException> { service.stage("../outside.txt") }

            service.stage("space name.txt")
            assertTrue(service.getStatus().changes.single().hasStagedChanges)
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `does not follow untracked symbolic links when building a diff preview`() {
        val directory = Files.createTempDirectory("git-service-symlink")
        val secret = Files.createTempFile("git-service-secret", ".txt")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            secret.toFile().writeText("outside project content\n")
            Files.createSymbolicLink(root.toPath().resolve("outside-link.txt"), secret)

            val change = GitService(root).getStatus().changes.single()

            assertTrue(change.isUntracked)
            assertEquals("outside-link.txt", change.path)
            assertEquals(0, change.added)
            assertTrue(change.diffLines.isEmpty())
        } finally {
            secret.toFile().delete()
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }
}

private fun runGit(directory: File, vararg args: String) {
    val process = ProcessBuilder(listOf("git") + args.toList())
        .directory(directory)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText()
    check(process.waitFor() == 0) { "git ${args.joinToString(" ")} failed: $output" }
}
