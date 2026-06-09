package com.swarmeditor.backend.service

import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File

private val logger = KotlinLogging.logger {}

class ProjectService(private val projectDir: File) {

    data class FileNode(
        val name: String,
        val path: String,
        val isDirectory: Boolean,
        val children: List<FileNode> = emptyList(),
        val changeStatus: String? = null,
    )

    companion object {
        private val EXCLUDED_DIRS = setOf(".git", "build", "node_modules", ".gradle", ".idea", ".omo")
    }

    fun getTree(): FileNode {
        return walkDir(projectDir, projectDir.absolutePath)
    }

    private fun walkDir(dir: File, basePath: String): FileNode {
        val children = dir.listFiles()
            ?.filter { it.name !in EXCLUDED_DIRS && !it.name.startsWith(".") }
            ?.sortedWith(compareBy({ !it.isDirectory }, { it.name }))
            ?.map { child ->
                val relativePath = child.absolutePath.removePrefix(basePath).removePrefix("/")
                if (child.isDirectory) {
                    walkDir(child, basePath).copy(path = relativePath)
                } else {
                    FileNode(
                        name = child.name,
                        path = relativePath,
                        isDirectory = false,
                    )
                }
            } ?: emptyList()

        val relativePath = dir.absolutePath.removePrefix(projectDir.absolutePath).removePrefix("/")
        return FileNode(
            name = dir.name,
            path = relativePath.ifEmpty { "." },
            isDirectory = true,
            children = children,
        )
    }
}
