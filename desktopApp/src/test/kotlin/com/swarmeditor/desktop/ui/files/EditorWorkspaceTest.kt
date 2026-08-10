package com.swarmeditor.desktop.ui.files

import com.swarmeditor.backend.lsp.SourceDiagnostic
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EditorWorkspaceTest {
    @Test
    fun `breadcrumbs normalize unix and windows paths`() {
        val expected = listOf("desktopApp", "src", "main", "EditorWorkspace.kt")

        assertEquals(expected, fileBreadcrumbSegments("desktopApp/src/main/EditorWorkspace.kt"))
        assertEquals(expected, fileBreadcrumbSegments("desktopApp\\src\\main\\EditorWorkspace.kt"))
        assertEquals(expected, fileBreadcrumbSegments("/desktopApp//src/main/EditorWorkspace.kt"))
    }

    @Test
    fun `problem filters normalize LSP severity names`() {
        assertTrue(diagnosticMatchesFilter("error", "error"))
        assertTrue(diagnosticMatchesFilter("information", "info"))
        assertTrue(diagnosticMatchesFilter("warning", "all"))
        assertFalse(diagnosticMatchesFilter("warning", "error"))
    }

    @Test
    fun `diagnostic labels retain precise LSP ranges`() {
        assertEquals(
            "L12:9-21",
            diagnosticLocationLabel(
                SourceDiagnostic(
                    line = 11,
                    severity = "warning",
                    message = "Unused",
                    startCharacter = 8,
                    endLine = 11,
                    endCharacter = 20,
                )
            ),
        )
        assertEquals(
            "L12:9-L13:4",
            diagnosticLocationLabel(
                SourceDiagnostic(
                    line = 11,
                    severity = "error",
                    message = "Range",
                    startCharacter = 8,
                    endLine = 12,
                    endCharacter = 3,
                )
            ),
        )
    }
}
