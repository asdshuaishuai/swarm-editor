package com.swarmeditor.backend.spec

import java.nio.file.Files
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import java.util.concurrent.atomic.AtomicInteger

class ProjectSpecGraphTest {
    @OptIn(ExperimentalPathApi::class)
    @Test
    fun `scanner reuses cached graph until candidate metadata changes`() = runTest {
        val root = Files.createTempDirectory("project-spec-graph-cache")
        try {
            val file = root.resolve("spec.md")
            Files.writeString(file, "---\nid: first\ntype: design\n---\n")
            val reads = AtomicInteger()
            val scanner = ProjectSpecGraphScanner(readFile = { path ->
                reads.incrementAndGet()
                Files.readString(path)
            })

            assertEquals("first", scanner.scan(root.toFile()).nodes.single().id)
            assertEquals("first", scanner.scan(root.toFile()).nodes.single().id)
            assertEquals(1, reads.get())

            Files.writeString(file, "---\nid: second\ntype: design\n---\n")

            assertEquals("second", scanner.scan(root.toFile()).nodes.single().id)
            assertEquals(2, reads.get())
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(ExperimentalPathApi::class)
    @Test
    fun `scanner builds a sorted graph from valid frontmatter and ignores non-spec files`() = runTest {
        val root = Files.createTempDirectory("project-spec-graph")
        try {
            Files.createDirectories(root.resolve("build"))
            Files.writeString(root.resolve("build/ignored.md"), "---\nid: ignored\ntype: design\n---")
            Files.writeString(root.resolve("README.md"), "# not a spec")
            Files.writeString(
                root.resolve("specs/architecture.md").also { Files.createDirectories(it.parent) },
                """
                ---
                id: architecture
                type: design
                title: Architecture
                tags: [system, kotlin]
                ---
                # Architecture
                """.trimIndent(),
            )
            Files.writeString(
                root.resolve("specs/task.md"),
                """
                ---
                id: task
                type: task-spec
                parent: architecture
                depends-on: [architecture]
                ---
                # Task
                """.trimIndent(),
            )

            val graph = ProjectSpecGraphScanner().scan(root.toFile())

            assertEquals(listOf("architecture", "task"), graph.nodes.map(ProjectSpecNode::id))
            assertEquals("Architecture", graph.nodesById.getValue("architecture").title)
            assertEquals(listOf("system", "kotlin"), graph.nodesById.getValue("architecture").tags)
            assertEquals("architecture", graph.nodesById.getValue("task").parent)
            assertTrue(graph.diagnostics.isEmpty())
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(ExperimentalPathApi::class)
    @Test
    fun `scanner reports missing references and parent cycles without dropping nodes`() = runTest {
        val root = Files.createTempDirectory("project-spec-graph-invalid")
        try {
            Files.writeString(
                root.resolve("a.md"),
                """
                ---
                id: a
                type: design
                parent: b
                depends-on: [missing]
                ---
                """.trimIndent(),
            )
            Files.writeString(
                root.resolve("b.md"),
                """
                ---
                id: b
                type: design
                parent: a
                ---
                """.trimIndent(),
            )

            val graph = ProjectSpecGraphScanner().scan(root.toFile())
            val messages = graph.diagnostics.map(SpecDiagnostic::message)

            assertEquals(listOf("a", "b"), graph.nodes.map(ProjectSpecNode::id))
            assertTrue(messages.any { "Unknown depends-on target 'missing'" == it })
            assertTrue(messages.any { it.startsWith("Parent cycle detected") })
            assertFalse(graph.diagnostics.any { it.message.contains("Unknown parent") })
        } finally {
            root.deleteRecursively()
        }
    }

    @OptIn(ExperimentalPathApi::class)
    @Test
    fun `scanner diagnoses duplicate ids and malformed frontmatter`() = runTest {
        val root = Files.createTempDirectory("project-spec-graph-duplicates")
        try {
            Files.writeString(
                root.resolve("first.md"),
                "---\nid: duplicate\ntype: design\n---\n",
            )
            Files.writeString(
                root.resolve("second.md"),
                "---\nid: duplicate\ntype: task\n---\n",
            )
            Files.writeString(
                root.resolve("broken.md"),
                "---\nid: broken\ntype: design\n",
            )

            val graph = ProjectSpecGraphScanner().scan(root.toFile())

            assertEquals(1, graph.nodes.count { it.id == "duplicate" })
            assertTrue(graph.diagnostics.any { it.message.startsWith("Duplicate spec id") })
            assertTrue(graph.diagnostics.any { it.message == "Spec frontmatter is not closed" })
        } finally {
            root.deleteRecursively()
        }
    }
}
