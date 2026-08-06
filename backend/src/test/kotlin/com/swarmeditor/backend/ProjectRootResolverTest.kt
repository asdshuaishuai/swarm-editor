package com.swarmeditor.backend

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals

class ProjectRootResolverTest {
    @Test
    fun `explicit project root is preserved inside another git repository`() {
        val repository = createTempDirectory("swarm-parent-repository").toFile()
        File(repository, ".git").mkdir()
        val project = File(repository, "empty-project").apply { mkdir() }

        assertEquals(project.absoluteFile.normalize(), resolveProjectRoot(project.absolutePath, repository.absolutePath))
    }

    @Test
    fun `working directory still discovers its git repository root`() {
        val repository = createTempDirectory("swarm-repository").toFile()
        File(repository, ".git").mkdir()
        val nested = File(repository, "a/b").apply { mkdirs() }

        assertEquals(repository.absoluteFile.normalize(), resolveProjectRoot(null, nested.absolutePath))
    }
}
