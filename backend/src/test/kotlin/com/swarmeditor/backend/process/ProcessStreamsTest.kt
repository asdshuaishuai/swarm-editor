package com.swarmeditor.backend.process

import java.io.ByteArrayInputStream
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class ProcessStreamsTest {
    @Test
    fun `truncates oversized log lines and continues draining following lines`() = runBlocking {
        val lines = mutableListOf<String>()

        readTruncatedUtf8Lines(
            ByteArrayInputStream("123456\r\nnext\nfinal".toByteArray()),
            maxLineBytes = 4,
            onLine = lines::add,
        )

        assertEquals(
            listOf("1234 … [truncated]", "next", "fina … [truncated]"),
            lines,
        )
    }

    @Test
    fun `preserves empty and unterminated log lines`() = runBlocking {
        val lines = mutableListOf<String>()

        readTruncatedUtf8Lines(
            ByteArrayInputStream("\nlast".toByteArray()),
            maxLineBytes = 8,
            onLine = lines::add,
        )

        assertEquals(listOf("", "last"), lines)
    }
}
