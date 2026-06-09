package com.swarmeditor.backend.service

import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File

private val logger = KotlinLogging.logger {}

class GitService(private val projectDir: File) {

    data class GitStatus(
        val branch: String,
        val ahead: Int,
        val behind: Int,
        val staged: Int,
        val modified: Int,
        val untracked: Int,
    )

    fun getStatus(): GitStatus {
        if (!isGitRepo()) {
            return GitStatus(branch = "", ahead = 0, behind = 0, staged = 0, modified = 0, untracked = 0)
        }

        val branch = runGit("branch", "--show-current").firstOrNull() ?: ""
        val aheadBehind = parseAheadBehind()
        val porcelain = runGit("status", "--porcelain")

        var staged = 0
        var modified = 0
        var untracked = 0

        for (line in porcelain) {
            if (line.length < 4) continue
            val indexStatus = line[0]
            val workTreeStatus = line[1]
            when {
                indexStatus in listOf('M', 'A', 'D', 'R', 'C') -> staged++
                workTreeStatus == '?' -> untracked++
                workTreeStatus in listOf('M', 'D') -> modified++
            }
        }

        return GitStatus(
            branch = branch,
            ahead = aheadBehind.first,
            behind = aheadBehind.second,
            staged = staged,
            modified = modified,
            untracked = untracked,
        )
    }

    private fun isGitRepo(): Boolean {
        return File(projectDir, ".git").exists()
    }

    private fun parseAheadBehind(): Pair<Int, Int> {
        val output = runGit("rev-list", "--left-right", "--count", "@{upstream}...HEAD")
        if (output.isEmpty()) return Pair(0, 0)
        val parts = output.first().trim().split(Regex("\\s+"))
        if (parts.size != 2) return Pair(0, 0)
        return try {
            Pair(parts[0].toInt(), parts[1].toInt())
        } catch (_: NumberFormatException) {
            Pair(0, 0)
        }
    }

    private fun runGit(vararg args: String): List<String> {
        return try {
            val process = ProcessBuilder(listOf("git") + args.toList())
                .directory(projectDir)
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.bufferedReader().readLines()
            process.waitFor()
            output
        } catch (e: Exception) {
            logger.warn(e) { "git ${args.joinToString(" ")} failed" }
            emptyList()
        }
    }
}
