package com.swarmeditor.backend.pi

import com.swarmeditor.common.config.ConfigPaths
import java.io.File
import java.util.Base64

object PiRuntimePaths {
    fun agentDirectory(agentId: String): File {
        require(agentId.isNotBlank()) { "pi agent id cannot be blank" }
        val encodedId = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(agentId.toByteArray(Charsets.UTF_8))
        return File(ConfigPaths.PI_AGENT_DIR, "agents/$encodedId")
    }
}
