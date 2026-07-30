package com.swarmeditor.backend.pi

import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

internal interface PiToolWorker {
    suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult
    suspend fun close()
}

internal fun interface PiToolWorkerFactory {
    fun start(command: List<String>, workingDirectory: File, environment: Map<String, String>): PiToolWorker
}

internal class JsonLinePiToolWorker(
    command: List<String>,
    workingDirectory: File,
    environment: Map<String, String> = emptyMap(),
) : PiToolWorker {
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val process = ProcessBuilder(command)
        .directory(workingDirectory)
        .apply { environment().putAll(environment) }
        .start()
    private val writer = process.outputStream.bufferedWriter(Charsets.UTF_8)
    private val writerMutex = Mutex()
    private val requestIds = AtomicLong()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<JsonObject>>()
    private val canceled = ConcurrentHashMap.newKeySet<String>()
    private val terminalError = AtomicReference<Throwable?>()
    private val closed = AtomicBoolean()

    init {
        scope.launch {
            try {
                readJsonLines(process.inputStream, ::handleLine, MAX_PI_TOOL_WORKER_LINE_BYTES)
                fail(IllegalStateException("Pi tool worker output closed"))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                fail(IllegalStateException("Pi tool worker output failed", error))
            }
        }
        scope.launch {
            com.swarmeditor.backend.process.readTruncatedUtf8Lines(process.errorStream) { line ->
                workerLog.warn { "pi-tool-worker[${process.pid()}]: $line" }
            }
        }
        scope.launch {
            val exitCode = process.waitFor()
            fail(IllegalStateException("Pi tool worker exited with code $exitCode"))
        }
    }

    override suspend fun execute(request: PiToolBrokerRequest): PiToolCapabilityResult {
        terminalError.get()?.let { throw it }
        val remainingMillis = request.deadlineMillis - System.currentTimeMillis()
        require(remainingMillis > 0) { "Tool broker request deadline expired" }
        val id = "wr-${requestIds.incrementAndGet()}"
        val response = CompletableDeferred<JsonObject>()
        pending[id] = response
        terminalError.get()?.let(response::completeExceptionally)
        var responseReceived = false
        try {
            send(buildJsonObject {
                put("type", "execute")
                put("id", id)
                put("tool", request.tool)
                put("operation", request.operation)
                put("arguments", request.arguments)
                put("deadlineMillis", request.deadlineMillis)
            })
            val payload = withTimeout(remainingMillis) { response.await() }
            responseReceived = true
            if (payload["success"]?.jsonPrimitive?.booleanOrNull != true) {
                error(payload["error"]?.jsonPrimitive?.contentOrNull ?: "Pi tool worker request failed")
            }
            val metadata = payload["metadata"]?.let { runCatching { it.jsonObject }.getOrNull() }
            return PiToolCapabilityResult(
                result = payload["result"] ?: error("Pi tool worker result is missing"),
                exitCode = metadata?.get("exitCode")?.jsonPrimitive?.intOrNull,
                outputTruncated = metadata?.get("outputTruncated")?.jsonPrimitive?.booleanOrNull ?: false,
            )
        } finally {
            pending.remove(id)
            if (!responseReceived && terminalError.get() == null) {
                rememberCanceled(id)
                withContext(NonCancellable) {
                    withTimeoutOrNull(WORKER_CANCEL_WRITE_TIMEOUT_MILLIS) {
                        runCatching {
                            send(buildJsonObject {
                                put("type", "cancel")
                                put("id", id)
                            })
                        }
                    }
                }
            }
        }
    }

    override suspend fun close() {
        if (!closed.compareAndSet(false, true)) return
        withContext(NonCancellable + Dispatchers.IO) {
            fail(IllegalStateException("Pi tool worker closed"))
            writerMutex.withLock { runCatching { writer.close() } }
            if (process.isAlive) {
                process.destroy()
                if (!process.waitFor(WORKER_CLOSE_TIMEOUT_MILLIS, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly()
                    process.waitFor()
                }
            }
            scope.cancel()
        }
    }

    private suspend fun send(message: JsonObject) {
        val encoded = json.encodeToString(message)
        require(encoded.encodeToByteArray().size <= MAX_PI_TOOL_BROKER_REQUEST_BYTES) {
            "Pi tool worker request exceeds ${MAX_PI_TOOL_BROKER_REQUEST_BYTES}B limit"
        }
        writerMutex.withLock {
            terminalError.get()?.let { throw it }
            withContext(Dispatchers.IO) {
                writer.write(encoded)
                writer.newLine()
                writer.flush()
            }
        }
    }

    private fun handleLine(line: String) {
        if (line.isBlank()) return
        val payload = runCatching { json.parseToJsonElement(line).jsonObject }
            .getOrElse { error ->
                fail(IllegalStateException("Pi tool worker emitted invalid JSON", error))
                return
            }
        val id = payload["id"]?.jsonPrimitive?.contentOrNull ?: run {
            fail(IllegalStateException("Pi tool worker response id is missing"))
            return
        }
        val response = pending.remove(id)
        if (response != null) {
            response.complete(payload)
        } else if (!canceled.remove(id)) {
            fail(IllegalStateException("Pi tool worker returned an unknown request: $id"))
        }
    }

    private fun rememberCanceled(id: String) {
        synchronized(canceled) {
            canceled += id
            while (canceled.size > MAX_TRACKED_CANCELED_WORKER_REQUESTS) {
                canceled.firstOrNull()?.let(canceled::remove) ?: break
            }
        }
    }

    private fun fail(error: Throwable) {
        if (!terminalError.compareAndSet(null, error)) return
        pending.values.forEach { it.completeExceptionally(error) }
        pending.clear()
        if (process.isAlive) process.destroyForcibly()
    }
}

internal val defaultPiToolWorkerFactory = PiToolWorkerFactory { command, workingDirectory, environment ->
    JsonLinePiToolWorker(command, workingDirectory, environment)
}

private val workerLog = KotlinLogging.logger {}
private const val MAX_PI_TOOL_WORKER_LINE_BYTES = MAX_PI_TOOL_BROKER_RESPONSE_BYTES + 64 * 1024
private const val WORKER_CANCEL_WRITE_TIMEOUT_MILLIS = 250L
private const val WORKER_CLOSE_TIMEOUT_MILLIS = 2_000L
private const val MAX_TRACKED_CANCELED_WORKER_REQUESTS = 4_096

internal val PI_TOOL_WORKER_SCRIPT =
    """
    const fs = require("node:fs");
    const path = require("node:path");
    const readline = require("node:readline");
    const { spawn } = require("node:child_process");

    const root = fs.realpathSync(process.env.SWARM_TOOL_WORKSPACE || "/workspace");
    const outputLimit = 512 * 1024;
    const tasks = new Map();
    const input = readline.createInterface({ input: process.stdin });

    function send(value) {
      let encoded = JSON.stringify(value);
      if (Buffer.byteLength(encoded, "utf8") > 4 * 1024 * 1024) {
        encoded = JSON.stringify({ id: value.id, success: false, error: "Tool operation response exceeds 4194304B limit" });
      }
      process.stdout.write(encoded + "\n");
    }

    function safeError(error) {
      if (!error || typeof error.message !== "string") return "Tool operation failed";
      return error.message.slice(0, 2000);
    }

    function relativeSegments(value) {
      if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
        throw new Error("Invalid workspace-relative path");
      }
      if (path.posix.isAbsolute(value)) throw new Error("Absolute paths are not allowed");
      const normalized = path.posix.normalize(value);
      if (normalized === ".." || normalized.startsWith("../")) throw new Error("Path escapes workspace");
      if (normalized === ".") return [];
      return normalized.split("/").filter(Boolean);
    }

    function targetPath(value) {
      return path.join(root, ...relativeSegments(value));
    }

    function ensureWithinWorkspace(value) {
      if (value !== root && !value.startsWith(root + path.sep)) throw new Error("Path escapes workspace");
      return value;
    }

    async function rejectSymlinkComponents(target) {
      const relative = path.relative(root, target);
      if (relative === "") return;
      let current = root;
      for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        try {
          const stat = await fs.promises.lstat(current);
          if (stat.isSymbolicLink()) throw new Error("Symbolic links are not allowed");
        } catch (error) {
          if (error && error.code === "ENOENT") return;
          throw error;
        }
      }
    }

    async function existingPath(value) {
      const target = targetPath(value);
      await rejectSymlinkComponents(target);
      return ensureWithinWorkspace(await fs.promises.realpath(target));
    }

    async function writablePath(value) {
      const target = targetPath(value);
      await rejectSymlinkComponents(target);
      const parent = ensureWithinWorkspace(await fs.promises.realpath(path.dirname(target)));
      const finalTarget = path.join(parent, path.basename(target));
      try {
        const stat = await fs.promises.lstat(finalTarget);
        if (stat.isSymbolicLink()) throw new Error("Symbolic links are not allowed");
        if (stat.isDirectory()) throw new Error("Cannot overwrite a directory");
      } catch (error) {
        if (!error || error.code !== "ENOENT") throw error;
      }
      return finalTarget;
    }

    async function mkdirPath(value) {
      const target = targetPath(value);
      await rejectSymlinkComponents(target);
      let ancestor = target;
      while (true) {
        try {
          ancestor = ensureWithinWorkspace(await fs.promises.realpath(ancestor));
          break;
        } catch (error) {
          if (!error || error.code !== "ENOENT") throw error;
          const parent = path.dirname(ancestor);
          if (parent === ancestor) throw new Error("Path escapes workspace");
          ancestor = parent;
        }
      }
      await fs.promises.mkdir(target, { recursive: true });
      await rejectSymlinkComponents(target);
      ensureWithinWorkspace(await fs.promises.realpath(target));
      return {};
    }

    function detectMime(buffer) {
      if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
      if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
      if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
      if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
      return null;
    }

    async function atomicWrite(target, content) {
      if (typeof content !== "string") throw new Error("File content must be a string");
      let mode = 0o644;
      try {
        mode = (await fs.promises.stat(target)).mode & 0o777;
      } catch (error) {
        if (!error || error.code !== "ENOENT") throw error;
      }
      const temporary = path.join(path.dirname(target), ".swarm-write-" + process.pid + "-" + Math.random().toString(16).slice(2));
      let handle;
      try {
        handle = await fs.promises.open(temporary, "wx", mode);
        await handle.writeFile(content, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.promises.rename(temporary, target);
        const directory = await fs.promises.open(path.dirname(target), "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } finally {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.unlink(temporary).catch(() => {});
      }
      return {};
    }

    function killProcessGroup(child) {
      if (!child || child.killed) return;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      setTimeout(() => {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }, 250).unref();
    }

    function executeBash(argumentsValue, task) {
      if (!argumentsValue || typeof argumentsValue.command !== "string") throw new Error("Bash command is required");
      return existingPath(argumentsValue.cwd || ".").then((cwd) => new Promise((resolve, reject) => {
        const child = spawn("/bin/sh", ["-lc", argumentsValue.command], {
          cwd,
          detached: true,
          env: {
            HOME: "/tmp",
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            LANG: process.env.LANG || "C.UTF-8",
            LC_ALL: process.env.LC_ALL || "C.UTF-8"
          },
          stdio: ["ignore", "pipe", "pipe"]
        });
        task.cancel = () => killProcessGroup(child);
        const chunks = [];
        let bytes = 0;
        let truncated = false;
        let settled = false;
        const collect = (chunk) => {
          if (bytes >= outputLimit) {
            truncated = true;
            return;
          }
          const remaining = outputLimit - bytes;
          const accepted = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
          chunks.push(accepted);
          bytes += accepted.length;
          if (accepted.length < chunk.length) truncated = true;
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        child.once("close", (code) => {
          if (settled) return;
          settled = true;
          resolve({
            result: { output: Buffer.concat(chunks).toString("utf8"), exitCode: code },
            metadata: { exitCode: code, outputTruncated: truncated }
          });
        });
      }));
    }

    async function execute(request, task) {
      const argumentsValue = request.arguments || {};
      const operation = request.tool + "." + request.operation;
      if (operation === "read.access" || operation === "edit.access") {
        await fs.promises.access(await existingPath(argumentsValue.path));
        return { result: {} };
      }
      if (operation === "read.readFile" || operation === "edit.readFile") {
        const buffer = await fs.promises.readFile(await existingPath(argumentsValue.path));
        return { result: { base64: buffer.toString("base64") } };
      }
      if (operation === "read.detectImageMimeType") {
        const target = await existingPath(argumentsValue.path);
        const handle = await fs.promises.open(target, "r");
        try {
          const buffer = Buffer.alloc(16);
          const read = await handle.read(buffer, 0, buffer.length, 0);
          return { result: { mimeType: detectMime(buffer.subarray(0, read.bytesRead)) } };
        } finally {
          await handle.close();
        }
      }
      if (operation === "edit.writeFile" || operation === "write.writeFile") {
        return { result: await atomicWrite(await writablePath(argumentsValue.path), argumentsValue.content) };
      }
      if (operation === "write.mkdir") {
        return { result: await mkdirPath(argumentsValue.path) };
      }
      if (operation === "bash.exec") return executeBash(argumentsValue, task);
      throw new Error("Unsupported tool operation");
    }

    async function handle(request) {
      if (!request || request.type !== "execute" || !/^wr-[1-9][0-9]{0,18}$/.test(request.id || "")) {
        throw new Error("Invalid worker request");
      }
      if (!Number.isFinite(request.deadlineMillis) || request.deadlineMillis <= Date.now()) {
        send({ id: request.id, success: false, error: "Tool operation deadline expired" });
        return;
      }
      if (tasks.has(request.id)) {
        send({ id: request.id, success: false, error: "Duplicate worker request" });
        return;
      }
      const task = { done: false, cancel: () => {} };
      tasks.set(request.id, task);
      const timer = setTimeout(() => {
        if (task.done) return;
        task.done = true;
        task.cancel();
        tasks.delete(request.id);
        send({ id: request.id, success: false, error: "Tool operation deadline expired" });
      }, request.deadlineMillis - Date.now());
      timer.unref();
      try {
        const value = await execute(request, task);
        if (task.done) return;
        task.done = true;
        send({ id: request.id, success: true, result: value.result, metadata: value.metadata || {} });
      } catch (error) {
        if (task.done) return;
        task.done = true;
        send({ id: request.id, success: false, error: safeError(error) });
      } finally {
        clearTimeout(timer);
        if (tasks.get(request.id) === task) tasks.delete(request.id);
      }
    }

    input.on("line", (line) => {
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        return;
      }
      if (request && request.type === "cancel") {
        const task = tasks.get(request.id);
        if (!task || task.done) return;
        task.done = true;
        task.cancel();
        tasks.delete(request.id);
        return;
      }
      handle(request).catch((error) => {
        if (request && request.id) send({ id: request.id, success: false, error: safeError(error) });
      });
    });

    input.on("close", () => {
      for (const task of tasks.values()) task.cancel();
      tasks.clear();
    });
    """.trimIndent()
