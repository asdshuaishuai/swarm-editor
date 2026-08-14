package com.swarmeditor.backend.workspace

import com.swarmeditor.common.model.ProjectWorkspace
import com.swarmeditor.common.model.ProjectWorkspaceKind
import com.swarmeditor.common.model.ProjectWorkspaceState
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalTime::class)
class WorkspaceStoreTest {
    @Test
    fun `persists workspace state keyed by canonical project path`() = runTest {
        val directory = Files.createTempDirectory("workspace-store")
        val projectRoot = directory.resolve("project").toFile().apply { mkdirs() }
        val now = Clock.System.now()
        val workspace = ProjectWorkspace(
            id = "default",
            projectPath = projectRoot.canonicalPath,
            cwd = projectRoot.canonicalPath,
            kind = ProjectWorkspaceKind.DEFAULT,
            createdAt = now,
            updatedAt = now,
        )
        val state = ProjectWorkspaceState(
            projectPath = projectRoot.canonicalPath,
            activeWorkspaceId = workspace.id,
            workspaces = listOf(workspace),
            updatedAt = now,
        )
        val file = directory.resolve("workspaces.json").toFile()

        WorkspaceStore(file).put(state)

        assertEquals(state, WorkspaceStore(file).get(projectRoot.canonicalFile.path))
    }
}
