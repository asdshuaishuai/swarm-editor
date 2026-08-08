package com.swarmeditor.backend.pi

import com.swarmeditor.backend.storage.atomicWriteText
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

internal class PiNativeAgentBootstrap(
    private val nativeAgentDirectory: File = defaultNativeAgentDirectory(),
) {
    suspend fun syncMissingConfiguration(agentDirectory: File) = withContext(Dispatchers.IO) {
        if (!nativeAgentDirectory.isDirectory) return@withContext
        if (nativeAgentDirectory.canonicalFile == agentDirectory.canonicalFile) return@withContext

        CONFIGURATION_FILES.forEach { fileName ->
            val source = nativeAgentDirectory.resolve(fileName)
            val target = agentDirectory.resolve(fileName)
            if (!source.isFile || source.length() > MAX_CONFIGURATION_BYTES) return@forEach
            if (!shouldBootstrap(fileName, target)) return@forEach

            val content = source.readText()
            Json.parseToJsonElement(content)
            target.atomicWriteText(content)
            if (fileName == AUTH_FILE) restrictToOwner(target)
        }
    }

    private fun shouldBootstrap(fileName: String, target: File): Boolean =
        !target.isFile || (fileName == AUTH_FILE && target.isEmptyJsonObject())

    private fun File.isEmptyJsonObject(): Boolean = runCatching {
        length() <= MAX_CONFIGURATION_BYTES && Json.parseToJsonElement(readText()).jsonObject.isEmpty()
    }.getOrDefault(false)

    private fun restrictToOwner(file: File) {
        runCatching {
            Files.setPosixFilePermissions(
                file.toPath(),
                setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE),
            )
        }
    }

    private companion object {
        const val AUTH_FILE = "auth.json"
        const val MAX_CONFIGURATION_BYTES = 4L * 1024 * 1024
        val CONFIGURATION_FILES = listOf(AUTH_FILE, "models.json", "models-store.json", "settings.json")

        fun defaultNativeAgentDirectory(): File = File(
            System.getProperty("swarm.pi.nativeAgentDir")
                ?: System.getenv("SWARM_PI_NATIVE_AGENT_DIR")
                ?: File(System.getProperty("user.home"), ".pi/agent").absolutePath,
        )
    }
}
