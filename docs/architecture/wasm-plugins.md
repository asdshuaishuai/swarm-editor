# WASM Plugin Architecture

## Scope

Swarm Editor uses WASM for deterministic, capability-sized plugins such as parsers, formatters, and static analyzers. It does not run repository shells, Gradle, npm, or Git; native commands remain on the Bubblewrap path. Desktop code calls Kotlin services in-process, while Pi invokes the broker over its existing JSONL stdio stream.

## Plugin Layout

Place each plugin in its own directory under `~/.swarm-editor/wasm-plugins/`:

```text
formatter/
├── plugin.json
└── module.wasm
```

Example manifest:

```json
{
  "id": "formatter",
  "name": "Formatter",
  "description": "Deterministic formatter",
  "module": "module.wasm",
  "sha256": "<64 lowercase hex>",
  "enabled": true,
  "timeoutMillis": 5000,
  "maxInputBytes": 1048576,
  "maxOutputChars": 4194304
}
```

IDs and module names must use safe ASCII names, and `module` must reference a direct `.wasm` file in the plugin directory. Timeouts are limited to 30 seconds; input and output limits cannot exceed 4 MiB. The registry verifies the module SHA-256 while scanning and immediately before execution.

## Runtime Lifecycle

`WasmtimeRuntimeManager` pins Wasmtime `47.0.2`. Discovery order is `SWARM_WASMTIME`, packaged application resources, the managed runtime directory, then `PATH`. Every candidate must report the exact pinned version.

The Plugin Center can install or repair the managed runtime on supported Linux, macOS, and Windows x86_64/arm64 systems. Installation downloads the matching official archive, enforces a size bound, verifies its pinned digest, rejects unsafe archive entries, and atomically publishes the executable. `runtime.json` binds the archive and installed-binary hashes so later inspection detects replacement or corruption.

## Execution and Audit

Pi exposes `wasm list` and `wasm execute`. Modules receive bounded JSON on stdin and return bounded JSON on stdout. They inherit no environment and receive no filesystem preopens or network capability. Every broker request produces the same redacted audit metadata as native tools without storing arguments or output.

Bubblewrap-authorized Agent Profiles broker Pi core tools and WASM together. Other Profiles use the WASM-only broker, with `SWARM_PI_TOOL_BROKER_CORE_TOOLS=0`, so Pi core tools continue locally while WASM execution remains host-selected and audited.
