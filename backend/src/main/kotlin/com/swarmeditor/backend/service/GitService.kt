package com.swarmeditor.backend.service

import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

private val logger = KotlinLogging.logger {}

class GitService(private val projectDir: File) {

    data class GitFileChange(
        val path: String,
        val status: String,
        val hasStagedChanges: Boolean,
        val hasUnstagedChanges: Boolean,
        val isUntracked: Boolean,
        val added: Int,
        val removed: Int,
        val stagedAdded: Int,
        val stagedRemoved: Int,
        val unstagedAdded: Int,
        val unstagedRemoved: Int,
        val diffLines: List<String>,
        val stagedDiffLines: List<String>,
        val unstagedDiffLines: List<String>,
    )

    data class GitStatus(
        val isRepository: Boolean,
        val branch: String,
        val ahead: Int,
        val behind: Int,
        val staged: Int,
        val modified: Int,
        val untracked: Int,
        val changes: List<GitFileChange> = emptyList(),
    )

    data class GitCommit(
        val hash: String,
        val shortHash: String,
        val parentHashes: List<String>,
        val authorName: String,
        val authorEmail: String,
        val authoredAtEpochSeconds: Long,
        val subject: String,
        val refs: List<String>,
    )

    data class GitHistory(
        val commits: List<GitCommit> = emptyList(),
        val truncated: Boolean = false,
    )

    fun getStatus(): GitStatus {
        if (!isGitRepo()) return GitStatus(false, "", 0, 0, 0, 0, 0)

        val changes = parseStatus(runGitRaw("status", "--porcelain=v1", "-z", "--untracked-files=all").bytes)
            .map { it.withDiff() }

        var staged = 0
        var modified = 0
        var untracked = 0
        changes.forEach { change ->
            if (change.isUntracked) untracked++
            if (change.hasStagedChanges) staged++
            if (change.hasUnstagedChanges && !change.isUntracked) modified++
        }

        val aheadBehind = parseAheadBehind()
        val branch = runGit("branch", "--show-current").lines.firstOrNull().orEmpty()
            .ifBlank { runGit("rev-parse", "--short", "HEAD").lines.firstOrNull().orEmpty() }
        return GitStatus(
            isRepository = true,
            branch = branch,
            ahead = aheadBehind.second,
            behind = aheadBehind.first,
            staged = staged,
            modified = modified,
            untracked = untracked,
            changes = changes,
        )
    }

    fun getHistory(maxCommits: Int = DEFAULT_HISTORY_LIMIT): GitHistory {
        require(maxCommits in 1..MAX_HISTORY_LIMIT) { "Git history limit must be between 1 and $MAX_HISTORY_LIMIT" }
        if (!isGitRepo()) return GitHistory()

        val result = runGitRaw(
            "log",
            "--all",
            "--topo-order",
            "--decorate=short",
            "--max-count=${maxCommits + 1}",
            "--pretty=format:%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%ct%x1f%D%x1f%s",
        )
        if (result.exitCode != 0) return GitHistory()

        val commits = parseHistory(result.bytes)
        return GitHistory(
            commits = commits.take(maxCommits),
            truncated = commits.size > maxCommits,
        )
    }

    fun stage(path: String) {
        runGitChecked("add", "--", safeRelativePath(path))
    }

    fun stage(paths: Collection<String>) {
        if (paths.isEmpty()) return
        runGitChecked(*buildList {
            add("add")
            add("--")
            paths.forEach { add(safeRelativePath(it)) }
        }.toTypedArray())
    }

    fun unstage(path: String) {
        val safePath = safeRelativePath(path)
        val result = runGit("restore", "--staged", "--", safePath)
        if (result.exitCode != 0) {
            runGitChecked("rm", "--cached", "--", safePath)
        }
    }

    fun unstage(paths: Collection<String>) {
        paths.forEach(::unstage)
    }

    fun commit(message: String): String {
        val normalizedMessage = message.trim()
        require(normalizedMessage.isNotEmpty()) { "提交信息不能为空" }

        val stagedCheck = runGit("diff", "--cached", "--quiet", "--exit-code")
        check(stagedCheck.exitCode == 1) {
            if (stagedCheck.exitCode == 0) "没有已暂存的变更" else "无法检查已暂存的变更"
        }

        runGitChecked("commit", "--message", normalizedMessage)
        return runGitCheckedWithOutput("rev-parse", "--short", "HEAD").firstOrNull().orEmpty()
    }

    private data class ParsedStatus(
        val path: String,
        val status: String,
        val hasStagedChanges: Boolean,
        val hasUnstagedChanges: Boolean,
        val isUntracked: Boolean,
    )

    private fun parseStatus(output: ByteArray): List<ParsedStatus> {
        val records = output.toString(Charsets.UTF_8).split('\u0000')
        val changes = mutableListOf<ParsedStatus>()
        var index = 0
        while (index < records.size) {
            val record = records[index]
            if (record.length >= 3) {
                parseStatusLine(record)?.let(changes::add)
                val indexStatus = record[0]
                val workTreeStatus = record[1]
                if (indexStatus in "RC" || workTreeStatus in "RC") index++
            }
            index++
        }
        return changes
    }

    private fun parseStatusLine(line: String): ParsedStatus? {
        val indexStatus = line[0]
        val workTreeStatus = line[1]
        val rawPath = line.substring(3)
        val path = rawPath.substringAfterLast(" -> ", rawPath)
        if (path.isBlank()) return null

        val isUntracked = indexStatus == '?' && workTreeStatus == '?'
        val hasStagedChanges = !isUntracked && indexStatus != ' '
        val hasUnstagedChanges = isUntracked || workTreeStatus != ' '
        val status = when {
            isUntracked -> "??"
            'D' in setOf(indexStatus, workTreeStatus) -> "D"
            'A' in setOf(indexStatus, workTreeStatus) -> "A"
            'R' in setOf(indexStatus, workTreeStatus) -> "R"
            else -> "M"
        }
        return ParsedStatus(path, status, hasStagedChanges, hasUnstagedChanges, isUntracked)
    }

    private fun ParsedStatus.withDiff(): GitFileChange {
        val stagedStats = if (hasStagedChanges) numStat(path, cached = true) else 0 to 0
        val unstagedStats = when {
            isUntracked -> untrackedStat(path)
            hasUnstagedChanges -> numStat(path, cached = false)
            else -> 0 to 0
        }
        val stagedLines = if (hasStagedChanges) diffLines(path, cached = true) else emptyList()
        val unstagedLines = when {
            isUntracked -> untrackedDiff(path)
            hasUnstagedChanges -> diffLines(path, cached = false)
            else -> emptyList()
        }
        return GitFileChange(
            path = path,
            status = status,
            hasStagedChanges = hasStagedChanges,
            hasUnstagedChanges = hasUnstagedChanges,
            isUntracked = isUntracked,
            added = stagedStats.first + unstagedStats.first,
            removed = stagedStats.second + unstagedStats.second,
            stagedAdded = stagedStats.first,
            stagedRemoved = stagedStats.second,
            unstagedAdded = unstagedStats.first,
            unstagedRemoved = unstagedStats.second,
            diffLines = (stagedLines + unstagedLines).take(MAX_DIFF_LINES),
            stagedDiffLines = stagedLines,
            unstagedDiffLines = unstagedLines,
        )
    }

    private fun untrackedStat(path: String): Pair<Int, Int> {
        val file = previewableUntrackedFile(path) ?: return 0 to 0
        return try {
            file.bufferedReader().useLines { sequence -> sequence.count() to 0 }
        } catch (_: Exception) {
            0 to 0
        }
    }

    private fun untrackedDiff(path: String): List<String> {
        val file = previewableUntrackedFile(path) ?: return emptyList()
        return try {
            val contentLines = file.bufferedReader().useLines { lines ->
                lines.take(MAX_DIFF_LINES - 1).toList()
            }
            if (contentLines.isEmpty()) emptyList() else buildList {
                add("@@ -0,0 +1,${contentLines.size} @@")
                contentLines.forEach { add("+$it") }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun previewableUntrackedFile(path: String): File? {
        val file = projectDir.toPath().resolve(path).normalize().toFile()
        if (!file.isFile || Files.isSymbolicLink(file.toPath()) || file.length() > MAX_UNTRACKED_READ_BYTES) {
            return null
        }
        return file
    }

    private fun numStat(path: String, cached: Boolean): Pair<Int, Int> {
        val args = buildList {
            add("diff")
            if (cached) add("--cached")
            add("--numstat")
            add("--")
            add(path)
        }
        val line = runGit(*args.toTypedArray()).lines.firstOrNull() ?: return 0 to 0
        val fields = line.split('\t')
        if (fields.size < 2) return 0 to 0
        return fields[0].toIntOrNull().orZero() to fields[1].toIntOrNull().orZero()
    }

    private fun diffLines(path: String, cached: Boolean): List<String> {
        val args = buildList {
            add("diff")
            if (cached) add("--cached")
            add("--unified=2")
            add("--no-ext-diff")
            add("--")
            add(path)
        }
        val lines = runGit(*args.toTypedArray()).lines
        val firstHunk = lines.indexOfFirst { it.startsWith("@@") }
        return if (firstHunk < 0) emptyList() else lines.drop(firstHunk).take(MAX_DIFF_LINES)
    }

    private fun isGitRepo(): Boolean = File(projectDir, ".git").exists()

    private fun parseAheadBehind(): Pair<Int, Int> {
        val result = runGit("rev-list", "--left-right", "--count", "@{upstream}...HEAD")
        val parts = result.lines.firstOrNull()?.trim()?.split(Regex("\\s+")) ?: return 0 to 0
        if (parts.size != 2) return 0 to 0
        return parts[0].toIntOrNull().orZero() to parts[1].toIntOrNull().orZero()
    }

    private fun parseHistory(bytes: ByteArray): List<GitCommit> {
        return bytes.toString(Charsets.UTF_8)
            .split(HISTORY_RECORD_SEPARATOR)
            .asSequence()
            .map { it.trim('\r', '\n') }
            .filter(String::isNotEmpty)
            .mapNotNull { record ->
                val fields = record.split(HISTORY_FIELD_SEPARATOR, limit = 8)
                if (fields.size != 8) return@mapNotNull null
                GitCommit(
                    hash = fields[0],
                    shortHash = fields[1],
                    parentHashes = fields[2].split(' ').filter(String::isNotBlank),
                    authorName = fields[3],
                    authorEmail = fields[4],
                    authoredAtEpochSeconds = fields[5].toLongOrNull() ?: 0L,
                    refs = fields[6].split(',').map(String::trim).filter(String::isNotEmpty),
                    subject = fields[7],
                )
            }
            .toList()
    }

    private fun safeRelativePath(path: String): String {
        val root = projectDir.toPath().toAbsolutePath().normalize()
        val candidate = root.resolve(path).normalize()
        require(candidate.startsWith(root)) { "Git path escapes project directory" }
        return root.relativize(candidate).toString()
    }

    private fun runGitChecked(vararg args: String) {
        val result = runGit(*args)
        check(result.exitCode == 0) {
            result.lines.joinToString(" ").ifBlank { "git ${args.joinToString(" ")} failed" }
        }
    }

    private fun runGitCheckedWithOutput(vararg args: String): List<String> {
        val result = runGit(*args)
        check(result.exitCode == 0) {
            result.lines.joinToString(" ").ifBlank { "git ${args.joinToString(" ")} failed" }
        }
        return result.lines
    }

    private data class GitResult(val exitCode: Int, val lines: List<String>)
    private data class GitRawResult(val exitCode: Int, val bytes: ByteArray)

    private fun runGit(vararg args: String): GitResult {
        return try {
            val process = ProcessBuilder(listOf("git") + args.toList())
                .directory(projectDir)
                .redirectErrorStream(true)
                .start()
            val output = CompletableFuture.supplyAsync {
                process.inputStream.bufferedReader().use { reader ->
                    buildList {
                        reader.forEachLine { line ->
                            if (size < MAX_CAPTURED_OUTPUT_LINES) add(line)
                        }
                    }
                }
            }
            if (!process.waitFor(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                logger.warn { "git ${args.joinToString(" ")} timed out" }
                return GitResult(-1, emptyList())
            }
            GitResult(process.exitValue(), output.get(1, TimeUnit.SECONDS))
        } catch (error: Exception) {
            logger.warn(error) { "git ${args.joinToString(" ")} failed" }
            GitResult(-1, emptyList())
        }
    }

    private fun runGitRaw(vararg args: String): GitRawResult {
        return try {
            val process = ProcessBuilder(listOf("git") + args.toList())
                .directory(projectDir)
                .redirectErrorStream(true)
                .start()
            val output = CompletableFuture.supplyAsync { process.inputStream.readAllBytes() }
            if (!process.waitFor(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                logger.warn { "git ${args.joinToString(" ")} timed out" }
                return GitRawResult(-1, byteArrayOf())
            }
            GitRawResult(process.exitValue(), output.get(1, TimeUnit.SECONDS))
        } catch (error: Exception) {
            logger.warn(error) { "git ${args.joinToString(" ")} failed" }
            GitRawResult(-1, byteArrayOf())
        }
    }

    private fun Int?.orZero(): Int = this ?: 0

    companion object {
        private const val COMMAND_TIMEOUT_SECONDS = 10L
        private const val DEFAULT_HISTORY_LIMIT = 200
        private const val MAX_HISTORY_LIMIT = 500
        private const val HISTORY_RECORD_SEPARATOR = '\u001e'
        private const val HISTORY_FIELD_SEPARATOR = '\u001f'
        private const val MAX_DIFF_LINES = 80
        private const val MAX_CAPTURED_OUTPUT_LINES = 20_000
        private const val MAX_UNTRACKED_READ_BYTES = 1_048_576L
    }
}
