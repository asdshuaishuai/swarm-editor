package com.swarmeditor.desktop.ui.files

import com.swarmeditor.desktop.api.FileNodeDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FileTreeViewTest {
    @Test
    fun `expanded tree includes only visible nodes in directory first order`() {
        val tree = directory(
            name = "root",
            path = "root",
            file("z.txt", "root/z.txt"),
            directory("beta", "root/beta", file("hidden.txt", "root/beta/hidden.txt")),
            directory("alpha", "root/alpha", file("visible.kt", "root/alpha/visible.kt")),
        )

        val visible = flattenVisibleFileTree(
            tree = tree,
            expanded = mapOf("root" to true, "root/alpha" to true),
            filterChangesOnly = false,
        )

        assertEquals(
            listOf("root", "root/alpha", "root/alpha/visible.kt", "root/beta", "root/z.txt"),
            visible.map { it.node.path },
        )
        assertEquals(listOf(0, 1, 2, 1, 1), visible.map { it.depth })
    }

    @Test
    fun `change filter preserves ancestors and removes unchanged siblings`() {
        val tree = directory(
            name = "root",
            path = "root",
            directory(
                name = "src",
                path = "root/src",
                file("Changed.kt", "root/src/Changed.kt", changeStatus = "modified"),
                file("Stable.kt", "root/src/Stable.kt"),
            ),
            file("README.md", "root/README.md"),
        )

        val visible = flattenVisibleFileTree(
            tree = tree,
            expanded = mapOf("root" to true, "root/src" to true),
            filterChangesOnly = true,
        )

        assertEquals(
            listOf("root", "root/src", "root/src/Changed.kt"),
            visible.map { it.node.path },
        )
    }

    @Test
    fun `change filter returns no rows when tree has no changes`() {
        val tree = directory(
            "root",
            "root",
            directory("src", "root/src", file("Stable.kt", "root/src/Stable.kt")),
        )

        val visible = flattenVisibleFileTree(
            tree = tree,
            expanded = mapOf("root" to true, "root/src" to true),
            filterChangesOnly = true,
        )

        assertTrue(visible.isEmpty())
    }

    @Test
    fun `tree indentation clamps invalid and extreme depths`() {
        assertEquals(8, treeStartPaddingDp(-1))
        assertEquals(50, treeStartPaddingDp(3))
        assertEquals(148, treeStartPaddingDp(10))
        assertEquals(148, treeStartPaddingDp(100))
    }

    private fun directory(name: String, path: String, vararg children: FileNodeDto): FileNodeDto = FileNodeDto(
        name = name,
        path = path,
        isDirectory = true,
        children = children.toList(),
    )

    private fun file(name: String, path: String, changeStatus: String? = null): FileNodeDto = FileNodeDto(
        name = name,
        path = path,
        changeStatus = changeStatus,
    )
}
