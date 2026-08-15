package com.swarmeditor.common.model

import kotlinx.serialization.Serializable

@Serializable
enum class ContextEvidenceKind {
    TEXT_MATCH,
    SOURCE_SYMBOL,
    SPEC_NODE,
    SPEC_DIAGNOSTIC,
}

@Serializable
enum class ContextEvidenceSource {
    PROJECT_SEARCH,
    LSP,
    SPEC_GRAPH,
}

@Serializable
data class ContextEvidence(
    val schemaVersion: Int = 1,
    val id: String,
    val kind: ContextEvidenceKind,
    val source: ContextEvidenceSource,
    val path: String? = null,
    val line: Int? = null,
    val endLine: Int? = null,
    val startCharacter: Int? = null,
    val endCharacter: Int? = null,
    val summary: String,
    val excerpt: String? = null,
    val confidence: Double,
    val truncated: Boolean = false,
    val queryFingerprint: String,
)

@Serializable
data class ContextEvidenceBundle(
    val schemaVersion: Int = 1,
    val query: String,
    val queryFingerprint: String,
    val pathPrefix: String? = null,
    val evidence: List<ContextEvidence> = emptyList(),
    val truncated: Boolean = false,
    val retryBudget: Int = 0,
    val retryCount: Int = 0,
    val broadSearchRetried: Boolean = false,
)
