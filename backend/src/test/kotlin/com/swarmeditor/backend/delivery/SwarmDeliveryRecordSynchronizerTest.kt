package com.swarmeditor.backend.delivery

import com.swarmeditor.common.model.DeliveryAdmission
import com.swarmeditor.common.model.DeliveryRecord
import com.swarmeditor.common.model.DeliveryStatus
import com.swarmeditor.common.model.DeliveryTrigger
import com.swarmeditor.common.model.DeliveryTriggerKind
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus
import com.swarmeditor.common.model.SwarmTask
import com.swarmeditor.common.model.SwarmTaskAttemptOutcome
import com.swarmeditor.common.model.SwarmTaskAttemptRecord
import java.nio.file.Files
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Clock
import kotlinx.coroutines.test.runTest

class SwarmDeliveryRecordSynchronizerTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `synchronizes terminal swarm state and evidence references`() = runTest {
        val directory = Files.createTempDirectory("swarm-delivery-sync")
        try {
            val timestamp = Clock.System.now()
            val store = DeliveryRecordStore(directory.resolve("delivery.json").toFile())
            store.put(
                DeliveryRecord(
                    id = "delivery-run-1",
                    projectPath = "/tmp/project",
                    trigger = DeliveryTrigger(DeliveryTriggerKind.SWARM, sourceId = "run-1"),
                    admission = DeliveryAdmission(true, "swarm-create", "1"),
                    createdAt = timestamp,
                    updatedAt = timestamp,
                ),
            )
            val run = SwarmRun(
                id = "run-1",
                title = "Run",
                objective = "Deliver",
                createdAt = timestamp,
                updatedAt = timestamp,
                status = SwarmRunStatus.SUCCEEDED,
                deliveryRecordId = "delivery-run-1",
                tasks = listOf(
                    SwarmTask(
                        id = "task",
                        title = "Task",
                        prompt = "Execute",
                        toolBrokerSessionIds = listOf("broker-1"),
                        toolAuditIds = listOf("audit-1"),
                        attemptRecords = listOf(
                            SwarmTaskAttemptRecord(
                                id = "attempt-1",
                                schedulingDecisionId = "decision-1",
                                attempt = 1,
                                outcome = SwarmTaskAttemptOutcome.SUCCEEDED,
                                startedAt = timestamp,
                                workspaceDeltaEvidenceId = "workspace-1",
                                verificationEvidenceId = "verification-1",
                            ),
                        ),
                    ),
                ),
            )

            SwarmDeliveryRecordSynchronizer(store).synchronize(run)

            val record = store.get("delivery-run-1")!!
            assertEquals(DeliveryStatus.SUCCEEDED, record.status)
            assertEquals(listOf("attempt-1"), record.taskAttemptIds)
            assertEquals(listOf("broker-1"), record.sessionIds)
            assertEquals(listOf("audit-1"), record.toolAuditIds)
            assertEquals("workspace-1", record.workspaceDeltaEvidenceId)
            assertEquals(listOf("verification-1"), record.verificationEvidenceIds)
        } finally {
            directory.deleteRecursively()
        }
    }
}
