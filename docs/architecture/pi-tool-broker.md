# Pi Tool Broker Architecture

## Purpose

Keep Pi model inference, provider credentials, session history, and planning on the host while executing repository-facing tools behind capability-specific sandboxes. Native workspace commands use Bubblewrap on Linux; deterministic plugins use Wasmtime. Desktop-to-backend calls remain in-process Kotlin. Pi continues to use its existing JSONL subprocess channel; no HTTP or WebSocket control plane is introduced.

## Security Boundary

The host process owns credentials, Agent Profiles, MCP authorization, audit records, and sandbox lifecycle. A Bubblewrap worker receives only the workspace, the minimum read-only host runtime required to launch Node.js, an ephemeral home/tmp layout, and an explicit non-secret environment. It never receives provider keys, `config.env` wholesale, the real home directory, or Swarm configuration files.

Bubblewrap isolates user, mount, PID, IPC, UTS, cgroup, and network namespaces. When a systemd user session is available, the worker also enters a scope with CPU, memory, and task limits. Wasmtime modules are hash-pinned, receive JSON through stdin, return bounded JSON through stdout, inherit no environment, and receive no filesystem preopens. Network access must become a separate host-authorized capability, not a shell escape hatch.

OCI runtimes are excluded from both interactive Pi tools and counterfactual replay. Repository commands use Bubblewrap worktrees; Wasmtime remains limited to precompiled, hash-pinned capability modules.

## Data Flow

1. `PiRuntimeManager` asks a host-owned factory for a workspace-scoped `PiToolBroker` before starting Pi.
2. Pi starts on the host with broker-backed overrides for `read`, `bash`, `edit`, and `write`.
3. A tool call emits a `tool_request` JSONL envelope on Pi stdout.
4. `PiRpcSession` validates the request id, session nonce, operation allowlist, size, and deadline, then dispatches to the broker.
5. The broker executes native workspace operations in Bubblewrap and returns a bounded result through a `tool_response` command on Pi stdin. WASM capabilities use the separate Wasmtime sandbox.
6. Pi converts the response into its normal tool result, so conversation persistence and UI rendering remain unchanged.

Example envelopes:

```json
{"type":"tool_request","requestId":"tr-1","sessionNonce":"...","tool":"read","operation":"readFile","arguments":{"path":"src/App.kt"},"deadlineMillis":1785232800000}
{"type":"tool_response","requestId":"tr-1","sessionNonce":"...","success":true,"result":{"base64":"..."},"auditId":"audit-0123456789abcdef0123456789abcdef"}
```

Requests and responses require bounded line sizes, monotonic IDs, per-session nonces, and exactly-once completion. Unknown, duplicate, late, or cross-session responses are rejected.

## Pi Integration

Pi 0.83.0 exposes pluggable `BashOperations`, `ReadOperations`, `EditOperations`, and `WriteOperations`. `AgentSessionConfig` supports `baseToolsOverride`; Swarm Editor's vendored patch connects those operations to the existing RPC stream and adds the independently brokered `wasm` tool:

- Add a `StdioToolBrokerClient` used only when `SWARM_PI_TOOL_BROKER=stdio-v1` is set.
- Construct standard Pi tools with broker operations rather than reimplementing schemas, rendering, truncation, or mutation queues.
- Register `wasm list` and `wasm execute` through the same request/response protocol.
- Use `SWARM_PI_TOOL_BROKER_CORE_TOOLS=0` when only WASM should be brokered, leaving Pi core tools local.
- Disable untrusted project extensions in brokered mode; load only Swarm-owned extensions from the isolated Pi Agent directory.

### Implemented Pi Foundation

The vendored Pi runtime now exposes `baseToolsOverride` through both SDK session constructors and has an opt-in `stdio-v1` broker client:

- `SWARM_PI_TOOL_BROKER=stdio-v1` is accepted only in RPC mode and requires a host-provided `SWARM_PI_TOOL_BROKER_NONCE`.
- Standard `read`, `bash`, `edit`, and `write` tools keep their existing schemas, truncation, rendering metadata, and mutation queues while delegating their low-level operations.
- Tool requests and cancellations are emitted on the existing RPC stdout stream. `tool_response` records are dispatched by the existing RPC stdin loop; Pi never creates a competing stdin reader.
- Requests use monotonic ids, a per-process nonce, deadlines, bounded serialized payloads, strict exactly-once completion, and explicit rejection of duplicate, late, or cross-session responses.
- Workspace paths are converted lexically to workspace-relative paths before emission and paths outside the configured cwd are rejected.

The first bash protocol returns one bounded terminal output payload rather than streaming chunks.

### Implemented Kotlin Host Protocol

The Kotlin host now owns the other half of the stdio protocol:

- `PiRuntimeManager` accepts an optional `PiToolBrokerFactory`; without one, broker mode remains disabled.
- Broker environment variables are stripped from Agent Profile input and injected only by the host with a fresh per-process nonce.
- Requests require a valid monotonic-shaped id, matching nonce, allowlisted tool operation, future deadline, and a maximum serialized size of 1 MiB.
- Arguments receive a canonical SHA-256 hash for future audit correlation without copying raw values into audit records.
- Broker execution is deadline-bound and lifecycle-owned. Pi cancellation, duplicate ids, session failure, and close all cancel the corresponding coroutine and suppress late success responses.
- Successful responses require a nonblank audit id and are limited to 4 MiB; failures expose only bounded error text.

### Implemented Bubblewrap Capability Executor

An explicitly authorized Agent Profile can use a persistent Bubblewrap sandbox and a single Node JSONL worker without an image or daemon:

- Bubblewrap creates private namespaces, disables network access, hides the host home, binds system and Node/npm paths read-only, and mounts only the workspace at `/workspace`.
- `read`, `edit`, and `write` resolve workspace-relative paths inside the sandbox, reject traversal and symbolic-link components, and use atomic file replacement.
- `bash` runs in a detached process group with a 512 KiB combined output cap, deadline enforcement, and explicit cancellation. Its environment is rebuilt from `HOME`, `PATH`, and locale values; host/model secrets are not inherited.
- When available, `systemd-run --user --scope` limits the worker to 2 GiB memory, 256 tasks, and 200% CPU. `SWARM_BWRAP_SYSTEMD_SCOPE=required` can make this mandatory.
- Worker failure invalidates the sandbox. A later request creates a fresh worker; Pi session close terminates the active worker.
- Every request persists one immutable JSON audit record under `~/.swarm-editor/pi-tool-audit/`, containing broker session identity, Agent id, workspace hash, argument hash, timing, outcome, exit code, truncation, and error category—never raw arguments, command output, or environment values.
- `PiSession` exposes the broker session id and persisted audit ids. `PiSwarmTaskExecutor` carries them through success, failure, timeout, retry accumulation, and `SwarmStore` persistence, so evaluation cases can resolve concrete tool evidence instead of inferring it from text output.

Activation is host-controlled and off by default:

```bash
export SWARM_PI_TOOL_BROKER_AGENTS=reviewer,coder
# Optional: export SWARM_BWRAP_EXECUTABLE=/usr/bin/bwrap
# Optional: export SWARM_BWRAP_SYSTEMD_SCOPE=required
```

The host must provide Bubblewrap, Node.js, and `/bin/sh`. `SWARM_PI_TOOL_BROKER_AGENTS=*` is supported but intentionally broad; explicit Agent ids are recommended.

### WASM Capability Sandbox

`WasmtimeCliSandbox` is the narrower path for deterministic parsers, formatters, static analysis, and plugins. `WasmPluginRegistry` loads host-owned manifests from `~/.swarm-editor/wasm-plugins/`, validates safe identifiers and direct `.wasm` paths, and verifies the declared SHA-256 during every scan and execution. Modules are limited to 30 seconds, use bounded JSON stdin/stdout, and run without inherited environment or filesystem access.

`WasmtimeRuntimeManager` pins Wasmtime `47.0.2`, discovers an explicitly configured, packaged, managed, or `PATH` executable in that order, and requires the exact version. Managed installation supports Linux, macOS, and Windows on x86_64 and arm64, verifies the official archive digest, extracts without traversal or symlink entries, installs atomically, and records the archive and installed-binary hashes in `runtime.json`. See `wasm-plugins.md` for the manifest and operational model.

## Workspace and Process Semantics

Interactive sessions expose the current project; parallel Swarm tasks should receive separate worktrees or content-addressed snapshots. Every Bubblewrap path is interpreted relative to `/workspace`. Resolution occurs inside the sandbox, including symlink checks, so the Kotlin host never follows repository-controlled links into host files.

The current worker owns bash process groups, performs atomic file replacement, and supports cancellation without adding a network listener. Output is returned as one bounded payload rather than streamed. A future watchdog should restart the worker when process-group termination cannot be confirmed; the workspace survives because it is a bind mount.

## Credentials and Capabilities

Agent Profile environment must be split before broker activation:

- **Model environment:** provider credentials visible only to the host Pi process.
- **Tool environment:** a fixed non-secret allowlist (`HOME`, `PATH`, and locale); Agent Profile environment is never copied into Bubblewrap or Wasmtime.
- **Credentialed tools:** host-side MCP or service calls authorized per tool; secrets are consumed by the broker and never returned to Pi.

Each request records broker session, Agent, workspace identity hash, tool, normalized arguments hash, timing, outcome, exit status, truncation, and cancellation. Raw paths, commands, environment values, file contents, and tool output are not persisted. Content-addressed Swarm worktrees can later replace the interactive workspace hash with a repository snapshot identity.

## Delivery Order

1. **Completed:** expose Pi base-tool overrides and add protocol/state-machine tests.
2. **Completed:** add Kotlin broker contracts, nonce/capability/deadline validation, bounded responses, cancellation, and host-only activation.
3. **Completed:** persist redacted per-request audits and manage a persistent Bubblewrap worker.
4. **Completed:** route read/write/edit through a sandbox worker with traversal, symlink, and atomic-write checks.
5. **Partial:** bash has bounded output, deadlines, process-group cancellation, and worker-crash recovery; streaming and cancel-confirmation fallback remain.
6. **Completed:** separate model and tool environments and keep ambient project extensions disabled.
7. **Partial:** enable host-authorized Agent Profiles through explicit environment configuration; isolated Swarm worktrees remain.
8. **Partial:** automated tests cover traversal, symlinks, secret environment filtering, output floods, cancellation, worker crashes, registry integrity, managed-runtime tampering, and WASM execution; resource-exhaustion and packaged-runtime smoke tests remain.

## Design Evidence

- [SWE-ReX](https://github.com/SWE-agent/SWE-ReX) separates the agent from a replaceable runtime interface for sandboxed command execution.
- [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) treats sandboxing as an explicit provider boundary with per-environment execution APIs.
- [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) combines OS enforcement with network policy and keeps restrictions outside the agent prompt.
- [Wasmtime](https://wasmtime.dev/) provides a capability-oriented runtime for deterministic, hash-pinned WASM modules.

These projects inform the boundary and lifecycle, but Swarm Editor keeps the interactive implementation local, Pi-only, daemonless, and stdio-driven.
