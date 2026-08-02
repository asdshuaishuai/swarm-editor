# Lightweight Sandbox and Verification Deep Dive

## Scope

This report records a second research pass completed on **July 28, 2026**. It focuses on two unresolved architecture questions: how Swarm Editor should isolate Pi-driven execution on ordinary desktop machines, and how it can claim changed-file or verification results without fabricating provenance.

The product constraints remain strict: Kotlin UI and backend communication stays in-process; Pi is the only coding-agent runtime; normal execution must not require HTTP, WebSocket, a container daemon, or an OCI image.

## Executive Decision

1. **Bubblewrap remains the stable Linux native-command baseline.** It is already integrated, available on the current machine as an 86,552-byte executable, and adds no image lifecycle.
2. **Wasmtime remains the portable deterministic-plugin boundary.** WASM modules must be hash-pinned and capability-denied by default.
3. **Sandlock is an experimental Linux provider, not a replacement yet.** Its design is highly aligned with Agent workloads, but the project was created in March 2026 and requires Linux 6.12+ for its complete protection set.
4. **OCI is not part of Agent execution or evaluation.** Bubblewrap plus WASM is the complete lightweight sandbox stack for normal machines.
5. **Windows native execution remains fail-closed** until an AppContainer launcher and broker exist. macOS needs a native helper with explicit filesystem and network policy.
6. **`changedFileCount` must remain `null` until each mutation task owns a separate Git worktree and produces tree-based evidence.** Shared workspaces make per-Agent attribution false.
7. **Implement deterministic replay before causal replay.** Reproducible inputs and effects are prerequisites for meaningful counterfactual attribution.

## Current Repository Evidence

The existing implementation already establishes useful boundaries:

| Area | Current state | Required next step |
|---|---|---|
| Native Pi tools | `BubblewrapPiToolBroker` denies network, hides the home directory, binds only the workspace writable, strips Profile secrets, audits requests, and optionally enters a systemd user scope | Extract a provider-neutral policy and preflight contract; add stricter syscall/resource evidence |
| WASM | `WasmtimeCliSandbox` verifies runtime version and module SHA-256 and grants no ambient directories or environment | Package a pinned runtime and add a host-owned module/capability manifest |
| Evaluation | `BubblewrapSwarmEvaluationVerifier` runs matched worktrees with no network, a read-only host root, one writable workspace, an ephemeral home, and a scrubbed environment | Add platform-native equivalents while preserving the same evidence contract |
| Scheduler provenance | Attempt records persist Agent IDs, timing, token use, broker/audit IDs, retries, and verification state | Replace placeholder changed-file and verification fields with typed evidence references |
| Workspace | Parallel tasks can still operate on one project directory | Allocate one detached worktree per mutation task and merge only verified artifacts |

Local evidence from this workstation is Linux `7.0.12-201.fc44.x86_64`; Bubblewrap and `systemd-run` are installed, while Wasmtime/Sandlock are absent. The missing `/sys/kernel/security/landlock/abi` file does **not** prove Landlock is unavailable; a real syscall-level preflight is required.

## GitHub Evidence Matrix

| Project | Evidence | Decision for Swarm Editor |
|---|---|---|
| [containers/bubblewrap](https://github.com/containers/bubblewrap) | Small daemonless namespace/mount primitive used by desktop software | Keep as the production Linux baseline; Swarm Editor owns the security policy |
| [multikernel/sandlock](https://github.com/multikernel/sandlock) | Landlock, seccomp-bpf, seccomp user notification, COW effects, network/HTTP policy, deterministic time/randomness; no root, cgroups, images, or mandatory namespaces | Add only behind `experimental` policy and strict acceptance gates |
| [google/nsjail](https://github.com/google/nsjail) | Mature namespaces, cgroups, rlimits, seccomp-bpf, and Kafel policy stack; repository dates to 2015 | Use as a hardening reference, not the default desktop runtime; operational surface is larger than needed |
| [microsoft/win32-app-isolation](https://github.com/microsoft/win32-app-isolation) | AppContainer-based security boundary with virtualized and brokered resource access | Build a native Windows launcher/broker; documentation alone is not an executable backend |
| [bytecodealliance/wasmtime](https://github.com/bytecodealliance/wasmtime) | Cross-platform WASM runtime with resource controls and a formal security process | Continue as the deterministic capability runtime |
| [extism/extism](https://github.com/extism/extism) | Cross-platform plugin manifests, host functions, timers, limiters, controlled HTTP, and a Java SDK | Borrow manifest and host-capability ideas; do not add a second runtime layer over Wasmtime without a measured need |
| [SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench) | Real issue-to-patch evaluation with repository execution environments | Adopt issue-level correctness and regression evidence concepts |
| [SWE-bench/SWE-smith](https://github.com/SWE-bench/SWE-smith) | Scalable synthesis of repository tasks and executable environments | Useful later for generating Swarm regression tasks, not for live scheduling |
| [harbor-framework/terminal-bench](https://github.com/harbor-framework/terminal-bench) | Terminal-Agent tasks evaluated in controlled environments | Reference for command/result evidence and environment contracts |
| [UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai) | Evaluation plans, sandboxes, logs, scoring, and reproducibility controls | Borrow typed evaluation records and explicit scorer policy |

Sandlock's official GitHub API reported release `v0.8.5` published on July 20, 2026. Its architecture fits this product unusually well, but recency matters more than feature count: it has not yet earned the same production confidence as Bubblewrap.

## Sandlock Acceptance Gates

Create a `NativeSandboxProvider` abstraction before adding the provider. A provider must return a signed or hashable `SandboxPreflightReport`, not a Boolean:

```text
provider/version/binarySha256
kernel/os/architecture
active filesystem/network/ipc/syscall/resource protections
unsupported or waived protections
policyVersion and policyDigest
```

Sandlock may be selectable only when all required protections are active. Never translate an unavailable feature into an implicit opt-out.

Required gates:

1. Pin the release, target triple, archive SHA-256, extracted binary SHA-256, and policy schema version.
2. Verify Linux kernel and Landlock ABI through an executable preflight, including filesystem, TCP, and IPC enforcement.
3. Verify seccomp filter and user-notification support and fail if the supervisor cannot enforce dynamic decisions.
4. Run traversal, symlink, hard-link, `/proc`, device, environment, DNS/IP, TCP/UDP, Unix socket, fork-bomb, process-count, memory, timeout, cancellation, supervisor-crash, child-crash, and cleanup tests.
5. Prove COW rollback and explicit commit semantics against a disposable worktree.
6. Record startup latency and sustained command overhead against Bubblewrap on x86_64 and aarch64.
7. Require an emergency configuration switch back to Bubblewrap without changing task semantics.

Until these gates pass in CI and packaged smoke tests, `sandlock` should be exposed only as `experimental-sandlock`, never `auto`.

## Cross-Platform Provider Model

The scheduler should request capabilities, not a concrete runtime:

```text
READ_SOURCE
WRITE_SOURCE
RUN_BUILD
RUN_TEST
GIT_READ
GIT_MUTATE
NETWORK(host, port, protocol)
WASM_MODULE(moduleId)
```

`NativeSandboxPolicyCompiler` maps those capabilities to the active platform provider. Linux uses Bubblewrap by default and may use Sandlock experimentally. macOS requires a packaged native sandbox helper and must fail closed when policy enforcement is unavailable. Windows requires an AppContainer process launcher plus brokers for workspace files, process creation, and any approved network access. Unsupported platforms may still run read-only UI and Pi reasoning, but must not silently run untrusted native commands on the host.

WASM remains a separate provider because its trust model is stronger and more portable. A `WasmModuleManifest` should pin module hash, WIT/component interface, maximum memory, fuel/epoch deadline, allowed host functions, output limit, and provenance. Model output must never define these privileges.

## Truthful Changed-File Attribution

Parallel Agents cannot share a writable workspace if the product wants per-task attribution. Each mutation task should receive:

```text
<state>/worktrees/<runId>/<taskId>/<attempt>
```

The worktree starts from the run's immutable base commit or tree. Before and after execution, capture the complete tracked state with a temporary Git index:

```bash
GIT_INDEX_FILE="$tmp/index" git read-tree "$baseTree"
GIT_INDEX_FILE="$tmp/index" git add -A -- .
afterTree=$(GIT_INDEX_FILE="$tmp/index" git write-tree)
git diff-tree --no-commit-id --name-status --no-renames -r -z "$beforeTree" "$afterTree"
```

The temporary index must never touch the user's index. Use `--no-renames` for stable machine evidence; rename detection can remain a presentation concern. Parse the NUL-delimited stream, count records, and hash the exact bytes. This captures content, mode, symlink, deletion, and newly tracked-path changes without trusting Agent text. Ignored build outputs remain outside `changedFileCount` and may be tracked separately as disposable side effects.

Persist a `WorkspaceDeltaEvidence` record:

```text
baseRevision, beforeTree, afterTree
nameStatusSha256, changedPathCount
gitVersion, capturePolicyVersion
worktreeId, taskId, attempt
createdAt
```

Only after that record is durably stored should `SwarmTaskAttemptRecord.changedFileCount` become non-null.

## Typed Verification Evidence

`SwarmVerificationStatus.PASSED` is insufficient by itself. Store a reference to immutable `VerificationEvidence` containing:

- verification policy ID/version and normalized command hash;
- before/after tree hashes and workspace-delta evidence ID;
- sandbox provider/version, policy digest, runtime binary hashes, and audit IDs;
- exit code, terminating signal, timeout, duration, and cancellation category;
- stdout/stderr SHA-256, captured byte count, and truncation flags;
- parsed test totals when the runner has a typed adapter;
- environment fingerprint covering OS, architecture, kernel, JDK, Node, Gradle, Pi runtime, dependency locks, and non-secret environment names;
- verifier implementation version and evidence creation timestamp.

Do not persist provider keys, full environment values, or unlimited command output. A result is `PASSED` only when the command succeeds, required evidence is complete, the after-tree matches the verified tree, and the sandbox preflight satisfies the policy. Missing evidence is `NOT_RECORDED` or `BLOCKED`, never success.

## Replay Order

The relevant papers support a strict progression:

1. [Deterministic Replay for AI Agent Systems, arXiv:2607.16200](https://arxiv.org/abs/2607.16200) records external interactions and replays them without outbound network access. Swarm Editor should first record Pi request/response envelopes, tool decisions, tool results, workspace trees, scheduler state, and environment fingerprints.
2. [Causal Agent Replay, arXiv:2606.08275](https://arxiv.org/abs/2606.08275) uses interventions and repeated forward execution to estimate which step caused an outcome. This is valuable only after deterministic replay can hold the rest of the trajectory stable.
3. [SWE-bench, arXiv:2310.06770](https://arxiv.org/abs/2310.06770) and [SWE-smith, arXiv:2504.21798](https://arxiv.org/abs/2504.21798) reinforce that repository tasks require executable environments and regression tests, not patch-shape scoring.
4. [Sandlock, arXiv:2605.26298](https://arxiv.org/abs/2605.26298) supports the static-kernel-policy plus narrow-supervisor split, but its performance and security claims still require local reproduction.

Research correction: `arXiv:2501.15466` is a target-speaker speech-recognition paper, not a WebAssembly sandboxing paper. It must not be cited for this architecture.

## Implementation Phases

### Phase A — Evidence Types

- Add `WorkspaceDeltaEvidence`, `VerificationEvidence`, `SandboxPreflightReport`, and content-addressed stores.
- Replace direct counts/statuses with optional evidence IDs while retaining compatibility fields for UI projection.
- Make persistence atomic and audit missing/incomplete evidence explicitly.

### Phase B — Per-Task Worktrees

- Allocate and clean one worktree per task attempt.
- Capture before/after trees through temporary indexes.
- Prevent parallel write conflicts using declared file claims and semantic ownership hints.
- Merge artifacts only after verification and conflict checks.

### Phase C — Deterministic Verification

- Add a Bubblewrap-based local verifier for ordinary machines.
- Use Bubblewrap for matched repository-command evaluation without an image lifecycle.
- Normalize outputs, hash evidence, and replay identical task inputs against the same tree and environment fingerprint.

### Phase D — Provider Abstraction

- Extract Bubblewrap behind `NativeSandboxProvider` without changing behavior.
- Package and test platform-specific helpers.
- Add Sandlock as an experimental provider only after every acceptance gate passes.

### Phase E — Causal Evaluation

- Generate bounded intervention cases from failed or disputed trajectories.
- Re-run enough samples to report uncertainty rather than a single judge score.
- Promote scheduler, prompt, Skill, or Agent-construction changes only from reproducible control/treatment evidence.

## Final Position

For ordinary machines, the correct execution stack is intentionally small: **Pi + Kotlin control plane + Bubblewrap/native OS sandbox + Wasmtime**. OCI is unnecessary for this architecture. The next high-value engineering work is not adding another sandbox; it is separating task workspaces and building a content-addressed evidence chain so every file change, verification result, scheduling decision, and future self-improvement claim can be independently replayed and audited.
