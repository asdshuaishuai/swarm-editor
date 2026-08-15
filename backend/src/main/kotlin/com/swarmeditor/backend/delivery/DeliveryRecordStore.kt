package com.swarmeditor.backend.delivery

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.isSafePersistedId
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireSafePersistedId
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.DeliveryRecord
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private const val DEFAULT_MAX_FILE_BYTES = 16L * 1024 * 1024

@Serializable
private data class DeliveryRecordFile(
    val records: List<DeliveryRecord> = emptyList(),
)

class DeliveryRecordStore(
    private val file: File,
    private val maxFileBytes: Long = DEFAULT_MAX_FILE_BYTES,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val recordsById = linkedMapOf<String, DeliveryRecord>()
    private val _records = MutableStateFlow<List<DeliveryRecord>>(emptyList())
    private var loaded = false

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    val records: StateFlow<List<DeliveryRecord>> = _records.asStateFlow()

    suspend fun load() = mutex.withLock {
        loadLocked()
    }

    private suspend fun loadLocked() {
        if (loaded) return
        val persisted = withContext(Dispatchers.IO) {
            if (!file.exists()) {
                DeliveryRecordFile()
            } else {
                try {
                    require(file.isFile) { "Delivery record path is not a regular file: ${file.path}" }
                    json.decodeFromString(DeliveryRecordFile.serializer(), file.readBoundedUtf8(maxFileBytes))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    try {
                        file.quarantineCorruptFile()
                    } catch (quarantineError: Throwable) {
                        quarantineError.addSuppressed(error)
                        throw quarantineError
                    }
                    DeliveryRecordFile()
                }
            }
        }
        recordsById.clear()
        persisted.records.forEach { record ->
            if (record.id.isSafePersistedId()) {
                validate(record)
                recordsById[record.id] = record
            }
        }
        loaded = true
        publishLocked()
    }

    suspend fun get(id: String): DeliveryRecord? = mutex.withLock {
        loadIfNeeded()
        recordsById[id]
    }

    suspend fun list(projectPath: String? = null): List<DeliveryRecord> = mutex.withLock {
        loadIfNeeded()
        recordsById.values
            .asSequence()
            .filter { projectPath == null || it.projectPath == projectPath }
            .sortedByDescending(DeliveryRecord::updatedAt)
            .toList()
    }

    suspend fun put(record: DeliveryRecord): DeliveryRecord = mutex.withLock {
        loadIfNeeded()
        validate(record)
        val previous = recordsById.put(record.id, record)
        try {
            persist()
            publishLocked()
            record
        } catch (error: CancellationException) {
            restore(record.id, previous)
            throw error
        } catch (error: Throwable) {
            restore(record.id, previous)
            throw error
        }
    }

    suspend fun update(id: String, transform: (DeliveryRecord) -> DeliveryRecord): DeliveryRecord = mutex.withLock {
        loadIfNeeded()
        val previous = checkNotNull(recordsById[id]) { "Delivery record not found: $id" }
        val updated = transform(previous)
        require(updated.id == previous.id) { "Delivery record id cannot change" }
        validate(updated)
        recordsById[id] = updated
        try {
            persist()
            publishLocked()
            updated
        } catch (error: CancellationException) {
            recordsById[id] = previous
            throw error
        } catch (error: Throwable) {
            recordsById[id] = previous
            throw error
        }
    }

    suspend fun remove(id: String): DeliveryRecord? = mutex.withLock {
        loadIfNeeded()
        val previous = recordsById.remove(id) ?: return@withLock null
        try {
            persist()
            publishLocked()
            previous
        } catch (error: CancellationException) {
            recordsById[id] = previous
            throw error
        } catch (error: Throwable) {
            recordsById[id] = previous
            throw error
        }
    }

    private suspend fun loadIfNeeded() {
        if (!loaded) loadLocked()
    }

    private suspend fun persist() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            DeliveryRecordFile.serializer(),
            DeliveryRecordFile(recordsById.values.sortedBy(DeliveryRecord::id)),
        ).requireUtf8Size(maxFileBytes, "Delivery record data")
        file.atomicWriteText(content)
    }

    private fun restore(id: String, previous: DeliveryRecord?) {
        if (previous == null) recordsById.remove(id) else recordsById[id] = previous
        publishLocked()
    }

    private fun publishLocked() {
        _records.value = recordsById.values.sortedByDescending(DeliveryRecord::updatedAt)
    }

    private fun validate(record: DeliveryRecord) {
        requireSafePersistedId(record.id)
        require(record.projectPath.isNotBlank()) { "Delivery project path cannot be blank" }
        require(record.admission.policyId.isNotBlank()) { "Delivery admission policy id cannot be blank" }
        require(record.admission.policyVersion.isNotBlank()) {
            "Delivery admission policy version cannot be blank"
        }
        require(record.updatedAt >= record.createdAt) { "Delivery updatedAt cannot precede createdAt" }
        record.workspace?.let { workspace ->
            require(workspace.projectPath.isNotBlank()) { "Delivery workspace project path cannot be blank" }
        }
    }
}
