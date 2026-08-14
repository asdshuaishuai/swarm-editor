package com.swarmeditor.backend.service

import java.io.File
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
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

    @Test
    fun `keeps staged and unstaged diffs separate and commits only the index`() {
        val directory = Files.createTempDirectory("git-service-commit")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "test@example.com")
            runGit(root, "config", "user.name", "Git Service Test")
            File(root, "notes.txt").writeText("one\n")
            runGit(root, "add", "notes.txt")
            runGit(root, "commit", "-qm", "initial")

            val file = File(root, "notes.txt")
            file.writeText("one\ntwo\n")
            runGit(root, "add", "notes.txt")
            file.writeText("one\ntwo\nthree\n")

            val service = GitService(root)
            val change = service.getStatus().changes.single()
            assertEquals(1, change.stagedAdded)
            assertEquals(1, change.unstagedAdded)
            assertTrue(change.stagedDiffLines.any { it == "+two" })
            assertTrue(change.unstagedDiffLines.any { it == "+three" })

            assertTrue(service.commit("Add second line").isNotBlank())
            val status = service.getStatus()
            assertEquals(0, status.staged)
            assertEquals(1, status.modified)
            assertTrue(status.changes.single().unstagedDiffLines.any { it == "+three" })
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `reports non repository state explicitly`() {
        val directory = Files.createTempDirectory("git-service-non-repository")
        try {
            val status = GitService(directory.toFile()).getStatus()
            assertEquals(false, status.isRepository)
            assertTrue(status.changes.isEmpty())
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `reads decorated commit history in topological order with bounded results`() {
        val directory = Files.createTempDirectory("git-service-history")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "history@example.com")
            runGit(root, "config", "user.name", "History Author")
            File(root, "history.txt").writeText("one\n")
            runGit(root, "add", "history.txt")
            runGit(root, "commit", "-qm", "Initial history")
            runGit(root, "tag", "v1")
            File(root, "history.txt").appendText("two\n")
            runGit(root, "add", "history.txt")
            runGit(root, "commit", "-qm", "Add second line")

            val service = GitService(root)
            val limited = service.getHistory(maxCommits = 1)
            val history = service.getHistory(maxCommits = 10)

            assertTrue(limited.truncated)
            assertEquals("Add second line", limited.commits.single().subject)
            assertEquals(2, history.commits.size)
            assertEquals("History Author", history.commits.first().authorName)
            assertEquals("history@example.com", history.commits.first().authorEmail)
            assertEquals(1, history.commits.first().parentHashes.size)
            assertTrue(history.commits.first().authoredAtEpochSeconds > 0)
            assertTrue(history.commits.first().refs.any { it.contains("HEAD") })
            assertTrue(history.commits.last().refs.any { it == "tag: v1" })
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `reads commit file changes with rename statistics and historical diffs`() {
        val directory = Files.createTempDirectory("git-service-commit-changes")
        try {
            val root = directory.toFile()
            runGit(root, "init", "-q")
            runGit(root, "config", "user.email", "changes@example.com")
            runGit(root, "config", "user.name", "Changes Author")
            File(root, "modify.txt").writeText("before\n")
            File(root, "rename-old.txt").writeText("rename me\n")
            File(root, "delete.txt").writeText("remove me\n")
            runGit(root, "add", ".")
            runGit(root, "commit", "-qm", "Initial files")

            File(root, "modify.txt").writeText("before\nafter\n")
            runGit(root, "mv", "rename-old.txt", "rename-new.txt")
            File(root, "delete.txt").delete()
            File(root, "added.txt").writeText("new file\n")
            runGit(root, "add", "-A")
            runGit(root, "commit", "-qm", "Change files")

            val service = GitService(root)
            val commitHash = service.getHistory().commits.first().hash
            val changes = service.getCommitChanges(commitHash, maxFiles = 10)

            assertEquals(commitHash, changes.commitHash)
            assertEquals(false, changes.truncated)
            assertEquals("A", changes.changes.single { it.path == "added.txt" }.status)
            assertEquals("D", changes.changes.single { it.path == "delete.txt" }.status)
            assertEquals(1, changes.changes.single { it.path == "modify.txt" }.added)
            val renamed = changes.changes.single { it.path == "rename-new.txt" }
            assertEquals("R", renamed.status)
            assertEquals("rename-old.txt", renamed.previousPath)

            val modifyDiff = service.getCommitFileDiff(commitHash, "modify.txt")
            assertTrue(modifyDiff.any { it == "+after" })
            val renameDiff = service.getCommitFileDiff(commitHash, renamed.path, renamed.previousPath)
            assertNotNull(renameDiff.firstOrNull { it.contains("rename from rename-old.txt") })
            assertFailsWith<IllegalArgumentException> { service.getCommitChanges("HEAD") }
            assertFailsWith<IllegalArgumentException> {
                service.getCommitFileDiff(commitHash, "../outside.txt")
            }
        } finally {
            @OptIn(kotlin.io.path.ExperimentalPathApi::class)
            directory.deleteRecursively()
        }
    }

    @Test
    fun `git reads follow the active project directory provider`() {
        val directory = Files.createTempDirectory("git-service-active")
        try {
            val repository = directory.resolve("repository").toFile().apply { mkdirs() }
            val plainDirectory = directory.resolve("plain").toFile().apply { mkdirs() }
            runGit(repository, "init", "-q")
            var activeDirectory = repository
            val service = GitService(repository, projectDirProvider = { activeDirectory })

            assertTrue(service.getStatus().isRepository)
            activeDirectory = plainDirectory
            assertEquals(false, service.getStatus().isRepository)
        } finally {
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
