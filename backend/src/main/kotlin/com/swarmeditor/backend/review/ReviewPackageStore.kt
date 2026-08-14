package com.swarmeditor.backend.review

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.backend.storage.quarantineCorruptFile
import com.swarmeditor.backend.storage.readBoundedUtf8
import com.swarmeditor.backend.storage.requireUtf8Size
import com.swarmeditor.common.model.ReviewPackage
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val reviewStoreLog = KotlinLogging.logger {}

@Serializable
private data class ReviewPackageFile(
    val packages: List<ReviewPackage> = emptyList(),
)

class ReviewPackageStore(
    private val file: File,
    private val maxFileBytes: Long = 4L * 1024 * 1024,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val packages = linkedMapOf<String, ReviewPackage>()
    private var loaded = false

    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun get(projectRoot: File): ReviewPackage? = mutex.withLock {
        loadIfNeeded()
        packages[canonicalPath(projectRoot)]
    }

    suspend fun put(reviewPackage: ReviewPackage) = mutex.withLock {
        loadIfNeeded()
        val previous = packages.put(reviewPackage.projectPath, reviewPackage)
        try {
            persist()
        } catch (error: CancellationException) {
            restore(reviewPackage.projectPath, previous)
            throw error
        } catch (error: Throwable) {
            restore(reviewPackage.projectPath, previous)
            throw error
        }
    }

    suspend fun remove(projectRoot: File) = mutex.withLock {
        loadIfNeeded()
        val projectPath = canonicalPath(projectRoot)
        val previous = packages.remove(projectPath) ?: return@withLock
        try {
            persist()
        } catch (error: CancellationException) {
            packages[projectPath] = previous
            throw error
        } catch (error: Throwable) {
            packages[projectPath] = previous
            throw error
        }
    }

    private suspend fun loadIfNeeded() {
        if (loaded) return
        val persisted = withContext(Dispatchers.IO) {
            if (!file.exists()) {
                ReviewPackageFile()
            } else {
                try {
                    require(file.isFile) { "Review package path is not a regular file: ${file.path}" }
                    json.decodeFromString(ReviewPackageFile.serializer(), file.readBoundedUtf8(maxFileBytes))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    val quarantined = try {
                        file.quarantineCorruptFile()
                    } catch (quarantineError: Throwable) {
                        quarantineError.addSuppressed(error)
                        throw quarantineError
                    }
                    reviewStoreLog.warn {
                        "Quarantined unreadable review packages from ${file.path} to ${quarantined.path}: ${error.message}"
                    }
                    ReviewPackageFile()
                }
            }
        }
        packages.clear()
        persisted.packages.forEach { packages[it.projectPath] = it }
        loaded = true
    }

    private suspend fun persist() = withContext(Dispatchers.IO) {
        val content = json.encodeToString(
            ReviewPackageFile.serializer(),
            ReviewPackageFile(packages.values.sortedBy(ReviewPackage::projectPath)),
        ).requireUtf8Size(maxFileBytes, "Review package data")
        file.atomicWriteText(content)
    }

    private fun restore(projectPath: String, previous: ReviewPackage?) {
        if (previous == null) packages.remove(projectPath) else packages[projectPath] = previous
    }

    private fun canonicalPath(projectRoot: File): String = projectRoot.canonicalFile.absolutePath
}
