# Managed Kotlin LSP

## Goal

Swarm Editor must not label code intelligence as connected merely because an LSP client exists. Kotlin support therefore has three independently visible states: runtime discovery, process connection, and successful semantic-token initialization. The JVM highlighter remains the explicit fallback.

## Runtime Lifecycle

`KotlinLspRuntimeManager` pins JetBrains Kotlin LSP `262.9593.0` for Linux, macOS, and Windows on x86_64 and arm64. The roughly 390MB official archive is installed only on user request under `~/.swarm-editor/runtimes/kotlin-lsp/`; it is not bundled with the desktop application.

Installation enforces a 512MB download limit, verifies the platform archive SHA-256 published by JetBrains, bounds entry count and expanded bytes, rejects path traversal, materializes only in-root relative archive links, and publishes the extracted runtime atomically. `runtime.json` binds version, platform, archive hash, and launcher hash so later inspection detects replacement.

## Command Resolution

Resolution order is:

1. `SWARM_LSP_KOTLIN` or `-Dswarm.lsp.kotlin=...`;
2. the managed runtime;
3. `kotlin-lsp` or `kotlin-language-server` on `PATH`.

An explicit override is never silently replaced by the managed command. The managed launcher always receives `--stdio`, a versioned `--system-path`, and warning-level logging. This avoids the upstream standalone server's default loopback socket and keeps the LSP subprocess on the existing JSON-RPC stdio boundary.

## Product Evidence

`LspService.serverStates` records `IDLE`, `CONNECTING`, `CONNECTED`, `UNAVAILABLE`, and `FAILED` transitions with the actual command and server name. The settings panel can install, repair, refresh, and run a real connection probe against a repository Kotlin file. “Connected” appears only after initialization and a semantic-token response succeed.

Unit tests cover archive integrity, launcher tampering, traversal, override precedence, managed-command routing, and connection-state transitions. `KotlinLspOfficialSmokeTest` additionally installs an externally supplied official archive and establishes a real stdio session.
