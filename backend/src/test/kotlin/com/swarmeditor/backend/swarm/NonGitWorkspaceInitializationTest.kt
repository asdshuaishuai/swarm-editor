package com.swarmeditor.backend.swarm

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertFailsWith

class NonGitWorkspaceInitializationTest {
    @Test
    fun `Git backed Swarm services can be constructed for a plain folder`() {
        val project = createTempDirectory("swarm-plain-project").toFile()
        val state = createTempDirectory("swarm-plain-state").toFile()
        val evidenceStore = SwarmEvidenceStore(File(state, "evidence"))
        val snapshotter = GitContentAddressedSnapshotter(project, File(state, "indexes"))

        GitSwarmTaskWorkspaceManager(project, File(state, "worktrees"))
        GitDependencyAwareSwarmTaskBaseRevisionResolver(project, evidenceStore)
        GitSwarmArtifactIntegrator(project, evidenceStore, snapshotter)
        GitWorktreeEvaluationWorkspaceManager(project, File(state, "evaluations"))
    }

    @Test
    fun `Git backed Swarm operations explain how to enable them`() {
        val project = createTempDirectory("swarm-plain-operation").toFile()
        val state = createTempDirectory("swarm-plain-operation-state").toFile()
        val manager = GitSwarmTaskWorkspaceManager(project, File(state, "worktrees"))

        val error = assertFailsWith<IllegalArgumentException> {
            kotlinx.coroutines.test.runTest {
                manager.create("run", "task", 1, "0".repeat(40))
            }
        }
        assertContains(error.message.orEmpty(), "initialize Git")
    }
}
