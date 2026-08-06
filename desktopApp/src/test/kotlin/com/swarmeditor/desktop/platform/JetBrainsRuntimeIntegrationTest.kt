package com.swarmeditor.desktop.platform

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class JetBrainsRuntimeIntegrationTest {
    @Test
    fun `native directory selection resolves selected folder`() {
        val parent = createTempDirectory("swarm-native-dialog").toFile()
        val project = File(parent, "project").apply { mkdir() }

        assertEquals(
            project.absoluteFile.normalize(),
            resolveNativeDirectorySelection(parent.absolutePath, project.name),
        )
    }

    @Test
    fun `native directory selection treats cancellation and files as empty`() {
        val parent = createTempDirectory("swarm-native-dialog-cancel").toFile()
        File(parent, "notes.txt").writeText("text")

        assertNull(resolveNativeDirectorySelection(parent.absolutePath, null))
        assertNull(resolveNativeDirectorySelection(parent.absolutePath, "notes.txt"))
    }
}
