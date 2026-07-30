package com.swarmeditor.backend.storage

import java.io.File
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.nio.file.StandardOpenOption.TRUNCATE_EXISTING
import java.nio.file.StandardOpenOption.WRITE
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.PosixFilePermissions

internal fun File.atomicWriteText(content: String) {
    val target = toPath().toAbsolutePath().normalize()
    val parent = target.parent ?: Path.of(".").toAbsolutePath().normalize()
    Files.createDirectories(parent)
    val permissions = target.posixPermissionsOrNull()
    val temporary = createTemporarySibling(parent, target.fileName.toString(), permissions)
    try {
        val bytes = content.toByteArray(Charsets.UTF_8)
        FileChannel.open(temporary, WRITE, TRUNCATE_EXISTING).use { channel ->
            val buffer = ByteBuffer.wrap(bytes)
            while (buffer.hasRemaining()) channel.write(buffer)
            channel.force(true)
        }
        try {
            Files.move(temporary, target, ATOMIC_MOVE, REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(temporary, target, REPLACE_EXISTING)
        }
    } finally {
        Files.deleteIfExists(temporary)
    }
}

private fun Path.posixPermissionsOrNull(): Set<PosixFilePermission>? = try {
    Files.getPosixFilePermissions(this)
} catch (_: UnsupportedOperationException) {
    null
} catch (_: NoSuchFileException) {
    null
}

private fun createTemporarySibling(
    parent: Path,
    fileName: String,
    permissions: Set<PosixFilePermission>?,
): Path {
    val prefix = ".$fileName."
    if (permissions == null) return Files.createTempFile(parent, prefix, ".tmp")
    return try {
        Files.createTempFile(parent, prefix, ".tmp", PosixFilePermissions.asFileAttribute(permissions))
    } catch (_: UnsupportedOperationException) {
        Files.createTempFile(parent, prefix, ".tmp")
    }
}
