# AGENTS.md — Swarm Editor

Compact guidance for AI agents working in this Kotlin/JVM repository.

## Project

Swarm Editor — Multi-Agent coordination desktop client. Kotlin/JVM full-stack MVP.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Build | Gradle (Kotlin DSL) + Version Catalog | 8.x |
| Common | Kotlin Multiplatform (JVM target) | 2.3.10 |
| Backend | Ktor Server (CIO engine) | 3.2.2 |
| Frontend | Compose Desktop | 1.8.1 |
| ACP | `com.agentclientprotocol:acp` | 0.13.1 |
| MCP | `io.modelcontextprotocol:kotlin-sdk-client` | 0.4.0 |
| JDK | OpenJDK | 21+ |

## Modules

```
common/       # Kotlin Multiplatform — shared models, protocol, config paths
backend/      # JVM + Ktor — ACP/MCP/Agent/Session/Skill services, REST API
desktopApp/   # JVM + Compose Desktop — UI panels, ViewModels, API client
```

- `common` uses `kotlinMultiplatform` plugin with `jvm { compilerOptions { jvmTarget = JVM_21 } }`
- `backend` application plugin: `mainClass = "com.swarmeditor.backend.MainKt"`
- `desktopApp` main class: `com.swarmeditor.desktop.MainKt`
- `TYPESAFE_PROJECT_ACCESSORS` enabled — use `projects.common`, `projects.backend`, etc.

## Developer Commands

```bash
# Build everything
./gradlew build

# Run tests (currently no tests exist in the project)
./gradlew test

# Run single module tests when they exist
./gradlew :common:test
./gradlew :backend:test
./gradlew :desktopApp:test

# Start backend service
./gradlew :backend:run

# Start desktop client
./gradlew :desktopApp:run

# Clean build
./gradlew clean
```

## Architecture

### Current State: Hybrid Architecture

The codebase is in **transition** between two architectures:

1. **Legacy**: Separate backend process (Ktor HTTP server on `:8080`) + Compose Desktop frontend calling REST API via `ApiClient`
2. **Target (MVP Design)**: Embedded architecture — Compose Desktop process directly calls Service layer (no HTTP, no network)

**Current reality**: `Main.kt` still starts an embedded Ktor server with REST routes. `desktopApp` has `ApiClient` making HTTP calls to `localhost:8080`. The design doc (`docs/superpowers/specs/2026-06-08-mvp-design.md`) specifies ViewModel → direct Service layer calls.

### Service Layer (Global Instances in `backend/Main.kt`)

```kotlin
val agentRegistry = AgentRegistry()
val connectionManager = AcpConnectionManager()
val sessionStore = SessionStore(File(ConfigPaths.SESSIONS_DIR))
val mcpStore = McpStore(File(ConfigPaths.MCP_SERVERS_JSON))
val skillStore = SkillStore(File(ConfigPaths.SKILLS_JSON))
val skillScanner = SkillScanner()

val agentService = AgentService(agentRegistry, connectionManager)
val sessionService = SessionService(sessionStore)
val mcpService = McpService(mcpStore)
val skillService = SkillService(skillStore, skillScanner)
```

All initialized in `runBlocking` before server starts.

### ACP Protocol

- JSON-RPC 2.0 over stdio (JSON Lines)
- `AcpConnection` manages single Agent process lifecycle
- `AcpConnectionManager` manages multiple connections with `Mutex` for thread safety
- Lifecycle: `DISCONNECTED → CONNECTING → CONNECTED → ERROR`

### Agent Adapter Pattern

5 built-in adapters in `backend/agent/adapter/`:
- `ClaudeCodeAdapter` — `claude acp`, config `~/.claude/settings.json` (JSON)
- `GeminiCliAdapter` — `gemini --acp`, config `~/.gemini/settings.json` (JSON)
- `KimiCodeAdapter` — `kimi acp`, config `~/.kimi/config.toml` (TOML)
- `QwenCodeAdapter` — `qwen --acp`, config `~/.qwen/settings.json` (JSON)
- `OpenCodeAdapter` — `opencode acp`, config `~/.config/opencode/opencode.json` (JSON)

Each adapter implements `AgentAdapter` interface for: detection, native config I/O, MCP config sync.

### Config Paths

All user-facing config lives in `~/.swarm-editor/`:
- `agents.json` — Agent configurations
- `mcp-servers.json` — MCP server unified store
- `skills.json` — Skills unified store
- `sessions/{id}.json` — Session message persistence

## Entry Points

| Component | Class | Path |
|---|---|---|
| Backend Server | `MainKt` | `backend/src/main/kotlin/.../backend/Main.kt` |
| Desktop App | `MainKt` | `desktopApp/src/main/kotlin/.../desktop/Main.kt` |

Backend `Main.kt` wires Ktor plugins (CORS, ContentNegotiation) and routes (`agentRoutes`, `mcpRoutes`, `sessionRoutes`, `skillRoutes`).

## Testing

⚠️ **No tests currently exist** in the project. Test directories are empty.

When adding tests:
- Backend tests: `backend/src/test/kotlin/.../`
- Use `kotlin-test`, `kotlinx-coroutines-test`, `ktor-server-test-host`, `mockk`
- Common tests: `common/src/commonTest/kotlin/.../`
- Desktop tests: `desktopApp/src/test/kotlin/.../`

## UI / Frontend

### Theme
- Geek dark theme in `desktopApp/src/.../theme/Theme.kt`
- Uses Material3 `darkColorScheme` with custom `GeekColorScheme`
- Color constants: `Bg`, `Bg2`, `Bg3`, `Tx`, `Tx2`, `Ac` (accent `#00d4ff`), `Gn`, `Rd`, etc.
- Custom components in `theme/Components.kt`

### ViewModels
- `AgentViewModel`, `SessionViewModel`, `SettingsViewModel`, `McpViewModel`, `SkillViewModel`
- Use `StateFlow` for state management
- Currently create instances with `remember { AgentViewModel() }` in `App.kt`

### UI Panels
- `AgentBar` — left vertical bar with agent icons
- `SessionPanel` — session list sidebar
- `ChatArea` — main chat/message display
- `RightPanel` — MCP/Skills/Activity Log
- `SettingsModal` — settings overlay

## Code Conventions

- `kotlin.code.style=official` in `gradle.properties`
- Coroutines + `suspend` functions throughout backend
- `io.github.oshai.kotlinlogging.KotlinLogging` for logging (not SLF4J directly)
- `kotlinx.serialization` for all JSON (not Jackson/Gson)
- `Result<T>` pattern for fallible operations in ACP layer
- `Mutex.withLock` for thread-safe state in connection managers

## Important Constraints

1. **Koog 0.7.3 pins Kotlin to 2.3.10** — do not upgrade Kotlin without checking Koog compatibility
2. **JDK 21 required** — `jvmToolchain(21)` in all modules
3. **No test coverage currently** — any new feature should include tests
4. **Architecture in flux** — the design doc specifies embedded direct-calls, but current code still uses HTTP REST. Be aware which pattern you're modifying.
5. **Sensitive command detection** exists in ACP layer (19 regex rules for dangerous CLI commands)

## Design Documents

- `docs/superpowers/specs/2026-06-08-mvp-design.md` — MVP design spec
- `docs/superpowers/plans/2026-06-08-mvp-deep-implementation.md` — Implementation plan with task checklist

## Related Instruction Files

- `CLAUDE.md` — Contains **mandatory prompt enhancement meta-rule** (in Chinese). All agent tasks MUST go through a 4-step enhancement flow with user approval before execution. Read it before making any changes.
