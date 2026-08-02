package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandResult
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmArtifactDiffHunk
import com.swarmeditor.common.model.SwarmArtifactHunkApplicability
import com.swarmeditor.common.model.SwarmArtifactHunkApplicabilityStatus
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactSelectionApplicabilityStatus
import java.io.File
import java.nio.file.Files
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

internal class GitSwarmArtifactHunkApplicabilityChecker(
    repositoryRoot: File,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val maxChecks: Int = DEFAULT_MAX_CHECKS,
) {
    private val normalizedRepositoryRoot = repositoryRoot.canonicalFile

    init {
        require(maxChecks >= 0) { "Hunk applicability check limit cannot be negative" }
    }

    suspend fun check(
        baseTree: String,
        unifiedDiff: String,
        hunks: List<SwarmArtifactDiffHunk>,
    ): List<SwarmArtifactHunkApplicability> {
        if (hunks.isEmpty()) return emptyList()
        val patchesByHunkId = extractIndividualHunkPatches(unifiedDiff, hunks)
        val hunkOrder = hunks.mapIndexed { index, hunk -> hunk.id to index }.toMap()
        val checkableHunks = hunks.filter { it.id in patchesByHunkId }.sortedWith(
            compareBy<SwarmArtifactDiffHunk> { hunk ->
                when (hunk.riskLevel) {
                    SwarmArtifactRiskLevel.HIGH -> 0
                    SwarmArtifactRiskLevel.MEDIUM -> 1
                    SwarmArtifactRiskLevel.LOW -> 2
                }
            }.thenBy { hunk -> hunkOrder.getValue(hunk.id) }
        )
        val selectedHunkIds = checkableHunks.take(maxChecks).mapTo(linkedSetOf()) { it.id }
        val skippedHunkIds = checkableHunks.drop(maxChecks).mapTo(linkedSetOf()) { it.id }
        val statuses = mutableMapOf<String, SwarmArtifactHunkApplicabilityStatus>()
        hunks.filterNot { it.id in patchesByHunkId }.forEach { hunk ->
            statuses[hunk.id] = SwarmArtifactHunkApplicabilityStatus.UNSUPPORTED
        }
        skippedHunkIds.forEach { hunkId ->
            statuses[hunkId] = SwarmArtifactHunkApplicabilityStatus.SKIPPED_LIMIT
        }
        if (selectedHunkIds.isNotEmpty()) {
            statuses += try {
                checkSelectedHunks(baseTree, patchesByHunkId, selectedHunkIds)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                selectedHunkIds.associateWith { SwarmArtifactHunkApplicabilityStatus.CHECK_FAILED }
            }
        }
        return hunks.map { hunk ->
            val status = statuses[hunk.id] ?: SwarmArtifactHunkApplicabilityStatus.CHECK_FAILED
            SwarmArtifactHunkApplicability(
                hunkId = hunk.id,
                status = status,
                checkedAgainstTree = baseTree.takeIf {
                    status == SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE ||
                        status == SwarmArtifactHunkApplicabilityStatus.NOT_INDEPENDENTLY_APPLICABLE
                },
            )
        }
    }

    suspend fun checkSelection(
        baseTree: String,
        unifiedDiff: String,
        hunks: List<SwarmArtifactDiffHunk>,
        selectedHunkIds: Set<String>,
    ): SwarmArtifactSelectionApplicabilityStatus {
        if (selectedHunkIds.isEmpty()) return SwarmArtifactSelectionApplicabilityStatus.UNSUPPORTED
        val patch = extractSelectedHunkPatch(unifiedDiff, hunks, selectedHunkIds)
            ?: return SwarmArtifactSelectionApplicabilityStatus.UNSUPPORTED
        return try {
            when (checkPatch(baseTree, patch)) {
                null -> SwarmArtifactSelectionApplicabilityStatus.CHECK_FAILED
                true -> SwarmArtifactSelectionApplicabilityStatus.APPLICABLE
                false -> SwarmArtifactSelectionApplicabilityStatus.NOT_APPLICABLE
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            SwarmArtifactSelectionApplicabilityStatus.CHECK_FAILED
        }
    }

    private suspend fun checkSelectedHunks(
        baseTree: String,
        patchesByHunkId: Map<String, String>,
        selectedHunkIds: Set<String>,
    ): Map<String, SwarmArtifactHunkApplicabilityStatus> {
        val temporaryDirectory = withContext(Dispatchers.IO) {
            Files.createTempDirectory("swarm-hunk-index-").toFile()
        }
        return try {
            val environment = mapOf(
                "GIT_INDEX_FILE" to File(temporaryDirectory, "index").absolutePath,
                "GIT_OPTIONAL_LOCKS" to "0",
            )
            val initialized = runGit(
                arguments = listOf("read-tree", baseTree),
                environment = environment,
            )
            if (!initialized.succeeded()) {
                selectedHunkIds.associateWith { SwarmArtifactHunkApplicabilityStatus.CHECK_FAILED }
            } else {
                selectedHunkIds.associateWith { hunkId ->
                    val result = try {
                        runGit(
                            arguments = listOf(
                                "apply",
                                "--cached",
                                "--check",
                                "--whitespace=nowarn",
                                "-",
                            ),
                            environment = environment,
                            stdin = patchesByHunkId.getValue(hunkId),
                        )
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Throwable) {
                        null
                    }
                    when {
                        result == null || result.timedOut -> SwarmArtifactHunkApplicabilityStatus.CHECK_FAILED
                        result.exitCode == 0 -> SwarmArtifactHunkApplicabilityStatus.INDEPENDENTLY_APPLICABLE
                        else -> SwarmArtifactHunkApplicabilityStatus.NOT_INDEPENDENTLY_APPLICABLE
                    }
                }
            }
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                temporaryDirectory.deleteRecursively()
            }
        }
    }

    private suspend fun checkPatch(baseTree: String, patch: String): Boolean? {
        val temporaryDirectory = withContext(Dispatchers.IO) {
            Files.createTempDirectory("swarm-selection-index-").toFile()
        }
        return try {
            val environment = mapOf(
                "GIT_INDEX_FILE" to File(temporaryDirectory, "index").absolutePath,
                "GIT_OPTIONAL_LOCKS" to "0",
            )
            val initialized = runGit(
                arguments = listOf("read-tree", baseTree),
                environment = environment,
            )
            if (!initialized.succeeded()) {
                null
            } else {
                val result = runGit(
                    arguments = listOf(
                        "apply",
                        "--cached",
                        "--check",
                        "--whitespace=nowarn",
                        "-",
                    ),
                    environment = environment,
                    stdin = patch,
                )
                if (result.timedOut) null else result.exitCode == 0
            }
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                temporaryDirectory.deleteRecursively()
            }
        }
    }

    private suspend fun runGit(
        arguments: List<String>,
        environment: Map<String, String>,
        stdin: String? = null,
    ): CommandResult = commandRunner.run(
        CommandRequest(
            command = listOf("git") + arguments,
            workingDirectory = normalizedRepositoryRoot,
            stdin = stdin,
            timeout = CHECK_TIMEOUT,
            maxOutputChars = MAX_OUTPUT_CHARS,
            environment = environment,
        )
    )
}

internal fun extractIndividualHunkPatches(
    unifiedDiff: String,
    hunks: List<SwarmArtifactDiffHunk>,
): Map<String, String> = parseHunkPatchEnvelopes(unifiedDiff, hunks).associate { envelope ->
    envelope.hunkId to (envelope.filePrelude + envelope.hunkLines).joinToString("\n", postfix = "\n")
}

internal fun extractSelectedHunkPatch(
    unifiedDiff: String,
    hunks: List<SwarmArtifactDiffHunk>,
    selectedHunkIds: Set<String>,
): String? {
    if (selectedHunkIds.isEmpty()) return null
    val envelopes = parseHunkPatchEnvelopes(unifiedDiff, hunks)
    if (!selectedHunkIds.all(envelopes.mapTo(mutableSetOf()) { it.hunkId }::contains)) return null
    val selected = envelopes.filter { it.hunkId in selectedHunkIds }
    return buildString {
        var currentFileOrdinal: Int? = null
        selected.forEach { envelope ->
            if (currentFileOrdinal != envelope.fileOrdinal) {
                append(envelope.filePrelude.joinToString("\n", postfix = "\n"))
                currentFileOrdinal = envelope.fileOrdinal
            }
            append(envelope.hunkLines.joinToString("\n", postfix = "\n"))
        }
    }.takeIf(String::isNotBlank)
}

private fun parseHunkPatchEnvelopes(
    unifiedDiff: String,
    hunks: List<SwarmArtifactDiffHunk>,
): List<HunkPatchEnvelope> {
    val textHunks = hunks.filter { it.header.startsWith("@@") }
    if (unifiedDiff.isBlank() || textHunks.isEmpty()) return emptyList()
    val envelopes = mutableListOf<HunkPatchEnvelope>()
    var textHunkIndex = 0
    var fileOrdinal = -1
    var filePrelude = mutableListOf<String>()
    var hunkLines: MutableList<String>? = null

    fun flushHunk() {
        val lines = hunkLines ?: return
        hunkLines = null
        val hunk = textHunks.getOrNull(textHunkIndex++) ?: return
        if (lines.firstOrNull() != hunk.header || filePrelude.none { it.startsWith("diff --git ") }) return
        envelopes += HunkPatchEnvelope(
            hunkId = hunk.id,
            fileOrdinal = fileOrdinal,
            filePrelude = filePrelude.toList(),
            hunkLines = lines,
        )
    }

    unifiedDiff.lineSequence().forEach { line ->
        when {
            line.startsWith("diff --git ") -> {
                flushHunk()
                fileOrdinal += 1
                filePrelude = mutableListOf(line)
                hunkLines = null
            }
            line.startsWith("@@") -> {
                flushHunk()
                hunkLines = mutableListOf(line)
            }
            hunkLines != null -> hunkLines?.add(line)
            filePrelude.isNotEmpty() -> filePrelude += line
        }
    }
    flushHunk()
    return envelopes
}

private data class HunkPatchEnvelope(
    val hunkId: String,
    val fileOrdinal: Int,
    val filePrelude: List<String>,
    val hunkLines: List<String>,
)

private fun CommandResult.succeeded(): Boolean = exitCode == 0 && !timedOut

private const val DEFAULT_MAX_CHECKS = 64
private const val MAX_OUTPUT_CHARS = 8 * 1024
private val CHECK_TIMEOUT = 10.seconds
