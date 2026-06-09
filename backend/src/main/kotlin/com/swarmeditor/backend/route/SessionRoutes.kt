package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.common.model.MessageRole
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.sessionRoutes(sessionService: SessionService, agentService: AgentService) {
    get("/api/sessions") { call.respond(mapOf("sessions" to sessionService.getAll())) }
    get("/api/sessions/{id}") {
        val session = sessionService.get(call.parameters["id"]!!)
        if (session != null) call.respond(mapOf("session" to session))
        else call.respond(mapOf("error" to "not found"))
    }
    post("/api/sessions") {
        val body = call.receive<Map<String, String>>()
        val agentId = body["agentId"] ?: "claude-code"
        val title = body["title"] ?: "新会话"
        val session = sessionService.create(agentId, title)
        call.respond(mapOf("session" to session))
    }
    post("/api/sessions/{id}/messages") {
        val id = call.parameters["id"]!!
        val body = call.receive<Map<String, String>>()
        val content = body["content"] ?: ""
        sessionService.addMessage(id, MessageRole.USER, content)
        val session = sessionService.get(id)!!
        val connection = agentService.getConnection(session.agentId)
        if (connection != null && connection.isConnected) {
            val result = connection.sendPrompt(id, content)
            if (result.isSuccess) {
                val response = result.getOrNull() ?: ""
                sessionService.addMessage(id, MessageRole.ASSISTANT, response)
                call.respond(mapOf("response" to response))
            } else {
                call.respond(mapOf("error" to (result.exceptionOrNull()?.message ?: "unknown")))
            }
        } else {
            call.respond(mapOf("error" to "Agent not connected"))
        }
    }
    delete("/api/sessions/{id}") {
        sessionService.close(call.parameters["id"]!!)
        call.respond(mapOf("status" to "closed"))
    }
}
