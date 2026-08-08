package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

internal const val SWARM_PI_MODEL_CATALOG_ENV = "SWARM_PI_MODEL_CATALOG"

internal fun AgentConfig.isModelCatalogProfile(): Boolean =
    env[SWARM_PI_MODEL_CATALOG_ENV] == "1"

data class PiRuntimeInfo(
    val version: String,
    val nodeVersion: String,
    val entrypoint: File
)

private data class NodeVersion(val major: Int, val minor: Int, val patch: Int) : Comparable<NodeVersion> {
    override fun compareTo(other: NodeVersion): Int = compareValuesBy(this, other, NodeVersion::major, NodeVersion::minor, NodeVersion::patch)
}

class PiRuntimeDistribution(
    private val projectRoot: File,
    private val nodeExecutable: String = System.getenv("SWARM_PI_NODE") ?: "node"
) {
    val sourceRoot: File by lazy {
        sequenceOf(
            System.getProperty("swarm.pi.root"),
            System.getenv("SWARM_PI_ROOT"),
            System.getProperty("compose.application.resources.dir")?.let { "$it/pi-runtime" }
        ).filterNotNull()
            .map(::File)
            .firstOrNull(File::isDirectory)
            ?: File(projectRoot, "pi-0.83.0")
    }

    val entrypoint: File
        get() = File(sourceRoot, "packages/coding-agent/dist/rpc-entry.js")

    fun inspect(): Result<PiRuntimeInfo> = runCatching {
        val packageFile = File(sourceRoot, "packages/coding-agent/package.json")
        require(packageFile.isFile) { "内置 pi 源码不存在: ${sourceRoot.absolutePath}" }
        require(entrypoint.isFile) {
            "内置 pi 尚未构建，请先运行 ./gradlew :backend:preparePiRuntime"
        }
        val version = Json.parseToJsonElement(packageFile.readText())
            .jsonObject["version"]?.jsonPrimitive?.content
            ?: error("无法读取 pi 版本")
        val nodeVersion = ProcessBuilder(nodeExecutable, "--version")
            .redirectErrorStream(true)
            .start()
            .let { process ->
                val output = process.inputStream.bufferedReader().use { it.readText().trim() }
                require(process.waitFor() == 0) { "Node.js 不可用: $output" }
                validateNodeVersion(output)
            }
        PiRuntimeInfo(version, nodeVersion, entrypoint)
    }

    fun command(config: AgentConfig, remoteSessionId: String?): List<String> = buildList {
        val modelCatalog = config.isModelCatalogProfile()
        add(nodeExecutable)
        add(entrypoint.absolutePath)
        add("--session-dir")
        add(com.swarmeditor.common.config.ConfigPaths.PI_SESSIONS_DIR)
        add("--name")
        add(config.name)
        add("--approve")
        add("--no-skills")
        if (modelCatalog) {
            add("--no-tools")
            add("--no-extensions")
        } else {
            add("--skill")
            add(PiRuntimePaths.agentDirectory(config.id).resolve("skills").absolutePath)
        }
        if (!remoteSessionId.isNullOrBlank()) {
            add("--session")
            add(remoteSessionId)
        }
        if (config.provider.isNotBlank()) {
            add("--provider")
            add(config.provider)
        }
        if (config.model.isNotBlank()) {
            add("--model")
            add(config.model)
        }
        add("--thinking")
        add(config.thinkingLevel.name.lowercase())
        if (config.systemPrompt.isNotBlank()) {
            add("--system-prompt")
            add(config.systemPrompt)
        }
    }
}

internal fun validateNodeVersion(output: String): String {
    val match = Regex("""^v?(\d+)\.(\d+)\.(\d+)""").find(output.trim())
        ?: error("无法识别 Node.js 版本: $output")
    val version = NodeVersion(
        major = match.groupValues[1].toInt(),
        minor = match.groupValues[2].toInt(),
        patch = match.groupValues[3].toInt()
    )
    require(version >= MINIMUM_NODE_VERSION) {
        "Node.js 版本过低: ${output.trim()}，pi 0.83.0 需要 Node.js 22.19.0 或更高版本"
    }
    return output.trim()
}

private val MINIMUM_NODE_VERSION = NodeVersion(22, 19, 0)
