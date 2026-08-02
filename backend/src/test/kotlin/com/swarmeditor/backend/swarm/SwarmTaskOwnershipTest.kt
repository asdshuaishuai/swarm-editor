package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTask
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SwarmTaskOwnershipTest {
    @Test
    fun `glob prefixes conservatively detect overlapping ownership`() {
        assertTrue(ownershipScopesOverlap("backend/**", "backend/src/main/*.kt"))
        assertFalse(ownershipScopesOverlap("backend/**", "desktopApp/**"))
        assertFalse(ownershipScopesOverlap("backend/A.kt", "backend/B.kt"))
    }

    @Test
    fun `write ownership conflicts with another task read scope`() {
        val writer = task("writer", writePaths = listOf("backend/src/**"))
        val reader = task("reader", readPaths = listOf("backend/**"))

        val conflict = assertNotNull(findOwnershipConflict(writer, reader))

        assertEquals("write/read", conflict.access)
    }

    @Test
    fun `ownership paths cannot escape the repository`() {
        assertFailsWith<IllegalArgumentException> { validateOwnershipScope("../outside.kt") }
        assertFailsWith<IllegalArgumentException> { validateOwnershipScope("/etc/passwd") }
        assertFailsWith<IllegalArgumentException> { validateOwnershipScope("C:/outside.kt") }
    }

    private fun task(
        id: String,
        readPaths: List<String> = emptyList(),
        writePaths: List<String> = emptyList(),
    ) = SwarmTask(
        id = id,
        title = id,
        prompt = id,
        readPaths = readPaths,
        writePaths = writePaths,
    )
}
