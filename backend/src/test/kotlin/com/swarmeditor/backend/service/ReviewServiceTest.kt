package com.swarmeditor.backend.service

import com.swarmeditor.backend.activity.ActivityStore
import com.swarmeditor.backend.review.ReviewPackageStore
import com.swarmeditor.common.model.ReviewCommentSide
import com.swarmeditor.common.model.ReviewCommentStatus
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class ReviewServiceTest {
    @Test
    fun `anchors comments to package revision and audits stale transition`() = runTest {
        val directory = Files.createTempDirectory("review-service")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val activityStore = ActivityStore(directory.resolve("activity.json").toFile())
        val service = ReviewService(
            store = ReviewPackageStore(directory.resolve("reviews.json").toFile()),
            activityStore = activityStore,
        )

        service.open(projectRoot, "base-1")
        val comment = service.addComment(
            projectRoot = projectRoot,
            path = "src/Main.kt",
            side = ReviewCommentSide.NEW,
            startLine = 12,
            endLine = 14,
            body = "Please add cancellation handling.",
        )

        assertEquals("base-1", comment.baseRevision)
        assertEquals(ReviewCommentStatus.OPEN, comment.status)

        val stale = service.markStaleForRevision(projectRoot, "base-2")

        assertEquals(listOf(comment.id), stale.map { it.id })
        assertEquals(ReviewCommentStatus.STALE, service.get(projectRoot)!!.comments.single().status)
        assertEquals(3, activityStore.events.value.size)
        assertTrue(activityStore.events.value.last().detail.contains("base-2"))
    }

    @Test
    fun `rejects comments outside the project or with invalid line anchors`() = runTest {
        val directory = Files.createTempDirectory("review-validation")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val service = ReviewService(ReviewPackageStore(directory.resolve("reviews.json").toFile()))
        service.open(projectRoot, "base-1")

        assertFailsWith<IllegalArgumentException> {
            service.addComment(projectRoot, "../secret.txt", ReviewCommentSide.NEW, 1, null, "No")
        }
        assertFailsWith<IllegalArgumentException> {
            service.addComment(projectRoot, "src/Main.kt", ReviewCommentSide.NEW, 0, null, "No")
        }
    }
}
