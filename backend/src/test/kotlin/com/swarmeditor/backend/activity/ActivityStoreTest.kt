package com.swarmeditor.backend.activity

import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.ContentBlock
import com.swarmeditor.common.model.Message
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Session
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class ActivityStoreTest {
    @Test
    fun `events persist reload and stay bounded`() = runTest {
        val directory = Files.createTempDirectory("activity-store-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            val store = ActivityStore(file, maxEvents = 2)

            store.append(event("one", "session-1"))
            store.append(event("two", "session-2"))
            store.append(event("three", "session-1"))

            assertEquals(listOf("two", "three"), store.events.value.map { it.id })

            val reloaded = ActivityStore(file, maxEvents = 2)
            reloaded.load()

            assertEquals(store.events.value, reloaded.events.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `empty store seeds message history without content guessing`() = runTest {
        val directory = Files.createTempDirectory("activity-seed-test").toFile()
        try {
            val store = ActivityStore(directory.resolve("activity.json"))
            val timestamp = Instant.parse("2026-07-20T12:00:00Z")
            val session = Session(
                id = "session-1",
                agentId = "pi-default",
                title = "History",
                createdAt = timestamp,
                updatedAt = timestamp,
                messages = listOf(
                    Message("message-1", MessageRole.USER, listOf(ContentBlock(text = "run gradlew")), timestamp)
                ),
            )

            store.seedFromSessions(listOf(session))

            val event = store.events.value.single()
            assertEquals(ActivityType.MESSAGE, event.type)
            assertEquals("用户", event.actor)
            assertEquals("run gradlew", event.detail)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `loads legacy ISO instant strings`() = runTest {
        val directory = Files.createTempDirectory("activity-legacy-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            file.writeText(
                """
                {
                  "events": [
                    {
                      "id": "legacy-event",
                      "sessionId": "legacy-session",
                      "timestamp": "2026-07-20T12:00:00Z",
                      "actor": "Pi",
                      "action": "恢复"
                    }
                  ]
                }
                """.trimIndent()
            )

            val store = ActivityStore(file)
            store.load()

            assertEquals(Instant.parse("2026-07-20T12:00:00Z"), store.events.value.single().timestamp)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `malformed activity file is quarantined without replacing in memory events`() = runTest {
        val directory = Files.createTempDirectory("activity-corrupt-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            val store = ActivityStore(file)
            store.append(event("existing", "session-1"))
            val malformed = "{ not-json"
            file.writeText(malformed)

            store.load()

            assertEquals(listOf("existing"), store.events.value.map { it.id })
            assertFalse(file.exists())
            val quarantine = directory.listFiles().orEmpty().single { it.name.startsWith("activity.json.corrupt-") }
            assertEquals(malformed, quarantine.readText())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `invalid utf8 activity file is quarantined`() = runTest {
        val directory = Files.createTempDirectory("activity-utf8-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            file.writeBytes(byteArrayOf('{'.code.toByte(), '"'.code.toByte(), 0xC3.toByte(), 0x28, '"'.code.toByte()))

            val store = ActivityStore(file)
            store.load()

            assertTrue(store.events.value.isEmpty())
            assertFalse(file.exists())
            assertEquals(1, directory.listFiles().orEmpty().count { it.name.startsWith("activity.json.corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `quarantined startup file can be rebuilt from session history`() = runTest {
        val directory = Files.createTempDirectory("activity-rebuild-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            file.writeText("not-json")
            val timestamp = Instant.parse("2026-07-20T12:00:00Z")
            val session = Session(
                id = "session-1",
                agentId = "pi-default",
                title = "History",
                createdAt = timestamp,
                updatedAt = timestamp,
                messages = listOf(
                    Message("message-1", MessageRole.ASSISTANT, listOf(ContentBlock(text = "Recovered")), timestamp)
                ),
            )
            val store = ActivityStore(file)

            store.load()
            store.seedFromSessions(listOf(session))

            assertTrue(file.isFile)
            assertEquals("Recovered", store.events.value.single().detail)
            assertEquals(1, directory.listFiles().orEmpty().count { it.name.startsWith("activity.json.corrupt-") })
            val reloaded = ActivityStore(file).also { it.load() }
            assertEquals(store.events.value, reloaded.events.value)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `load compacts persisted history to the configured bound`() = runTest {
        val directory = Files.createTempDirectory("activity-compact-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            val writer = ActivityStore(file, maxEvents = 3)
            writer.append(event("one", "session-1"))
            writer.append(event("two", "session-1"))
            writer.append(event("three", "session-1"))

            ActivityStore(file, maxEvents = 2).load()
            val reloaded = ActivityStore(file, maxEvents = 10).also { it.load() }

            assertEquals(listOf("two", "three"), reloaded.events.value.map { it.id })
            assertFalse("\"id\": \"one\"" in file.readText())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `oversized append rolls back memory and does not create a file`() = runTest {
        val directory = Files.createTempDirectory("activity-size-test").toFile()
        try {
            val file = directory.resolve("activity.json")
            val store = ActivityStore(file, maxFileBytes = 400)

            assertFailsWith<IllegalArgumentException> {
                store.append(event("large", "session-1", detail = "x".repeat(1_000)))
            }

            assertTrue(store.events.value.isEmpty())
            assertFalse(file.exists())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `invalid activity bounds are rejected`() {
        val directory = Files.createTempDirectory("activity-bounds-test").toFile()
        try {
            val file = directory.resolve("activity.json")

            assertFailsWith<IllegalArgumentException> { ActivityStore(file, maxEvents = 0) }
            assertFailsWith<IllegalArgumentException> { ActivityStore(file, maxFileBytes = 0) }
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun event(id: String, sessionId: String, detail: String = "") = ActivityEvent(
        id = id,
        sessionId = sessionId,
        timestamp = Instant.parse("2026-07-20T12:00:00Z"),
        actor = "Pi",
        action = "测试",
        detail = detail,
        type = ActivityType.SESSION,
    )
}
