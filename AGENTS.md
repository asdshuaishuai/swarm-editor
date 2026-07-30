# Repository Guidelines

## Project Overview

Swarm Editor is a Kotlin/JVM Compose Desktop application built around the vendored `pi-0.80.10` coding-agent runtime. The desktop UI calls backend services directly in-process; do not add HTTP or WebSocket transport for normal application communication.

## Project Structure & Data Flow

- `common/src/commonMain/kotlin/com/swarmeditor/common/` contains serializable domain models and shared paths.
- `backend/src/main/kotlin/com/swarmeditor/backend/` contains stores, services, and the composition root in `Main.kt`.
- `backend/.../pi/` owns pi source discovery, JSONL RPC process management, and per-session runtime lifecycle.
- `desktopApp/src/main/kotlin/com/swarmeditor/desktop/` contains Compose UI, Decompose navigation, and `StateFlow`-based view models.
- `pi-0.80.10/` is vendored upstream TypeScript source. Follow its nested `AGENTS.md` when modifying it.
- Tests mirror production packages under `backend/src/test/` and `desktopApp/src/test/`.

The primary flow is UI → view model → in-memory Kotlin service → `PiRuntimeManager` → pi RPC subprocess → session persistence. Agent records are pi Profiles describing provider, model, thinking level, working directory, environment, and prompt policy. Do not reintroduce external CLI adapters or ACP.

## Build, Test, and Development Commands

Use JDK 21, Node.js 22.19+, npm, and the checked-in Gradle wrapper:

```bash
./gradlew :backend:preparePiRuntime  # npm ci and deterministic pi build
./gradlew :desktopApp:run            # run the desktop application
./gradlew test                       # all Kotlin tests
./gradlew build                      # full build, including pi runtime
./gradlew :desktopApp:stagePiRuntime # prepare production-only packaged runtime
```

Packaging tasks are `:desktopApp:packageDmg`, `:desktopApp:packageMsi`, and `:desktopApp:packageDeb`. No Detekt or ktlint task is configured.

## Coding Style & Concurrency

- Use official Kotlin formatting, coroutines, `kotlinx.serialization`, and `KotlinLogging`.
- Keep mutable stores/managers protected by `Mutex`; perform file/process I/O on `Dispatchers.IO`.
- Preserve `CancellationException`; never hide cancellation inside `runCatching`.
- Persist files atomically and roll back in-memory state on write failure.
- Compose view models should expose immutable `StateFlow`s and use lifecycle-owned scopes.

## Testing & Pull Requests

Use `kotlin.test`, MockK, and `runTest`. Test pi integration through `PiSessionProvider` fakes unless explicitly performing an RPC smoke test. Name tests as behavior sentences. Before a pull request, run `./gradlew test`, `./gradlew build`, and `git diff --check`; include screenshots for visible UI changes and describe any pi source patches separately.
