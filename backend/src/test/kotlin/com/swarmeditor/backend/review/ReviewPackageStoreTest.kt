package com.swarmeditor.backend.review

import com.swarmeditor.common.model.ReviewPackage
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalTime::class)
class ReviewPackageStoreTest {
    @Test
    fun `persists review packages by canonical project path`() = runTest {
        val directory = Files.createTempDirectory("review-store")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val file = directory.resolve("reviews.json").toFile()
        val reviewPackage = ReviewPackage(
            id = "review-1",
            projectPath = projectRoot.canonicalPath,
            baseRevision = "abc123",
            createdAt = Clock.System.now(),
            updatedAt = Clock.System.now(),
        )

        ReviewPackageStore(file).put(reviewPackage)

        assertEquals(reviewPackage, ReviewPackageStore(file).get(projectRoot))
    }
}
