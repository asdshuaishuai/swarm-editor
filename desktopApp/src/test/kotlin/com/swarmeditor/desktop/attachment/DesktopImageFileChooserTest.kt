package com.swarmeditor.desktop.attachment

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class DesktopImageFileChooserTest {
    @Test
    fun `image chooser accepts supported files case insensitively`() {
        val directory = createTempDirectory("swarm-image-chooser").toFile()
        val image = File(directory, "preview.PNG").apply { writeBytes(byteArrayOf(1)) }
        val text = File(directory, "notes.txt").apply { writeText("text") }

        assertTrue(isSupportedImageFile(image))
        assertFalse(isSupportedImageFile(text))
        assertFalse(isSupportedImageFile(directory))
    }

    @Test
    fun `image chooser prefers project directory and formats file sizes`() {
        val project = createTempDirectory("swarm-project").toFile()
        val home = createTempDirectory("swarm-home").toFile()

        assertEquals(project, imageChooserInitialDirectory(project, home))
        assertEquals("512 B", formatFileSize(512))
        assertEquals("2.0 KB", formatFileSize(2048))
        assertEquals("2.0 MB", formatFileSize(2L * 1024 * 1024))
    }

    @Test
    fun `workspace creation creates a new directory but never reuses an existing one`() {
        val parent = createTempDirectory("swarm-workspace-parent").toFile()
        val project = File(parent, "new-project")

        assertEquals(project.absoluteFile.normalize(), prepareWorkspaceDirectory(project, createNew = true).getOrThrow())
        assertTrue(project.isDirectory)
        assertFailsWith<IllegalArgumentException> {
            prepareWorkspaceDirectory(project, createNew = true).getOrThrow()
        }
    }

    @Test
    fun `workspace opening accepts directories and rejects files`() {
        val project = createTempDirectory("swarm-open-project").toFile()
        val file = File(project, "README.md").apply { writeText("hello") }

        assertEquals(project.absoluteFile.normalize(), prepareWorkspaceDirectory(project, createNew = false).getOrThrow())
        assertFailsWith<IllegalArgumentException> {
            prepareWorkspaceDirectory(file, createNew = false).getOrThrow()
        }
    }
}
