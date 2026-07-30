package com.swarmeditor.backend.storage

import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PersistedIdsTest {
    @Test
    fun `accepts portable persisted identifiers`() {
        listOf("a", "session-123", "run_1.2", "ABC.def-ghi_jkl").forEach { id ->
            assertTrue(id.isSafePersistedId(), id)
        }
    }

    @Test
    fun `rejects traversal blank dot and reserved identifiers`() {
        listOf(
            "",
            " ",
            ".",
            "..",
            "../escape",
            "/absolute",
            "a/b",
            "a\\b",
            "CON",
            "con.session",
            "NUL",
            "COM1",
            "LPT9.log",
        ).forEach { id ->
            assertFalse(id.isSafePersistedId(), id)
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `resolves json files only inside the persistence directory`() {
        val directory = Files.createTempDirectory("persisted-id-path")
        try {
            val target = directory.toFile().persistedJsonFile("session-123")

            assertEquals(directory.resolve("session-123.json").toFile(), target)
            assertFailsWith<IllegalArgumentException> {
                directory.toFile().persistedJsonFile("../escape")
            }
        } finally {
            directory.deleteRecursively()
        }
    }
}
