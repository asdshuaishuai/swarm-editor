package com.swarmeditor.desktop.ui.session

import com.swarmeditor.desktop.api.GitFileChangeDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GitChangesToolWindowTest {
    @Test
    fun `directory grouping compacts single child paths and preserves hierarchy`() {
        val changes = listOf(
            change("src/main/kotlin/App.kt"),
            change("src/main/kotlin/Utils.kt"),
            change("docs/Guide.md"),
            change("README.md"),
        )

        val entries = gitChangeTreeEntries(changes, GitChangesGrouping.DIRECTORY)

        assertEquals(
            listOf("docs", "Guide.md", "src/main/kotlin", "App.kt", "Utils.kt", "README.md"),
            entries.map { entry ->
                when (entry) {
                    is GitChangeTreeEntry.Directory -> entry.label
                    is GitChangeTreeEntry.File -> entry.change.path.substringAfterLast('/')
                }
            },
        )
        assertEquals(2, (entries[2] as GitChangeTreeEntry.Directory).changeCount)
        assertEquals(1, (entries[3] as GitChangeTreeEntry.File).depth)
        assertFalse((entries[3] as GitChangeTreeEntry.File).showParentPath)
    }

    @Test
    fun `collapsed directory removes only its descendants`() {
        val changes = listOf(
            change("src/main/kotlin/App.kt"),
            change("src/main/kotlin/Utils.kt"),
            change("README.md"),
        )

        val entries = gitChangeTreeEntries(
            changes = changes,
            grouping = GitChangesGrouping.DIRECTORY,
            collapsedDirectories = setOf("src/main/kotlin"),
        )

        assertEquals(2, entries.size)
        assertTrue(entries.first() is GitChangeTreeEntry.Directory)
        assertEquals("README.md", (entries.last() as GitChangeTreeEntry.File).change.path.substringAfterLast('/'))
    }

    @Test
    fun `flat grouping sorts names and exposes parent paths`() {
        val entries = gitChangeTreeEntries(
            changes = listOf(change("z/Utils.kt"), change("src/App.kt"), change("docs/Guide.md")),
            grouping = GitChangesGrouping.FLAT,
        ).map { it as GitChangeTreeEntry.File }

        assertEquals(
            listOf("App.kt", "Guide.md", "Utils.kt"),
            entries.map { it.change.path.substringAfterLast('/') },
        )
        assertTrue(entries.all(GitChangeTreeEntry.File::showParentPath))
        assertTrue(entries.all { it.depth == 0 })
    }

    private fun change(path: String) = GitFileChangeDto(
        path = path,
        status = "M",
        hasStagedChanges = false,
        hasUnstagedChanges = true,
        isUntracked = false,
        added = 1,
        removed = 0,
    )
}
