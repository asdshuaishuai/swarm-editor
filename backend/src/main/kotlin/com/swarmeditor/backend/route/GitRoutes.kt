package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.GitService
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class GitStatusResponse(
    val branch: String,
    val ahead: Int,
    val behind: Int,
    val staged: Int,
    val modified: Int,
    val untracked: Int,
)

fun Route.gitRoutes(service: GitService) {
    get("/api/git/status") {
        val status = service.getStatus()
        call.respond(GitStatusResponse(
            branch = status.branch,
            ahead = status.ahead,
            behind = status.behind,
            staged = status.staged,
            modified = status.modified,
            untracked = status.untracked,
        ))
    }
}
