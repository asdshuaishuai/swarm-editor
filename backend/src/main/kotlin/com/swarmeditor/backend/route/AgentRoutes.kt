package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.AgentService
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.agentRoutes(service: AgentService) {
    get("/api/agents") { call.respond(mapOf("agents" to service.agents.value)) }
    get("/api/agents/{id}") {
        val id = call.parameters["id"]!!
        val config = service.getConfig(id)
        if (config != null) call.respond(mapOf("agent" to config))
        else call.respond(mapOf("error" to "not found"))
    }
    post("/api/agents/{id}/connect") {
        val id = call.parameters["id"]!!
        val result = service.connect(id)
        if (result.isSuccess) call.respond(mapOf("status" to "connected"))
        else call.respond(mapOf("error" to (result.exceptionOrNull()?.message ?: "unknown")))
    }
    post("/api/agents/{id}/disconnect") {
        service.disconnect(call.parameters["id"]!!)
        call.respond(mapOf("status" to "disconnected"))
    }
    get("/api/agents/scan") {
        service.scan()
        call.respond(mapOf("agents" to service.agents.value))
    }
    get("/api/agents/{id}/config") {
        val id = call.parameters["id"]!!
        val config = service.getConfig(id) ?: return@get call.respond(mapOf("error" to "not found"))
        val adapter = service.getAdapter(config.agentType) ?: return@get call.respond(mapOf("error" to "no adapter"))
        val fields = adapter.readNativeConfigFields()
        call.respond(mapOf("fields" to fields, "configPath" to adapter.nativeConfigPath))
    }
    put("/api/agents/{id}/config/{key}") {
        val id = call.parameters["id"]!!
        val key = call.parameters["key"]!!
        val body = call.receive<Map<String, String>>()
        val config = service.getConfig(id) ?: return@put call.respond(mapOf("error" to "not found"))
        val adapter = service.getAdapter(config.agentType) ?: return@put call.respond(mapOf("error" to "no adapter"))
        adapter.writeNativeConfigField(key, body["value"] ?: "")
        call.respond(mapOf("status" to "ok"))
    }
}
