package com.swarmeditor.desktop.ui.files

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DiffDrawerTest {
    @Test
    fun `drawer motion stays short across narrow and wide layouts`() {
        assertEquals(0, drawerMotionOffsetPx(0))
        assertEquals(12, drawerMotionOffsetPx(12))
        assertEquals(24, drawerMotionOffsetPx(300))
        assertEquals(48, drawerMotionOffsetPx(600))
        assertEquals(72, drawerMotionOffsetPx(2_000))
    }

    @Test
    fun `unified diff assigns old and new line numbers by change kind`() {
        val parsed = parseUnifiedDiff(
            listOf(
                "@@ -10,3 +20,4 @@",
                " context",
                "-old",
                "+new",
                "+added",
            ),
        )

        assertEquals(DiffLineKind.HUNK, parsed[0].kind)
        assertLine(parsed[1], oldLine = 10, newLine = 20, kind = DiffLineKind.CONTEXT)
        assertLine(parsed[2], oldLine = 11, newLine = null, kind = DiffLineKind.DELETION)
        assertLine(parsed[3], oldLine = null, newLine = 21, kind = DiffLineKind.ADDITION)
        assertLine(parsed[4], oldLine = null, newLine = 22, kind = DiffLineKind.ADDITION)
    }

    @Test
    fun `metadata remains unnumbered before and within hunks`() {
        val parsed = parseUnifiedDiff(
            listOf(
                "diff --git a/sample.txt b/sample.txt",
                "--- a/sample.txt",
                "+++ b/sample.txt",
                "@@ -1 +1 @@",
                "-before",
                "+after",
                "\\ No newline at end of file",
            ),
        )

        parsed.take(3).forEach { line ->
            assertLine(line, oldLine = null, newLine = null, kind = DiffLineKind.METADATA)
        }
        assertLine(parsed[6], oldLine = null, newLine = null, kind = DiffLineKind.METADATA)
    }

    @Test
    fun `multiple hunks reset their line number cursors`() {
        val parsed = parseUnifiedDiff(
            listOf(
                "@@ -2,2 +4,2 @@ first",
                " context",
                "-old",
                "@@ -30 +40,2 @@ second",
                "+new",
                " context",
            ),
        )

        assertLine(parsed[1], oldLine = 2, newLine = 4, kind = DiffLineKind.CONTEXT)
        assertLine(parsed[2], oldLine = 3, newLine = null, kind = DiffLineKind.DELETION)
        assertLine(parsed[4], oldLine = null, newLine = 40, kind = DiffLineKind.ADDITION)
        assertLine(parsed[5], oldLine = 30, newLine = 41, kind = DiffLineKind.CONTEXT)
    }

    private fun assertLine(
        line: ParsedDiffLine,
        oldLine: Int?,
        newLine: Int?,
        kind: DiffLineKind,
    ) {
        assertEquals(kind, line.kind)
        if (oldLine == null) assertNull(line.oldLine) else assertEquals(oldLine, line.oldLine)
        if (newLine == null) assertNull(line.newLine) else assertEquals(newLine, line.newLine)
    }
}
