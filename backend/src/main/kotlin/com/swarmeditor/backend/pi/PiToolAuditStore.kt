package com.swarmeditor.backend.pi

import com.swarmeditor.backend.storage.atomicWriteText
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
enum class PiToolAuditOutcome {
    SUCCEEDED,
    FAILED,
    CANCELED,
}

@Serializable
data class PiToolAuditRecord(
    val schemaVersion: Int = 1,
    val auditId: String,
    val brokerSessionId: String,
    val agentId: String,
    val workspaceHash: String,
    val requestId: String,
    val tool: String,
    val operation: String,
    val argumentsHash: String,
    val startedAtMillis: Long,
    val completedAtMillis: Long,
    val durationMillis: Long,
    val outcome: PiToolAuditOutcome,
    val resultBytes: Int? = null,
    val exitCode: Int? = null,
    val outputTruncated: Boolean = false,
    val errorCategory: String? = null,
)

fun interface PiToolAuditStore {
    suspend fun append(record: PiToolAuditRecord)
}

class FilePiToolAuditStore(
    private val directory: File,
    private val json: Json = Json { prettyPrint = true },
) : PiToolAuditStore {
    private val mutex = Mutex()

    override suspend fun append(record: PiToolAuditRecord) = mutex.withLock {
        require(record.auditId.matches(auditIdPattern)) { "Invalid Pi tool audit id" }
        require(record.brokerSessionId.matches(brokerSessionIdPattern)) { "Invalid Pi tool broker session id" }
        withContext(Dispatchers.IO) {
            val target = File(directory, "${record.auditId}.json")
            check(!target.exists()) { "Pi tool audit record already exists: ${record.auditId}" }
            target.atomicWriteText(json.encodeToString(record))
        }
    }
}

private val auditIdPattern = Regex("audit-[0-9a-f]{32}")
private val brokerSessionIdPattern = Regex("broker-[0-9a-f]{32}")
