package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourceDiagnostic
import com.swarmeditor.backend.lsp.SourceSymbol
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import java.io.File
import java.nio.file.Files
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteRecursively
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class SwarmRepositoryLocalizationTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `localization combines ranked source matches lsp evidence and git history`() = runTest {
        val root = Files.createTempDirectory("swarm-localization")
        try {
            root.resolve("src/main/kotlin").createDirectories()
            root.resolve("src/main/kotlin/CriticalPathScheduler.kt").writeText(
                """
                package sample

                class CriticalPathScheduler {
                    fun scheduleCriticalPath() = Unit
                }
                """.trimIndent()
            )
            root.resolve("README.md").writeText("A small scheduler project")
            val runner = CommandRunner { request ->
                val output = when {
                    request.command.take(3) == listOf("git", "ls-files", "-co") ->
                        "src/main/kotlin/CriticalPathScheduler.kt\nREADME.md"
                    request.command.take(2) == listOf("git", "log") ->
                        "@@@abc123def456\t2026-07-30\tImprove critical path scheduling\n" +
                            "src/main/kotlin/CriticalPathScheduler.kt"
                    else -> error("Unexpected command: ${request.command}")
                }
                CommandResult(exitCode = 0, output = output, durationMillis = 1)
            }
            val intelligence = object : SourceCodeIntelligence {
                override suspend fun highlight(file: File, content: String) =
                    LspHighlightResult(languageId = "kotlin", serverName = "test-lsp")

                override suspend fun inspect(file: File, content: String) = LspDocumentInsight(
                    languageId = "kotlin",
                    serverName = "test-lsp",
                    symbols = listOf(SourceSymbol("scheduleCriticalPath", "method", 3, "CriticalPathScheduler")),
                    diagnostics = listOf(SourceDiagnostic(3, "warning", "Scheduler result is not consumed")),
                )
            }
            val localizer = EvidenceDrivenSwarmRepositoryLocalizer(
                repositoryRoot = root.toFile(),
                sourceIntelligence = intelligence,
                commandRunner = runner,
                now = { Instant.fromEpochMilliseconds(42) },
            )

            val bundle = localizer.localize("Improve critical path scheduler integration")

            assertEquals(Instant.fromEpochMilliseconds(42), bundle.generatedAt)
            assertEquals(2, bundle.scannedFileCount)
            assertTrue(bundle.evidence.any { it.kind == SwarmRepositoryEvidenceKind.FILE_MATCH })
            assertTrue(bundle.evidence.any { it.kind == SwarmRepositoryEvidenceKind.SYMBOL })
            assertTrue(bundle.evidence.any { it.kind == SwarmRepositoryEvidenceKind.DIAGNOSTIC })
            assertTrue(bundle.evidence.any { it.kind == SwarmRepositoryEvidenceKind.GIT_HISTORY })
            assertEquals("src/main/kotlin/CriticalPathScheduler.kt", bundle.evidence.first().path)
            assertTrue(bundle.consumedCharacters <= bundle.characterBudget)
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `localization enforces the persisted character budget`() = runTest {
        val root = Files.createTempDirectory("swarm-localization-budget")
        try {
            root.resolve("Scheduler.kt").writeText("class Scheduler { fun schedule() = Unit }")
            val runner = CommandRunner { request ->
                val output = if (request.command.take(2) == listOf("git", "log")) "" else "Scheduler.kt"
                CommandResult(exitCode = 0, output = output, durationMillis = 1)
            }
            val localizer = EvidenceDrivenSwarmRepositoryLocalizer(
                repositoryRoot = root.toFile(),
                commandRunner = runner,
                budget = SwarmRepositoryLocalizationBudget(characterBudget = 80),
            )

            val bundle = localizer.localize("scheduler schedule")

            assertTrue(bundle.consumedCharacters <= 80)
            assertTrue(bundle.truncated)
        } finally {
            root.deleteRecursively()
        }
    }
}
