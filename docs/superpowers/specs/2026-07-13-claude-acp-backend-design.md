# Claude Code ACP Backend Design

## Goal

Make the Claude Code ACP path protocol-correct and durable: a local Swarm Editor session lazily owns one remote ACP session ID, sends prompts through that remote ID, and closes it best-effort without preventing local cleanup.

## Evidence and Scope

The official ACP v1 schema requires an integer `protocolVersion`; `session/new` requires `cwd` and `mcpServers`; `session/prompt.prompt` is an array of content blocks; and `session/prompt` completes with `stopReason` while agent output arrives through `session/update` notifications. Current DTOs do not match these wire shapes. Current `SessionRoutes` sends local session IDs directly to ACP, discards `session/new` IDs, and never closes a remote session.

This change covers only Claude Code ACP session lifecycle and transport failure handling. It does not alter Claude Code settings, MCP configuration synchronization, credentials, permissions, or invoke a live CLI.

Sources:
- https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/settings

## Design

### Session identity

Append nullable `remoteSessionId` to the shared `Session` model. Persist it in `SessionStore.SessionFile` and expose an atomic store/service association method. Existing JSON files decode with `null`; no eager migration is required.

The HTTP create endpoint remains local-only, so disconnected agents can still create draft sessions. On the first message for a connected Claude ACP session, the route calls `session/new`, verifies a nonblank remote ID, persists it, and then sends the prompt using it. Later messages reuse the stored remote ID. A failed remote-session creation never stores an ID and never sends the prompt.

On local deletion, the route tries `session/close` when there is a connected agent and remote ID, then always closes the local session. Remote-close failure is reported without preventing local cleanup.

### ACP wire and transport

Align wire DTOs with ACP v1: integer protocol version, minimal explicit client capabilities, `session/new` fields required by the schema, and prompt content blocks directly as the `prompt` array. Prompt completion is represented by its stop reason; streamed output is handled through `session/update` notifications rather than a fabricated response content field.

Harden request lifecycle in `AcpConnection`: reject requests when no writer is available; use synchronized request IDs/pending registration; remove pending entries in `finally`; fail pending requests on EOF and close; clean up a partially started process if connection initialization fails; and transition connection status consistently.

## Tests

Use TDD. Add deterministic unit tests for:
- ACP serialization of initialize, session/new, and session/prompt against v1 field shapes.
- Pending-request cleanup after timeout, write failure, EOF, and explicit close.
- Session persistence round trip, legacy JSON without remote ID, and remote-ID association.
- Route lifecycle: first prompt creates/maps remote ID then prompts it; later prompt reuses it; remote creation failure does not map/send; delete attempts remote close but closes locally regardless.

Run focused backend tests and `./gradlew :backend:test`. A real `claude acp` smoke test remains excluded unless explicitly requested.
