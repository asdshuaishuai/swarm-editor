package com.swarmeditor.desktop

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

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

    @Test
    fun `workspace launch command falls back to current JVM in development`() {
        val project = createTempDirectory("swarm-java-launch-project").toFile()
        val javaHome = createTempDirectory("swarm-java-home").toFile()
        val java = File(javaHome, "bin/java").apply {
            parentFile.mkdirs()
            writeText("#!/usr/bin/env sh\n")
            setExecutable(true)
        }
        val prefix = defaultJavaWorkspaceLaunchPrefix(
            javaHome = javaHome.absolutePath,
            classPath = "desktop.jar:backend.jar",
            osName = "Linux",
            propertyValue = { name -> if (name == "skiko.library.path") "/tmp/skiko" else null },
        )

        assertEquals(
            listOf(
                java.absolutePath,
                "-Dskiko.library.path=/tmp/skiko",
                "-cp",
                "desktop.jar:backend.jar",
                "com.swarmeditor.desktop.MainKt",
                project.absolutePath,
            ),
            workspaceLaunchCommand(project, candidates = emptyList(), javaLaunchPrefix = prefix),
        )
    }

    @Test
    fun `workspace launch explains when neither packaged nor JVM relaunch is available`() {
        val project = createTempDirectory("swarm-missing-launcher-project").toFile()

        val error = assertFailsWith<IllegalArgumentException> {
            workspaceLaunchCommand(project, candidates = emptyList(), javaLaunchPrefix = null)
        }

        assertTrue(error.message.orEmpty().contains("无法复用当前 JVM"))
    }
}
