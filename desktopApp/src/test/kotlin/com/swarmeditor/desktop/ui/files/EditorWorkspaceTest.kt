package com.swarmeditor.desktop.ui.files

import kotlin.test.Test
import kotlin.test.assertEquals

class EditorWorkspaceTest {
    @Test
    fun `breadcrumbs normalize unix and windows paths`() {
        val expected = listOf("desktopApp", "src", "main", "EditorWorkspace.kt")

        assertEquals(expected, fileBreadcrumbSegments("desktopApp/src/main/EditorWorkspace.kt"))
        assertEquals(expected, fileBreadcrumbSegments("desktopApp\\src\\main\\EditorWorkspace.kt"))
        assertEquals(expected, fileBreadcrumbSegments("/desktopApp//src/main/EditorWorkspace.kt"))
    }
}
