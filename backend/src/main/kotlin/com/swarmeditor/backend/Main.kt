package com.swarmeditor.backend

import com.swarmeditor.backend.acp.AcpConnectionManager
import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.route.agentRoutes
import com.swarmeditor.backend.route.mcpRoutes
import com.swarmeditor.backend.route.sessionRoutes
import com.swarmeditor.backend.route.skillRoutes
import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.config.ServerConfig
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.routing.routing
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import java.io.File

// 全局 Service 实例
val agentRegistry = AgentRegistry()
val connectionManager = AcpConnectionManager()
val sessionStore = SessionStore(File(ConfigPaths.SESSIONS_DIR))
val mcpStore = McpStore(File(ConfigPaths.MCP_SERVERS_JSON))
val skillStore = SkillStore(File(ConfigPaths.SKILLS_JSON))
val skillScanner = SkillScanner()

val agentService = AgentService(agentRegistry, connectionManager)
val sessionService = SessionService(sessionStore)
val mcpService = McpService(mcpStore)
val skillService = SkillService(skillStore, skillScanner)

fun main() {
    runBlocking {
        agentService.init()
        sessionService.init()
        mcpService.init()
        skillService.init()
    }
    embeddedServer(CIO, host = ServerConfig.DEFAULT_HOST, port = ServerConfig.DEFAULT_PORT, module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(Json { prettyPrint = true; isLenient = true; ignoreUnknownKeys = true; encodeDefaults = true })
    }
    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
    }
    routing {
        agentRoutes(agentService)
        mcpRoutes(mcpService)
        skillRoutes(skillService)
        sessionRoutes(sessionService, agentService)
    }
}
