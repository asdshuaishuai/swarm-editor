package com.swarmeditor.backend.pi

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable
private data class WasmPluginManifest(
    val id: String,
    val name: String,
    val description: String = "",
    val module: String = "module.wasm",
    val sha256: String,
    val enabled: Boolean = true,
    val timeoutMillis: Long = 5_000,
    val maxInputBytes: Int = 1024 * 1024,
    val maxOutputChars: Int = 4 * 1024 * 1024,
)

data class WasmPluginDefinition(
    val id: String,
    val name: String,
    val description: String,
    val module: WasmModule,
)

data class WasmPluginCatalog(
    val plugins: List<WasmPluginDefinition>,
    val errors: List<String>,
)

class WasmPluginRegistry(
    rootDirectory: File,
    private val json: Json = Json { ignoreUnknownKeys = false },
) {
    private val root = rootDirectory.absoluteFile.normalize()

    suspend fun scan(): WasmPluginCatalog = withContext(Dispatchers.IO) {
        root.mkdirs()
        require(root.isDirectory) { "WASM plugin root cannot be created: ${root.path}" }
        val plugins = mutableListOf<WasmPluginDefinition>()
        val errors = mutableListOf<String>()
        root.listFiles().orEmpty()
            .filter(File::isDirectory)
            .sortedBy(File::getName)
            .forEach { directory ->
                try {
                    loadPlugin(directory)?.let(plugins::add)
                } catch (error: Throwable) {
                    errors += "${directory.name}: ${safeMessage(error)}"
                }
            }
        WasmPluginCatalog(plugins = plugins.sortedBy(WasmPluginDefinition::id), errors = errors)
    }

    private fun loadPlugin(directory: File): WasmPluginDefinition? {
        require(!java.nio.file.Files.isSymbolicLink(directory.toPath())) { "Plugin directory cannot be a symbolic link" }
        val manifestFile = File(directory, MANIFEST_FILE)
        require(manifestFile.isFile && !java.nio.file.Files.isSymbolicLink(manifestFile.toPath())) {
            "$MANIFEST_FILE is missing"
        }
        require(manifestFile.length() in 1..MAX_MANIFEST_BYTES) { "$MANIFEST_FILE exceeds $MAX_MANIFEST_BYTES bytes" }
        val manifest = json.decodeFromString<WasmPluginManifest>(manifestFile.readText())
        require(manifest.id.matches(PLUGIN_ID_PATTERN)) { "Invalid plugin id" }
        require(directory.name == manifest.id) { "Plugin directory must match manifest id" }
        require(manifest.name.isNotBlank() && manifest.name.length <= 120) { "Invalid plugin name" }
        require(manifest.description.length <= 2_000) { "Plugin description is too long" }
        require(manifest.module.matches(MODULE_FILE_PATTERN)) { "Module must be a direct .wasm file" }
        require(manifest.sha256.matches(SHA256_PATTERN)) { "Invalid module SHA-256" }
        require(manifest.timeoutMillis in 1..30_000) { "Invalid plugin timeout" }
        require(manifest.maxInputBytes in 1..MAX_WASM_PLUGIN_INPUT_BYTES) { "Invalid plugin input limit" }
        require(manifest.maxOutputChars in 1..MAX_WASM_PLUGIN_OUTPUT_CHARS) { "Invalid plugin output limit" }
        if (!manifest.enabled) return null
        val canonicalDirectory = directory.canonicalFile
        require(canonicalDirectory.parentFile == root.canonicalFile) { "Plugin directory escapes the plugin root" }
        val moduleFile = File(canonicalDirectory, manifest.module)
        require(moduleFile.isFile && !java.nio.file.Files.isSymbolicLink(moduleFile.toPath())) { "WASM module is missing" }
        require(moduleFile.canonicalFile.parentFile == canonicalDirectory) { "WASM module escapes the plugin directory" }
        require(sha256(moduleFile) == manifest.sha256) { "WASM module SHA-256 mismatch" }
        return WasmPluginDefinition(
            id = manifest.id,
            name = manifest.name.trim(),
            description = manifest.description.trim(),
            module = WasmModule(
                id = manifest.id,
                file = moduleFile.canonicalFile,
                sha256 = manifest.sha256,
                timeout = manifest.timeoutMillis.milliseconds,
                maxInputBytes = manifest.maxInputBytes,
                maxOutputChars = manifest.maxOutputChars,
            ),
        )
    }
}

class WasmPluginCapabilityExecutor(
    private val registry: WasmPluginRegistry,
    private val sandboxProvider: suspend () -> WasmSandbox?,
    private val runtimeStatusProvider: suspend () -> WasmtimeRuntimeStatus? = { null },
) : PiToolCapabilityExecutor {
    override suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult {
        require(request.tool == "wasm") { "Unsupported WASM plugin tool: ${request.tool}" }
        val catalog = registry.scan()
        return when (request.operation) {
            "list" -> {
                val runtimeStatus = runtimeStatusProvider()
                val sandbox = sandboxProvider()
                PiToolCapabilityResult(buildJsonObject {
                    put("runtimeAvailable", sandbox != null)
                    runtimeStatus?.let { status ->
                        put("runtimeHealth", status.health.name.lowercase())
                        put("expectedVersion", status.expectedVersion)
                        put("detectedVersion", status.detectedVersion.orEmpty())
                        put("runtimeSource", status.source.name.lowercase())
                        put("runtimeMessage", status.message)
                    }
                    put("plugins", buildJsonArray {
                        catalog.plugins.forEach { plugin ->
                            add(buildJsonObject {
                                put("id", plugin.id)
                                put("name", plugin.name)
                                put("description", plugin.description)
                                put("sha256", plugin.module.sha256)
                            })
                        }
                    })
                    put("errors", buildJsonArray { catalog.errors.forEach { add(JsonPrimitive(it)) } })
                })
            }
            "execute" -> {
                val pluginId = request.arguments["plugin"]?.jsonPrimitive?.contentOrNull
                    ?.takeIf { it.matches(PLUGIN_ID_PATTERN) }
                    ?: error("WASM plugin id is required")
                val plugin = catalog.plugins.firstOrNull { it.id == pluginId }
                    ?: error("Enabled WASM plugin not found: $pluginId")
                val sandbox = sandboxProvider()
                    ?: error("Wasmtime $WASMTIME_VERSION is unavailable; set SWARM_WASMTIME to the pinned executable")
                val execution = sandbox.execute(plugin.module, request.arguments["input"] ?: JsonNull)
                PiToolCapabilityResult(
                    buildJsonObject {
                        put("plugin", plugin.id)
                        put("sha256", plugin.module.sha256)
                        put("durationMillis", execution.durationMillis)
                        put("output", execution.output)
                    }
                )
            }
            else -> error("Unsupported WASM plugin operation: ${request.operation}")
        }
    }
}

class WasmPiToolBrokerFactory(
    private val executor: PiToolCapabilityExecutor,
    private val auditStore: PiToolAuditStore,
) : PiToolBrokerFactory {
    override fun create(
        config: com.swarmeditor.common.model.AgentConfig,
        workingDirectory: File,
    ): PiToolBroker {
        require(workingDirectory.isDirectory) { "Pi tool broker workspace does not exist" }
        return AuditedPiToolBroker(
            agentId = config.id,
            workspace = workingDirectory,
            executor = executor,
            auditStore = auditStore,
            brokersCoreTools = false,
        )
    }
}

internal class RoutingPiToolCapabilityExecutor(
    private val defaultExecutor: PiToolCapabilityExecutor,
    private val wasmExecutor: PiToolCapabilityExecutor,
) : PiToolCapabilityExecutor {
    override suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult =
        if (request.tool == "wasm") wasmExecutor.execute(request) else defaultExecutor.execute(request)

    override suspend fun close() {
        defaultExecutor.close()
        wasmExecutor.close()
    }
}

fun configuredWasmtimeSandbox(
    environment: Map<String, String> = System.getenv(),
): WasmSandbox? {
    val executableName = environment["SWARM_WASMTIME"]?.trim()?.takeIf(String::isNotEmpty) ?: "wasmtime"
    val executable = resolveExecutable(executableName, environment["PATH"].orEmpty()) ?: return null
    return WasmtimeCliSandbox(executable)
}

private fun resolveExecutable(command: String, path: String): File? {
    val direct = File(command)
    val candidates = if (direct.isAbsolute || command.contains(File.separatorChar)) {
        sequenceOf(direct)
    } else {
        path.split(File.pathSeparatorChar).asSequence().filter(String::isNotBlank).map { File(it, command) }
    }
    return candidates.firstOrNull { it.isFile && it.canExecute() }?.canonicalFile
}

private fun safeMessage(error: Throwable): String = error.message
    ?.replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
    ?.trim()
    ?.take(500)
    ?.ifEmpty { null }
    ?: error::class.simpleName.orEmpty().ifEmpty { "Invalid plugin" }

private fun sha256(file: File): String = FileInputStream(file).use { input ->
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
    }
    digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private const val MANIFEST_FILE = "plugin.json"
private const val MAX_MANIFEST_BYTES = 64 * 1024L
private const val MAX_WASM_PLUGIN_INPUT_BYTES = 4 * 1024 * 1024
private const val MAX_WASM_PLUGIN_OUTPUT_CHARS = 4 * 1024 * 1024
private val PLUGIN_ID_PATTERN = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}")
private val MODULE_FILE_PATTERN = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\\.wasm")
private val SHA256_PATTERN = Regex("[0-9a-f]{64}")
