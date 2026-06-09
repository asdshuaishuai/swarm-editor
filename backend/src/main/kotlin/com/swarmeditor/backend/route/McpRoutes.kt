package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.McpService
import com.swarmeditor.common.model.McpServerConfig
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.mcpRoutes(service: McpService) {
    get("/api/mcp/servers") { call.respond(mapOf("servers" to service.getAll())) }
    post("/api/mcp/servers") {
        val config = call.receive<McpServerConfig>()
        service.upsert(config)
        call.respond(mapOf("status" to "ok"))
    }
    put("/api/mcp/servers/{id}") {
        val config = call.receive<McpServerConfig>()
        service.upsert(config)
        call.respond(mapOf("status" to "ok"))
    }
    delete("/api/mcp/servers/{id}") {
        service.delete(call.parameters["id"]!!)
        call.respond(mapOf("status" to "ok"))
    }
}
