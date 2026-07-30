# Claude ACP Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Claude Code ACP integration use durable remote session IDs and ACP v1-compatible request lifecycles.

**Architecture:** Persist an optional remote ACP session ID alongside each local session. The HTTP route lazily allocates the remote session on its first prompt, reuses it thereafter, and best-effort closes it before always closing local state. Align ACP DTOs with the official v1 schema and harden request cleanup at the transport boundary.

**Tech Stack:** Kotlin 2.3.10, kotlinx.serialization, coroutines, Ktor 3.2.2, kotlin.test, MockK, ACP v1 JSON-RPC over stdio.

---

### Task 1: Correct ACP v1 wire models

**Files:**
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpMessages.kt`
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt`
- Test: `backend/src/test/kotlin/com/swarmeditor/backend/acp/AcpMessagesTest.kt`

- [ ] **Step 1: Write failing serialization tests**

Assert `initialize` serializes numeric `protocolVersion`; `session/new` includes `cwd` and `mcpServers`; and `session/prompt` serializes `prompt` as an array of text blocks.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.acp.AcpMessagesTest`

Expected: FAIL because current DTO shapes use a string protocol version, omit required new-session fields, and wrap prompt blocks.

- [ ] **Step 3: Implement minimal schema-aligned DTOs**

Make protocol version numeric, use direct prompt block lists, make `cwd`/`mcpServers` explicit for new session, and model prompt completion through `stopReason` rather than fabricated response text.

- [ ] **Step 4: Run focused test**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.acp.AcpMessagesTest`

Expected: PASS.

### Task 2: Persist remote ACP session identity

**Files:**
- Modify: `common/src/commonMain/kotlin/com/swarmeditor/common/model/Session.kt`
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/session/SessionStore.kt`
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/service/SessionService.kt`
- Test: `backend/src/test/kotlin/com/swarmeditor/backend/session/SessionStoreTest.kt`

- [ ] **Step 1: Write failing persistence tests**

Test remote ID association round-trip and loading legacy JSON that omits `remoteSessionId`.

- [ ] **Step 2: Run focused test to verify it fails**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.session.SessionStoreTest`

Expected: FAIL because the model/file format/store cannot retain the remote ID.

- [ ] **Step 3: Add nullable durable mapping**

Append `remoteSessionId: String? = null` to `Session`; add it to `SessionFile` with default `null`; add atomic `setRemoteSessionId`; expose it through `SessionService` and refresh state.

- [ ] **Step 4: Run focused test**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.session.SessionStoreTest`

Expected: PASS.

### Task 3: Route prompts and closes through remote ACP sessions

**Files:**
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/route/SessionRoutes.kt`
- Test: `backend/src/test/kotlin/com/swarmeditor/backend/route/SessionRoutesTest.kt`

- [ ] **Step 1: Write failing route lifecycle tests**

Cover first prompt allocating/persisting a remote ID then prompting with it; later prompts reusing it; failed/blank creation not mapping or prompting; and delete attempting remote close while always closing local state.

- [ ] **Step 2: Run focused test to verify it fails**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.route.SessionRoutesTest`

Expected: FAIL because local IDs are currently sent and remote close is not called.

- [ ] **Step 3: Implement lazy remote lifecycle**

Keep local session creation offline-capable. On a connected first prompt create and persist a nonblank remote ID before sending. Preserve user-message persistence. Catch ACP exceptions into route errors. On delete, attempt remote close only when connected/mapped, then always close local state.

- [ ] **Step 4: Run focused test**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.route.SessionRoutesTest`

Expected: PASS.

### Task 4: Harden ACP request cleanup

**Files:**
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/acp/AcpConnection.kt`
- Test: `backend/src/test/kotlin/com/swarmeditor/backend/acp/AcpConnectionTest.kt`

- [ ] **Step 1: Write failing transport lifecycle tests**

Use existing reflection seams to verify no pending request remains after timeout/write failure; EOF fails pending requests; and close during setup/connected state cleans resources consistently.

- [ ] **Step 2: Run focused test to verify it fails**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.acp.AcpConnectionTest`

Expected: FAIL because current code leaves timed-out requests pending and EOF does not fail waiters.

- [ ] **Step 3: Implement request lifecycle cleanup**

Reject missing writers, register/remove pending requests under synchronization, remove entries in `finally`, fail outstanding requests on EOF/close, and destroy partially started processes when connect fails.

- [ ] **Step 4: Run focused test**

Run: `./gradlew :backend:test --tests com.swarmeditor.backend.acp.AcpConnectionTest`

Expected: PASS.

### Task 5: Verify the backend integration

**Files:**
- Verify: all tests above and existing backend tests.

- [ ] **Step 1: Run the backend test suite**

Run: `./gradlew :backend:test`

Expected: PASS with no test failures.

- [ ] **Step 2: Review ACP v1 compatibility**

Compare final serialized initialize, new-session, and prompt payload assertions to the official v1 schema. Confirm no credentials, settings, MCP synchronization, or permission behavior changed.
