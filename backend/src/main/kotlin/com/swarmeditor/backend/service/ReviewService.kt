package com.swarmeditor.backend.service

import com.swarmeditor.backend.activity.ActivityStore
import com.swarmeditor.backend.review.ReviewPackageStore
import com.swarmeditor.common.model.ActivityEvent
import com.swarmeditor.common.model.ActivityType
import com.swarmeditor.common.model.ReviewComment
import com.swarmeditor.common.model.ReviewCommentSide
import com.swarmeditor.common.model.ReviewCommentStatus
import com.swarmeditor.common.model.ReviewPackage
import java.io.File
import java.util.UUID
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@OptIn(ExperimentalTime::class)
class ReviewService(
    private val store: ReviewPackageStore,
    private val activityStore: ActivityStore? = null,
    private val clock: Clock = Clock.System,
) {
    private val mutex = Mutex()

    suspend fun get(projectRoot: File): ReviewPackage? = store.get(projectRoot)

    suspend fun open(projectRoot: File, baseRevision: String): ReviewPackage = mutex.withLock {
        require(baseRevision.isNotBlank()) { "baseRevision must not be blank" }
        val existing = store.get(projectRoot)
        if (existing != null) return@withLock existing
        val now = clock.now()
        ReviewPackage(
            id = "review-${UUID.randomUUID()}",
            projectPath = projectRoot.canonicalFile.absolutePath,
            baseRevision = baseRevision,
            createdAt = now,
            updatedAt = now,
        ).also {
            store.put(it)
            record(it, "创建审查包", "${it.baseRevision} · ${it.projectPath}")
        }
    }

    suspend fun addComment(
        projectRoot: File,
        path: String,
        side: ReviewCommentSide,
        startLine: Int,
        endLine: Int?,
        body: String,
    ): ReviewComment = mutex.withLock {
        val reviewPackage = requireNotNull(store.get(projectRoot)) { "Review package not found" }
        validateAnchor(path, startLine, endLine, body)
        val now = clock.now()
        val comment = ReviewComment(
            id = "comment-${UUID.randomUUID()}",
            path = path,
            baseRevision = reviewPackage.baseRevision,
            side = side,
            startLine = startLine,
            endLine = endLine,
            body = body.trim(),
            createdAt = now,
            updatedAt = now,
        )
        store.put(reviewPackage.copy(comments = reviewPackage.comments + comment, updatedAt = now))
        record(reviewPackage, "添加审查评论", "${comment.path}:${comment.startLine}")
        comment
    }

    suspend fun setStatus(
        projectRoot: File,
        commentId: String,
        status: ReviewCommentStatus,
    ): ReviewComment = mutex.withLock {
        val reviewPackage = requireNotNull(store.get(projectRoot)) { "Review package not found" }
        val now = clock.now()
        val current = requireNotNull(reviewPackage.comments.firstOrNull { it.id == commentId }) {
            "Review comment not found"
        }
        val updated = current.copy(status = status, updatedAt = now)
        store.put(
            reviewPackage.copy(
                comments = reviewPackage.comments.map { if (it.id == commentId) updated else it },
                updatedAt = now,
            ),
        )
        record(reviewPackage, "更新审查评论", "${commentId.take(32)} · ${status.name}")
        updated
    }

    suspend fun markStaleForRevision(projectRoot: File, currentRevision: String): List<ReviewComment> = mutex.withLock {
        require(currentRevision.isNotBlank()) { "currentRevision must not be blank" }
        val reviewPackage = requireNotNull(store.get(projectRoot)) { "Review package not found" }
        val now = clock.now()
        val updated = reviewPackage.comments.map { comment ->
            if (comment.baseRevision != currentRevision && comment.status != ReviewCommentStatus.STALE) {
                comment.copy(status = ReviewCommentStatus.STALE, updatedAt = now)
            } else {
                comment
            }
        }
        val stale = updated.filter { it.status == ReviewCommentStatus.STALE }
        if (updated != reviewPackage.comments) {
            store.put(reviewPackage.copy(comments = updated, updatedAt = now))
            record(reviewPackage, "标记审查评论过期", "${stale.size} 条 · 当前 revision ${currentRevision.take(32)}")
        }
        stale
    }

    private fun validateAnchor(path: String, startLine: Int, endLine: Int?, body: String) {
        require(path.isNotBlank()) { "path must not be blank" }
        val normalized = path.replace('\\', '/')
        require(!normalized.startsWith('/') && normalized != "." && !normalized.split('/').contains("..")) {
            "path must be project-relative"
        }
        require(startLine > 0) { "startLine must be positive" }
        require(endLine == null || endLine >= startLine) { "endLine must not precede startLine" }
        require(body.isNotBlank()) { "body must not be blank" }
        require(body.length <= 20_000) { "body exceeds 20000 characters" }
    }

    private suspend fun record(reviewPackage: ReviewPackage, action: String, detail: String) {
        val activityStore = activityStore ?: return
        try {
            activityStore.append(
                ActivityEvent(
                    id = "review-${UUID.randomUUID()}",
                    sessionId = "review:${reviewPackage.id}",
                    timestamp = clock.now(),
                    actor = "用户",
                    action = action,
                    detail = detail,
                    type = ActivityType.FILE,
                ),
            )
        } catch (error: CancellationException) {
            throw error
        }
    }
}
