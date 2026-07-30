package com.swarmeditor.backend.storage

import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction.REPORT
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.util.UUID

internal fun File.readBoundedUtf8(maxBytes: Long): String {
    require(maxBytes > 0) { "maxBytes must be positive" }
    require(isFile) { "Path is not a regular file: $path" }
    require(Files.size(toPath()) <= maxBytes) { "File exceeds $maxBytes bytes: $path" }
    val bytes = Files.readAllBytes(toPath())
    require(bytes.size.toLong() <= maxBytes) { "File exceeds $maxBytes bytes: $path" }
    return Charsets.UTF_8.newDecoder()
        .onMalformedInput(REPORT)
        .onUnmappableCharacter(REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString()
}

internal fun File.quarantineCorruptFile(): File {
    require(isFile) { "Cannot quarantine non-file path: $path" }
    val parent = requireNotNull(absoluteFile.parentFile) { "File must have a parent: $path" }
    var quarantine: File
    do {
        quarantine = File(parent, "$name.corrupt-${UUID.randomUUID()}")
    } while (quarantine.exists())
    try {
        Files.move(toPath(), quarantine.toPath(), ATOMIC_MOVE)
    } catch (_: AtomicMoveNotSupportedException) {
        Files.move(toPath(), quarantine.toPath())
    }
    return quarantine
}

internal fun String.requireUtf8Size(maxBytes: Long, description: String): String {
    require(toByteArray(Charsets.UTF_8).size.toLong() <= maxBytes) {
        "$description exceeds $maxBytes bytes"
    }
    return this
}
