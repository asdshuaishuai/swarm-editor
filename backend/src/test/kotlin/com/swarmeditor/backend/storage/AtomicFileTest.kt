package com.swarmeditor.backend.storage

import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class AtomicFileTest {
    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `atomic replacement preserves restrictive executable permissions`() {
        if ("posix" !in FileSystems.getDefault().supportedFileAttributeViews()) return
        val directory = Files.createTempDirectory("atomic-file-permissions")
        try {
            val target = directory.resolve("script.sh")
            Files.writeString(target, "#!/bin/sh\necho before\n")
            val permissions = setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            )
            Files.setPosixFilePermissions(target, permissions)

            target.toFile().atomicWriteText("#!/bin/sh\necho after\n")

            assertEquals("#!/bin/sh\necho after\n", Files.readString(target))
            assertEquals(permissions, Files.getPosixFilePermissions(target))
            assertFalse(Files.list(directory).use { files -> files.anyMatch { it.fileName.toString().endsWith(".tmp") } })
        } finally {
            directory.deleteRecursively()
        }
    }

    @OptIn(kotlin.io.path.ExperimentalPathApi::class)
    @Test
    fun `atomic write creates missing parent directories`() {
        val directory = Files.createTempDirectory("atomic-file-parent")
        try {
            val target = directory.resolve("nested/config/settings.json")

            target.toFile().atomicWriteText("{\"enabled\":true}")

            assertEquals("{\"enabled\":true}", Files.readString(target))
        } finally {
            directory.deleteRecursively()
        }
    }
}
