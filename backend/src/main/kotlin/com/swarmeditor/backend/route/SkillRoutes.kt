package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.SkillService
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.skillRoutes(service: SkillService) {
    get("/api/skills") { call.respond(mapOf("skills" to service.getAll())) }
    get("/api/skills/scan") {
        service.scan()
        call.respond(mapOf("skills" to service.getAll()))
    }
    put("/api/skills/{id}/toggle/{agentId}") {
        service.toggleAgent(call.parameters["id"]!!, call.parameters["agentId"]!!, true)
        call.respond(mapOf("status" to "ok"))
    }
}
