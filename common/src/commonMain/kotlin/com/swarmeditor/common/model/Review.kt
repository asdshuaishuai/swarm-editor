package com.swarmeditor.common.model

import kotlin.time.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class ReviewCommentSide {
    OLD,
    NEW,
}

@Serializable
enum class ReviewCommentStatus {
    OPEN,
    RESOLVED,
    STALE,
}

@Serializable
data class ReviewComment(
    val schemaVersion: Int = 1,
    val id: String,
    val path: String,
    val baseRevision: String,
    val side: ReviewCommentSide,
    val startLine: Int,
    val endLine: Int? = null,
    val body: String,
    val status: ReviewCommentStatus = ReviewCommentStatus.OPEN,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable
data class ReviewPackage(
    val schemaVersion: Int = 1,
    val id: String,
    val projectPath: String,
    val baseRevision: String,
    val comments: List<ReviewComment> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
    val deliveryRecordId: String? = null,
)
