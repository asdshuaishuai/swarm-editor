package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.common.model.SwarmArtifactHunkApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SwarmArtifactHunkApplicabilityTest {
    @Test
    fun `extracts one complete patch envelope per textual hunk`() {
        val diff = sampleDiff()
        val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

        val patches = extractIndividualHunkPatches(diff, hunks)

        assertEquals(2, patches.size)
        val firstPatch = patches.getValue(hunks[0].id)
        val secondPatch = patches.getValue(hunks[1].id)
        assertTrue(firstPatch.startsWith("diff --git a/src/First.kt b/src/First.kt"))
        assertTrue(firstPatch.contains("+val independent = true"))
        assertFalse(firstPatch.contains("+val dependent = missingContext()"))
        assertTrue(secondPatch.startsWith("diff --git a/src/Second.kt b/src/Second.kt"))
        assertTrue(secondPatch.contains("+val dependent = missingContext()"))
    }

    @Test
    fun `combines selected same-file hunks under one file prelude`() {
        val diff = """
            diff --git a/src/App.kt b/src/App.kt
            index 1111111..2222222 100644
            --- a/src/App.kt
            +++ b/src/App.kt
            @@ -1,1 +1,2 @@
             val first = true
            +val addedFirst = true
            @@ -20,1 +21,2 @@
             val second = true
            +val addedSecond = true
        """.trimIndent()
        val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

        val patch = extractSelectedHunkPatch(diff, hunks, hunks.mapTo(linkedSetOf()) { it.id })

        assertTrue(patch != null)
        assertEquals(1, patch.lineSequence().count { it.startsWith("diff --git ") })
        assertEquals(2, patch.lineSequence().count { it.startsWith("@@") })
        assertTrue(patch.contains("+val addedFirst = true"))
        assertTrue(patch.contains("+val addedSecond = true"))
    }

    @Test
    fun `records independent failed and unsupported checks without exposing git output`() = runTest {
        val root = Files.createTempDirectory("swarm-hunk-checker").toFile()
        try {
            val indexFiles = mutableListOf<String>()
            val runner = CommandRunner { request ->
                request.environment["GIT_INDEX_FILE"]?.let(indexFiles::add)
                when {
                    request.command.take(2) == listOf("git", "read-tree") ->
                        CommandResult(0, "", 1)
                    request.command.take(2) == listOf("git", "apply") &&
                        request.stdin.orEmpty().contains("independent") ->
                        CommandResult(0, "", 1)
                    request.command.take(2) == listOf("git", "apply") ->
                        CommandResult(1, "sensitive local git failure", 1)
                    else -> error("Unexpected command: ${request.command}")
                }
            }
            val checker = GitSwarmArtifactHunkApplicabilityChecker(root, runner, maxChecks = 2)
            val hunks = SwarmArtifactRiskAnalyzer.analyze(sampleDiff())

            val evidence = checker.check("a".repeat(40), sampleDiff(), hunks)

            assertEquals(
                listOf(
                    SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE,
                    SwarmArtifactHunkApplicabilityStatus.NOT_INDEPENDENTLY_APPLICABLE,
                    SwarmArtifactHunkApplicabilityStatus.UNSUPPORTED,
                ),
                evidence.map { it.status },
            )
            assertEquals("a".repeat(40), evidence[0].checkedAgainstTree)
            assertEquals("a".repeat(40), evidence[1].checkedAgainstTree)
            assertEquals(null, evidence[2].checkedAgainstTree)
            assertTrue(indexFiles.isNotEmpty())
            assertTrue(indexFiles.distinct().size == 1)
            assertFalse(indexFiles.distinct().single() == root.resolve(".git/index").absolutePath)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `bounds git subprocess work and marks remaining hunks skipped`() = runTest {
        val root = Files.createTempDirectory("swarm-hunk-limit").toFile()
        try {
            var applyCalls = 0
            val runner = CommandRunner { request ->
                if (request.command.take(2) == listOf("git", "apply")) applyCalls += 1
                CommandResult(0, "", 1)
            }
            val checker = GitSwarmArtifactHunkApplicabilityChecker(root, runner, maxChecks = 1)
            val hunks = SwarmArtifactRiskAnalyzer.analyze(sampleDiff())

            val evidence = checker.check("b".repeat(40), sampleDiff(), hunks)

            assertEquals(1, applyCalls)
            assertEquals(SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE, evidence[0].status)
            assertEquals(SwarmArtifactHunkApplicabilityStatus.SKIPPED_LIMIT, evidence[1].status)
            assertEquals(SwarmArtifactHunkApplicabilityStatus.UNSUPPORTED, evidence[2].status)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `prioritizes high risk hunks when the check budget is bounded`() = runTest {
        val root = Files.createTempDirectory("swarm-hunk-priority").toFile()
        try {
            val appliedPatches = mutableListOf<String>()
            val runner = CommandRunner { request ->
                request.stdin?.let(appliedPatches::add)
                CommandResult(0, "", 1)
            }
            val checker = GitSwarmArtifactHunkApplicabilityChecker(root, runner, maxChecks = 1)
            val diff = """
                diff --git a/src/Label.kt b/src/Label.kt
                --- a/src/Label.kt
                +++ b/src/Label.kt
                @@ -1,1 +1,1 @@
                -Text("old")
                +Text("new")
                diff --git a/src/Runtime.kt b/src/Runtime.kt
                --- a/src/Runtime.kt
                +++ b/src/Runtime.kt
                @@ -1,1 +1,1 @@
                -val command = "old"
                +val process = ProcessBuilder("new").start()
            """.trimIndent()
            val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

            val evidence = checker.check("c".repeat(40), diff, hunks)

            assertEquals(SwarmArtifactHunkApplicabilityStatus.SKIPPED_LIMIT, evidence[0].status)
            assertEquals(SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE, evidence[1].status)
            assertEquals(1, appliedPatches.size)
            assertTrue(appliedPatches.single().contains("ProcessBuilder"))
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `checks an effective multi-hunk selection as one patch`() = runTest {
        val root = Files.createTempDirectory("swarm-selection-check").toFile()
        try {
            val appliedPatches = mutableListOf<String>()
            val runner = CommandRunner { request ->
                request.stdin?.let(appliedPatches::add)
                CommandResult(0, "", 1)
            }
            val checker = GitSwarmArtifactHunkApplicabilityChecker(root, runner)
            val diff = sampleDiff()
            val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

            val status = checker.checkSelection(
                baseTree = "d".repeat(40),
                unifiedDiff = diff,
                hunks = hunks,
                selectedHunkIds = hunks.take(2).mapTo(linkedSetOf()) { it.id },
            )

            assertEquals(SwarmArtifactSelectionApplicabilityStatus.APPLICABLE, status)
            assertEquals(1, appliedPatches.size)
            assertEquals(2, appliedPatches.single().lineSequence().count { it.startsWith("diff --git ") })
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `rejects a selection containing metadata-only hunks without spawning git`() = runTest {
        val root = Files.createTempDirectory("swarm-selection-unsupported").toFile()
        try {
            var commandCalls = 0
            val checker = GitSwarmArtifactHunkApplicabilityChecker(
                repositoryRoot = root,
                commandRunner = CommandRunner {
                    commandCalls += 1
                    CommandResult(0, "", 1)
                },
            )
            val diff = sampleDiff()
            val hunks = SwarmArtifactRiskAnalyzer.analyze(diff)

            val status = checker.checkSelection(
                baseTree = "e".repeat(40),
                unifiedDiff = diff,
                hunks = hunks,
                selectedHunkIds = setOf(hunks.last().id),
            )

            assertEquals(SwarmArtifactSelectionApplicabilityStatus.UNSUPPORTED, status)
            assertEquals(0, commandCalls)
        } finally {
            root.deleteRecursively()
        }
    }

    private fun sampleDiff(): String = """
        diff --git a/src/First.kt b/src/First.kt
        index 1111111..2222222 100644
        --- a/src/First.kt
        +++ b/src/First.kt
        @@ -1,1 +1,2 @@
         val base = true
        +val independent = true
        diff --git a/src/Second.kt b/src/Second.kt
        index 3333333..4444444 100644
        --- a/src/Second.kt
        +++ b/src/Second.kt
        @@ -1,1 +1,2 @@
         val base = true
        +val dependent = missingContext()
        diff --git a/assets/icon.png b/assets/icon.png
        index 5555555..6666666 100644
        Binary files a/assets/icon.png and b/assets/icon.png differ
    """.trimIndent()
}
