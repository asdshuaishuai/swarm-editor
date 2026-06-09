package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.ProjectService
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class FileNodeResponse(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val children: List<FileNodeResponse> = emptyList(),
    val changeStatus: String? = null,
)

@Serializable
data class ProjectTreeResponse(val tree: FileNodeResponse)

fun Route.projectRoutes(service: ProjectService) {
    get("/api/project/tree") {
        val tree = service.getTree()
        call.respond(ProjectTreeResponse(tree = serializeNode(tree)))
    }
}

private fun serializeNode(node: ProjectService.FileNode): FileNodeResponse {
    return FileNodeResponse(
        name = node.name,
        path = node.path,
        isDirectory = node.isDirectory,
        children = node.children.map { serializeNode(it) },
        changeStatus = node.changeStatus,
    )
}
