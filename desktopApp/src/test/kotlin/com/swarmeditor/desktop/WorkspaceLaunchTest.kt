package com.swarmeditor.desktop

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WorkspaceLaunchTest {
    @Test
    fun `startup project argument resolves an empty project directory exactly`() {
        val project = createTempDirectory("swarm-empty-project").toFile()

        assertEquals(project.absoluteFile.normalize(), startupProjectDirectory(arrayOf(project.absolutePath)))
        assertEquals(null, startupProjectDirectory(emptyArray()))
    }

    @Test
    fun `startup project argument rejects missing directories`() {
        val missing = File(createTempDirectory("swarm-missing-parent").toFile(), "missing")

        assertFailsWith<IllegalArgumentException> {
            startupProjectDirectory(arrayOf(missing.absolutePath))
        }
    }

    @Test
    fun `workspace launch command passes selected directory to executable`() {
        val project = createTempDirectory("swarm-launch-project").toFile()
        val launcher = File(createTempDirectory("swarm-launcher").toFile(), "SwarmEditor").apply {
            writeText("#!/usr/bin/env sh\n")
            setExecutable(true)
        }

        assertEquals(
            listOf(launcher.absolutePath, project.absolutePath),
            workspaceLaunchCommand(project, listOf(launcher)),
        )
    }
}
