package com.swarmeditor.backend.delivery

import com.swarmeditor.common.model.DeliveryArtifactReference
import com.swarmeditor.common.model.DeliveryRecord
import com.swarmeditor.common.model.DeliveryStatus
import com.swarmeditor.common.model.SwarmArtifactIntegrationStatus
import com.swarmeditor.common.model.SwarmRun
import com.swarmeditor.common.model.SwarmRunStatus

class SwarmDeliveryRecordSynchronizer(
    private val store: DeliveryRecordStore,
) {
    suspend fun synchronize(run: SwarmRun) {
        val deliveryRecordId = run.deliveryRecordId ?: return
        store.update(deliveryRecordId) { record ->
            record.copy(
                status = run.status.toDeliveryStatus(),
                taskAttemptIds = run.tasks.flatMap { task -> task.attemptRecords.map { it.id } }.distinct(),
                sessionIds = run.tasks.flatMap { task -> task.toolBrokerSessionIds }.distinct(),
                toolAuditIds = run.tasks.flatMap { task -> task.toolAuditIds }.distinct(),
                workspaceDeltaEvidenceId = run.tasks
                    .flatMap { task -> task.attemptRecords }
                    .filter { it.workspaceDeltaEvidenceId != null }
                    .maxByOrNull { it.completedAt ?: it.startedAt }
                    ?.workspaceDeltaEvidenceId,
                verificationEvidenceIds = run.tasks
                    .flatMap { task -> task.attemptRecords }
                    .mapNotNull { it.verificationEvidenceId }
                    .distinct(),
                artifact = run.artifactIntegrationPlans.lastOrNull { plan ->
                    plan.status == SwarmArtifactIntegrationStatus.APPLIED
                }?.let { plan ->
                    DeliveryArtifactReference(
                        commitHash = plan.integratedRevision,
                        artifactRevision = plan.artifactRevision,
                    )
                },
                updatedAt = run.updatedAt,
            )
        }
    }
}

private fun SwarmRunStatus.toDeliveryStatus(): DeliveryStatus = when (this) {
    SwarmRunStatus.CREATED -> DeliveryStatus.CREATED
    SwarmRunStatus.RUNNING -> DeliveryStatus.RUNNING
    SwarmRunStatus.SUCCEEDED -> DeliveryStatus.SUCCEEDED
    SwarmRunStatus.FAILED -> DeliveryStatus.FAILED
    SwarmRunStatus.CANCELED -> DeliveryStatus.CANCELED
}
