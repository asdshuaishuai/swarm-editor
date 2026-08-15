package com.swarmeditor.backend.pi

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.backend.capability.CapabilityRegistry
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal class BubblewrapPiToolBrokerFactory(
    private val runtimeExecutable: String,
    private val nodeExecutable: File,
    private val authorizedAgentIds: Set<String>,
    private val auditStore: PiToolAuditStore,
    private val wasmExecutor: PiToolCapabilityExecutor? = null,
    private val capabilityRegistry: CapabilityRegistry? = null,
    private val systemdRunExecutable: File? = null,
    private val workerFactory: PiToolWorkerFactory = defaultPiToolWorkerFactory,
) : PiToolBrokerFactory {
    init {
        require(runtimeExecutable.substringAfterLast(File.separatorChar) == "bwrap") {
            "Pi tool isolation requires Bubblewrap"
        }
        require(nodeExecutable.isFile && nodeExecutable.canExecute()) {
            "Pi tool Bubblewrap Node executable is unavailable: $nodeExecutable"
        }
        require(systemdRunExecutable == null || systemdRunExecutable.nameWithoutExtension == "systemd-run") {
            "Bubblewrap resource scope requires systemd-run"
        }
        require(authorizedAgentIds.isNotEmpty()) { "At least one Pi tool broker Agent id is required" }
        require(authorizedAgentIds.all { it == "*" || it.matches(agentIdPattern) }) {
            "Invalid Pi tool broker Agent id"
        }
    }

    override fun create(config: AgentConfig, workingDirectory: File): PiToolBroker? {
        if ("*" !in authorizedAgentIds && config.id !in authorizedAgentIds) return null
        require(workingDirectory.isDirectory) { "Pi tool broker workspace does not exist" }
        val defaultExecutor = BubblewrapCapabilityExecutor(
            runtimeExecutable = runtimeExecutable,
            nodeExecutable = nodeExecutable.canonicalFile,
            workspace = workingDirectory.canonicalFile,
            systemdRunExecutable = systemdRunExecutable?.canonicalFile,
            workerFactory = workerFactory,
        )
        return AuditedPiToolBroker(
            agentId = config.id,
            workspace = workingDirectory,
            executor = wasmExecutor?.let { RoutingPiToolCapabilityExecutor(defaultExecutor, it) } ?: defaultExecutor,
            auditStore = auditStore,
            capabilityRegistry = capabilityRegistry,
        )
    }

    companion object {
        fun fromEnvironment(
            environment: Map<String, String>,
            auditStore: PiToolAuditStore,
            wasmExecutor: PiToolCapabilityExecutor? = null,
            capabilityRegistry: CapabilityRegistry? = null,
            workerFactory: PiToolWorkerFactory = defaultPiToolWorkerFactory,
            osName: String = System.getProperty("os.name"),
        ): BubblewrapPiToolBrokerFactory? {
            val mode = environment[SANDBOX_MODE_ENV]?.trim()?.lowercase().orEmpty()
            require(mode in supportedModes) { "Unsupported $SANDBOX_MODE_ENV value: $mode" }

            val explicit = mode == "bubblewrap"
            val authorizedAgentIds = parseAuthorizedAgentIds(environment)
                ?: if (explicit) setOf("*") else return null
            if (!osName.lowercase().contains("linux")) {
                check(!explicit) { "Bubblewrap Pi tool isolation is only available on Linux" }
                return null
            }

            val path = environment["PATH"].orEmpty()
            val runtime = resolveExecutable(
                environment[BUBBLEWRAP_EXECUTABLE_ENV]?.trim()?.takeIf(String::isNotEmpty) ?: "bwrap",
                path,
            )
            val node = resolveExecutable(
                environment[PI_NODE_EXECUTABLE_ENV]?.trim()?.takeIf(String::isNotEmpty) ?: "node",
                path,
            )
            if (runtime == null || node == null) {
                check(!explicit) {
                    "Bubblewrap Pi tool isolation requires executable bwrap and Node.js"
                }
                return null
            }
            val scopeMode = environment[SYSTEMD_SCOPE_MODE_ENV]?.trim()?.lowercase().orEmpty().ifEmpty { "auto" }
            require(scopeMode in supportedScopeModes) { "Unsupported $SYSTEMD_SCOPE_MODE_ENV value: $scopeMode" }
            val systemdRun = if (scopeMode == "off") {
                null
            } else {
                resolveExecutable(
                    environment[SYSTEMD_RUN_EXECUTABLE_ENV]?.trim()?.takeIf(String::isNotEmpty) ?: "systemd-run",
                    path,
                )?.takeIf {
                    environment["XDG_RUNTIME_DIR"].isNullOrBlank().not() &&
                        environment["DBUS_SESSION_BUS_ADDRESS"].isNullOrBlank().not()
                }
            }
            check(scopeMode != "required" || systemdRun != null) {
                "Bubblewrap systemd resource scope is required but unavailable"
            }
            return BubblewrapPiToolBrokerFactory(
                runtimeExecutable = runtime.path,
                nodeExecutable = node,
                authorizedAgentIds = authorizedAgentIds,
                auditStore = auditStore,
                wasmExecutor = wasmExecutor,
                capabilityRegistry = capabilityRegistry,
                systemdRunExecutable = systemdRun,
                workerFactory = workerFactory,
            )
        }
    }
}

internal class BubblewrapCapabilityExecutor(
    private val runtimeExecutable: String,
    private val nodeExecutable: File,
    private val workspace: File,
    private val systemdRunExecutable: File?,
    private val workerFactory: PiToolWorkerFactory,
) : PiToolCapabilityExecutor {
    private val lifecycleMutex = Mutex()
    private val nodeRuntimeRoot = if (nodeExecutable.parentFile.name == "bin") {
        nodeExecutable.parentFile.parentFile
    } else {
        nodeExecutable.parentFile
    }.canonicalFile
    private val sandboxNodePath = "$SANDBOX_NODE_RUNTIME_PATH/${
        nodeExecutable.relativeTo(nodeRuntimeRoot).invariantSeparatorsPath
    }"
    private var worker: PiToolWorker? = null

    override suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult {
        val active = ensureStarted()
        return try {
            active.execute(request)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            invalidate(active)
            throw error
        }
    }

    override suspend fun close() {
        val active = lifecycleMutex.withLock {
            worker.also { worker = null }
        } ?: return
        withContext(NonCancellable) { active.close() }
    }

    private suspend fun ensureStarted(): PiToolWorker = lifecycleMutex.withLock {
        worker?.let { return@withLock it }
        workerFactory.start(
            command = buildWorkerCommand(),
            workingDirectory = workspace,
            environment = emptyMap(),
        ).also { worker = it }
    }

    private suspend fun invalidate(expected: PiToolWorker) {
        val removed = lifecycleMutex.withLock {
            if (worker === expected) {
                worker = null
                true
            } else {
                false
            }
        }
        if (removed) withContext(NonCancellable) { runCatching { expected.close() } }
    }

    internal fun buildWorkerCommand(): List<String> {
        val bubblewrapCommand = buildBubblewrapCommand()
        return systemdRunExecutable?.let { executable ->
            buildList {
                add(executable.path)
                addAll(listOf("--user", "--scope", "--quiet", "--collect"))
                addAll(listOf("-p", "MemoryMax=2G"))
                addAll(listOf("-p", "TasksMax=256"))
                addAll(listOf("-p", "CPUQuota=200%"))
                addAll(bubblewrapCommand)
            }
        } ?: bubblewrapCommand
    }

    private fun buildBubblewrapCommand(): List<String> = buildList {
        add(runtimeExecutable)
        addAll(listOf("--unshare-all", "--unshare-user", "--die-with-parent", "--new-session", "--disable-userns"))
        addAll(listOf("--clearenv", "--cap-drop", "ALL"))
        addAll(listOf("--proc", "/proc", "--dev", "/dev"))
        systemDirectories.forEach { directory ->
            addAll(listOf("--ro-bind-try", directory, directory))
        }
        addAll(listOf("--dir", "/etc"))
        systemFiles.forEach { file ->
            addAll(listOf("--ro-bind-try", file, file))
        }
        addAll(listOf("--tmpfs", "/tmp", "--tmpfs", "/run"))
        addAll(listOf("--dir", "/swarm-toolchains", "--dir", "/workspace"))
        addAll(listOf("--ro-bind", nodeRuntimeRoot.path, SANDBOX_NODE_RUNTIME_PATH))
        addAll(listOf("--bind", workspace.path, SANDBOX_WORKSPACE_PATH))
        addAll(listOf("--setenv", "PATH", "${sandboxNodePath.substringBeforeLast('/')}:$SYSTEM_PATH"))
        addAll(listOf("--setenv", "HOME", "/tmp"))
        addAll(listOf("--setenv", "TMPDIR", "/tmp"))
        addAll(listOf("--setenv", "LANG", "C.UTF-8"))
        addAll(listOf("--setenv", "SWARM_TOOL_WORKSPACE", SANDBOX_WORKSPACE_PATH))
        addAll(listOf("--chdir", SANDBOX_WORKSPACE_PATH))
        addAll(listOf("--", sandboxNodePath, "-e", PI_TOOL_WORKER_SCRIPT))
    }
}

private fun parseAuthorizedAgentIds(environment: Map<String, String>): Set<String>? {
    val raw = environment[TOOL_AGENT_IDS_ENV]?.trim().orEmpty()
    if (raw.isEmpty()) return null
    return raw.split(',')
        .map(String::trim)
        .filter(String::isNotEmpty)
        .toSet()
        .also { ids -> require(ids.isNotEmpty()) { "$TOOL_AGENT_IDS_ENV cannot be empty" } }
}

private fun resolveExecutable(command: String, path: String): File? {
    val direct = File(command)
    val candidates = if (direct.isAbsolute || command.contains(File.separatorChar)) {
        sequenceOf(direct)
    } else {
        path.split(File.pathSeparatorChar)
            .asSequence()
            .filter(String::isNotBlank)
            .map { directory -> File(directory, command) }
    }
    return candidates.firstOrNull { it.isFile && it.canExecute() }?.canonicalFile
}

private const val SANDBOX_MODE_ENV = "SWARM_PI_TOOL_SANDBOX"
private const val BUBBLEWRAP_EXECUTABLE_ENV = "SWARM_BWRAP_EXECUTABLE"
private const val PI_NODE_EXECUTABLE_ENV = "SWARM_PI_NODE"
private const val TOOL_AGENT_IDS_ENV = "SWARM_PI_TOOL_BROKER_AGENTS"
private const val SYSTEMD_SCOPE_MODE_ENV = "SWARM_BWRAP_SYSTEMD_SCOPE"
private const val SYSTEMD_RUN_EXECUTABLE_ENV = "SWARM_SYSTEMD_RUN_EXECUTABLE"
private const val SANDBOX_NODE_RUNTIME_PATH = "/swarm-toolchains/node"
private const val SANDBOX_WORKSPACE_PATH = "/workspace"
private const val SYSTEM_PATH = "/usr/local/bin:/usr/bin:/bin"
private val supportedModes = setOf("", "auto", "bubblewrap")
private val supportedScopeModes = setOf("auto", "required", "off")
private val agentIdPattern = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}")
private val systemDirectories = listOf("/usr", "/bin", "/sbin", "/lib", "/lib64")
private val systemFiles = listOf(
    "/etc/alternatives",
    "/etc/ca-certificates",
    "/etc/ssl",
    "/etc/ld.so.cache",
    "/etc/nsswitch.conf",
    "/etc/passwd",
    "/etc/group",
    "/etc/gitconfig",
)
