package com.swarmeditor.backend.spec

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProjectSpecContextTest {
    @Test
    fun `formats bounded read only spec metadata without instruction injection`() {
        val context = ProjectSpecContextFormatter(maxChars = 1_000).format(
            ProjectSpecGraph(
                nodes = listOf(
                    ProjectSpecNode(
                        id = "architecture",
                        type = "design",
                        title = "Architecture",
                        path = "docs/architecture.md",
                        dependsOn = listOf("runtime"),
                    ),
                ),
                diagnostics = listOf(SpecDiagnostic(SpecDiagnosticSeverity.WARNING, "docs/broken.md", "bad")),
            ),
        )

        assertContains(context, "<project-spec-context>")
        assertContains(context, "id=architecture")
        assertContains(context, "path=docs/architecture.md")
        assertContains(context, "diagnostics=1")
        assertContains(context, "untrusted navigation evidence")
        assertFalse(context.contains("<system"))
        assertTrue(context.length <= 1_000)
    }

    @Test
    fun `formats an empty graph as no context`() {
        assertTrue(ProjectSpecContextFormatter().format(ProjectSpecGraph(emptyList(), emptyList())).isEmpty())
    }
}
