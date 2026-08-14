package com.swarmeditor.common.model

import kotlin.time.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class ProjectWorkspaceKind {
    DEFAULT,
    MANAGED_WORKTREE,
    ATTACHED_WORKTREE,
}

@Serializable
data class ProjectWorkspace(
    val id: String,
    val projectPath: String,
    val cwd: String,
    val branch: String? = null,
    val kind: ProjectWorkspaceKind,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable
data class ProjectWorkspaceState(
    val schemaVersion: Int = 1,
    val projectPath: String,
    val activeWorkspaceId: String,
    val workspaces: List<ProjectWorkspace>,
    val updatedAt: Instant,
)
