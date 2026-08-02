package com.swarmeditor.backend.pi

import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.skill.SyncMethod
import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertTrue

class PiSkillIntegrationTest {
    @Test
    fun `pi discovers a skill synchronized for its agent profile`() = runTest {
        val projectRoot = File(System.getProperty("user.dir")).let { directory ->
            generateSequence(directory) { it.parentFile }
                .first { File(it, "pi-0.83.0").isDirectory }
        }
        val runtime = PiRuntimeDistribution(projectRoot)
        val directory = Files.createTempDirectory("pi-skill-integration").toFile()
        try {
            val source = directory.resolve("skills/review").apply { mkdirs() }
            source.resolve("SKILL.md").writeText(
                """
                ---
                name: review
                description: Reviews repository changes.
                ---
                Review changes for functional and integration defects.
                """.trimIndent()
            )
            val store = SkillStore(directory.resolve("skills.json"))
            store.upsert(
                SkillConfig(
                    id = "fs:review",
                    name = "review",
                    source = SkillSource.FILESYSTEM,
                    path = source.absolutePath
                )
            )
            val agentDirectory = directory.resolve("agent")
            val service = SkillService(
                store = store,
                scanner = SkillScanner(listOf(directory.resolve("skills"))),
                agentDirectoryProvider = { agentDirectory }
            )
            service.syncSkillsToPi("pi-default", SyncMethod.Copy)

            val process = ProcessBuilder(
                "node",
                runtime.entrypoint.absolutePath,
                "--session-dir",
                directory.resolve("sessions").absolutePath,
                "--name",
                "skill-integration",
                "--approve",
                "--no-skills",
                "--skill",
                agentDirectory.resolve("skills").absolutePath
            ).directory(projectRoot).apply {
                environment()["PI_CODING_AGENT_DIR"] = agentDirectory.absolutePath
            }.start()
            try {
                val response = withContext(Dispatchers.IO) {
                    process.outputStream.bufferedWriter().use { writer ->
                        writer.write("{\"id\":\"1\",\"type\":\"get_commands\"}")
                        writer.newLine()
                        writer.flush()
                        withTimeout(15_000) {
                            process.inputStream.bufferedReader().lineSequence()
                                .first { line -> line.contains("\"id\":\"1\"") }
                        }
                    }
                }
                val commands = Json.parseToJsonElement(response).jsonObject["data"]
                    ?.jsonObject
                    ?.get("commands")
                    ?.jsonArray
                    .orEmpty()
                assertTrue(commands.any { command ->
                    command.jsonObject["name"]?.jsonPrimitive?.content == "skill:review" &&
                        command.jsonObject["source"]?.jsonPrimitive?.content == "skill"
                })
                assertTrue(commands.none { command ->
                    command.jsonObject["source"]?.jsonPrimitive?.content == "skill" &&
                        command.jsonObject["name"]?.jsonPrimitive?.content != "skill:review"
                })
            } finally {
                process.destroy()
                if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
            }
        } finally {
            directory.deleteRecursively()
        }
    }
}
