package com.swarmeditor.desktop.ui.session

import com.swarmeditor.desktop.api.GitCommitDto
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class GitLogToolWindowTest {
    @Test
    fun `git log filter searches metadata with case and regex options`() {
        val commits = listOf(
            commit("a1", "Add feature", "Alice", listOf("HEAD -> main")),
            commit("b2", "Release build", "Bob", listOf("tag: v1")),
        )

        assertEquals(listOf("a1"), filteredGitCommits(commits, "ALICE", caseSensitive = false).map { it.shortHash })
        assertEquals(emptyList(), filteredGitCommits(commits, "ALICE", caseSensitive = true))
        assertEquals(
            listOf("a1", "b2"),
            filteredGitCommits(commits, "feature|release", caseSensitive = false, regex = true).map { it.shortHash },
        )
        assertEquals(listOf("b2"), filteredGitCommits(commits, "v1", caseSensitive = true).map { it.shortHash })
        assertNotNull(gitLogRegexError("[", caseSensitive = false, regex = true))
        assertNull(gitLogRegexError("feature.*", caseSensitive = false, regex = true))
    }

    @Test
    fun `git log timestamp formatting is deterministic for a supplied zone`() {
        assertEquals("2023-11-14 22:13", formatGitCommitTimestamp(1_700_000_000L, ZoneOffset.UTC))
        assertEquals("—", formatGitCommitTimestamp(0L, ZoneOffset.UTC))
    }

    private fun commit(shortHash: String, subject: String, author: String, refs: List<String>) = GitCommitDto(
        hash = shortHash.repeat(8),
        shortHash = shortHash,
        parentHashes = emptyList(),
        authorName = author,
        authorEmail = "${author.lowercase()}@example.com",
        authoredAtEpochSeconds = 1_700_000_000L,
        subject = subject,
        refs = refs,
    )
}
