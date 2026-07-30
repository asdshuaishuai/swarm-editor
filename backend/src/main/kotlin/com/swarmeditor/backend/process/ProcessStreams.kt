package com.swarmeditor.backend.process

import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal const val MAX_PROCESS_LOG_LINE_BYTES = 64 * 1024
private const val TRUNCATED_LINE_SUFFIX = " … [truncated]"

internal suspend fun readTruncatedUtf8Lines(
    input: InputStream,
    maxLineBytes: Int = MAX_PROCESS_LOG_LINE_BYTES,
    onLine: suspend (String) -> Unit,
) = withContext(Dispatchers.IO) {
    require(maxLineBytes > 0) { "maxLineBytes must be positive" }
    input.use { stream ->
        val buffer = ByteArrayOutputStream(minOf(maxLineBytes, 8 * 1024))
        var truncated = false

        suspend fun emitLine() {
            val bytes = buffer.toByteArray()
            val size = if (bytes.lastOrNull() == '\r'.code.toByte()) bytes.size - 1 else bytes.size
            val line = String(bytes, 0, size, Charsets.UTF_8)
            onLine(if (truncated) line + TRUNCATED_LINE_SUFFIX else line)
            buffer.reset()
            truncated = false
        }

        while (true) {
            val byte = stream.read()
            if (byte == -1) break
            if (byte == '\n'.code) {
                emitLine()
            } else if (buffer.size() < maxLineBytes) {
                buffer.write(byte)
            } else {
                truncated = true
            }
        }
        if (buffer.size() > 0 || truncated) emitLine()
    }
}
