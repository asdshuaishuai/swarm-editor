package com.swarmeditor.backend.pi

import com.swarmeditor.backend.storage.atomicWriteText
import com.swarmeditor.common.config.ConfigPaths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

object PiMcpExtensionInstaller {
    private const val RESOURCE = "/pi/swarm-mcp.js"
    private const val FILE_NAME = "swarm-mcp.js"

    suspend fun install(agentDirectory: File = File(ConfigPaths.PI_AGENT_DIR)) = withContext(Dispatchers.IO) {
        val source = requireNotNull(javaClass.getResourceAsStream(RESOURCE)) {
            "缺少内置 pi MCP 扩展资源: $RESOURCE"
        }
        val content = source.use { it.readBytes().toString(Charsets.UTF_8) }
        val target = File(agentDirectory, "extensions/$FILE_NAME")
        if (!target.isFile || target.readText() != content) {
            target.atomicWriteText(content)
        }
    }
}
