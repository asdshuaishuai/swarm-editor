package com.swarmeditor.backend.delivery

import com.swarmeditor.common.model.DeliveryAdmission
import com.swarmeditor.common.model.DeliveryRecord
import com.swarmeditor.common.model.DeliveryStatus
import com.swarmeditor.common.model.DeliveryTrigger
import com.swarmeditor.common.model.DeliveryTriggerKind
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest

class DeliveryRecordStoreTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `delivery records persist and reload with stable ordering`() = runTest {
        val directory = Files.createTempDirectory("delivery-record-store")
        try {
            val file = directory.resolve("delivery.json").toFile()
            val timestamp = Clock.System.now()
            val store = DeliveryRecordStore(file)
            val older = record("delivery-older", timestamp)
            val newer = record("delivery-newer", timestamp.plus(1.seconds))

            store.put(older)
            store.put(newer)

            val reloaded = DeliveryRecordStore(file).also { it.load() }

            assertEquals(listOf("delivery-newer", "delivery-older"), reloaded.records.value.map(DeliveryRecord::id))
            assertEquals(newer, reloaded.get("delivery-newer"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `delivery record update rolls back memory and disk when serialization exceeds limit`() = runTest {
        val directory = Files.createTempDirectory("delivery-record-store-size")
        try {
            val file = directory.resolve("delivery.json").toFile()
            val timestamp = Clock.System.now()
            val store = DeliveryRecordStore(file, maxFileBytes = 2_000)
            val original = record("delivery-size", timestamp)
            store.put(original)

            assertFailsWith<IllegalArgumentException> {
                store.update(original.id) { it.copy(residualRisk = listOf("risk".repeat(2_000))) }
            }

            assertEquals(original, store.get(original.id))
            assertTrue(file.readText().contains("delivery-size"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `delivery store quarantines malformed records`() = runTest {
        val directory = Files.createTempDirectory("delivery-record-store-corrupt")
        try {
            val file = directory.resolve("delivery.json").toFile().apply { writeText("not-json") }
            val store = DeliveryRecordStore(file)

            store.load()

            assertTrue(store.records.value.isEmpty())
            assertFalse(file.exists())
            assertEquals(
                1,
                directory.toFile().listFiles().orEmpty().count { it.name.startsWith("delivery.json.corrupt-") },
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun record(id: String, timestamp: Instant): DeliveryRecord = DeliveryRecord(
        id = id,
        projectPath = "/tmp/project",
        trigger = DeliveryTrigger(DeliveryTriggerKind.SWARM, sourceId = "run-1"),
        admission = DeliveryAdmission(true, "swarm-create", "1"),
        status = DeliveryStatus.CREATED,
        createdAt = timestamp,
        updatedAt = timestamp,
    )
}
