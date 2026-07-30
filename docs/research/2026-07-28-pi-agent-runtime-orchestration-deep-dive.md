# Pi Agent Runtime and Orchestration Deep Dive

## Scope

This review uses primary GitHub repositories and arXiv papers available on **July 28, 2026**. It focuses on four questions relevant to Swarm Editor: lightweight execution isolation, dynamic Pi Agent construction and scheduling, repository-scale code intelligence, and evidence-driven self-improvement.

The central constraint remains unchanged: the desktop UI and Kotlin backend communicate in-process, Pi is the only coding-agent runtime, and normal tool execution must not require HTTP, WebSocket, OCI images, or a container daemon.

## Executive Decisions

1. **Keep the interactive execution plane daemonless.** Bubblewrap is the native-command boundary on Linux; Wasmtime is the deterministic plugin boundary. OCI remains an offline evaluation mechanism only.
2. **Do not import another Agent framework.** Reuse ideas from GPTSwarm, AFlow, Magentic-One, LATTE, and Atomic Task Graph, but implement the control plane in Kotlin around Pi Profiles and structured concurrency.
3. **Replace FIFO-ready scheduling with bounded, event-driven optimization.** Use critical-path ranking plus receding-horizon dynamic programming over a pruned set of task/Agent assignments.
4. **Turn LSP into an Agent capability, not only a renderer.** Symbol lookup, references, diagnostics, workspace symbols, and safe rename should become typed, auditable Pi tools.
5. **Treat Agent creation as capability allocation.** Construct temporary Pi Profiles only when the task graph demonstrates missing capability, parallel value, or independent-review value.
6. **Keep evolution outside the live control path.** Candidate policies, prompts, skills, and graph rewrites require replay, provenance, and rollback before promotion.

## Current Repository Gap Audit

| Area | Current evidence | Gap |
|---|---|---|
| Scheduling | `SwarmScheduler.runTasks()` selects ready tasks in stored order with `.take(capacity)` | No critical-path priority, duration estimate, cost/quality utility, conflict avoidance, or assignment optimization |
| Agent routing | `SwarmService.resolveAgent()` uses explicit `agentId`, then first role tag, then first enabled Profile | No capability score, historical reliability, privilege fit, context affinity, or load-aware selection |
| Task model | `SwarmTask` stores role, dependencies, output, attempts, usage, and audit ids | Missing expected artifacts, mutable resource claims, risk class, estimated cost/duration, verification contract, and file ownership |
| Native sandbox | `BubblewrapPiToolBroker` isolates namespaces, environment, network, mounts, and optionally uses a systemd scope | Bubblewrap policy has no seccomp profile; writable repository metadata and command-specific privileges are not modeled |
| WASM sandbox | `WasmtimeCliSandbox` verifies runtime version and module hash and removes ambient environment/filesystem access | No module registry, WIT/component contract, packaged runtime, fuel/epoch budget, or Pi capability routing |
| Code intelligence | `LspService` currently exposes semantic highlighting through `SourceSemanticHighlighter` | LSP navigation and diagnostics are not available to Pi or the scheduler as structured evidence |
| Learning | Experience selection, challenge generation, snapshots, and counterfactual cases already exist | Scheduler decisions themselves are not yet recorded as treatment candidates with comparable outcomes |

## GitHub Implementation Evidence

### Execution and Isolation

| Project | Useful mechanism | Swarm Editor interpretation |
|---|---|---|
| [containers/bubblewrap](https://github.com/containers/bubblewrap) | Builds an empty mount namespace from explicit bindings and supports user, PID, IPC, network, UTS, and seccomp isolation | Correct primitive for Linux desktop commands, but its own documentation stresses that callers must define the security policy; `bwrap` alone is not a complete sandbox |
| [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) | Uses Bubblewrap on Linux and native sandboxing on macOS, with filesystem/network policy and violation monitoring | Strong reference for a future cross-platform `NativeSandboxPolicy` abstraction; do not vendor the Node control plane into the Kotlin backend |
| [bytecodealliance/wasmtime](https://github.com/bytecodealliance/wasmtime) | Fast instantiation, configurable resource control, fuzzing, security process, WASI, and component-oriented embedding | Appropriate for hash-pinned deterministic capabilities; filesystem and network must stay absent unless explicitly granted through host interfaces |
| [SWE-agent/SWE-ReX](https://github.com/SWE-agent/SWE-ReX) | Separates Agent logic from local/remote runtime implementations and supports many parallel interactive shells | Adopt the runtime-interface separation and session semantics, not its deployment stack |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | Separates Agent server/runtime concerns and explicitly warns when running without a sandbox | Useful negative evidence: direct host execution must never be the silent fallback for authorized untrusted tools |
| [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) | Stable sandbox identity, lifecycle, persistence, claims, and warm pools over stronger runtimes | Relevant only for a future remote fleet. A Kubernetes CRD/controller is inappropriate for the local desktop product path |

### Orchestration and Code Intelligence

| Project | Useful mechanism | Swarm Editor interpretation |
|---|---|---|
| [metauto-ai/GPTSwarm](https://github.com/metauto-ai/GPTSwarm) | Models Agents as composable computational graphs and optimizes node prompts and inter-Agent edges | Represent graph revisions and edge decisions explicitly; never let a model silently mutate the only production graph |
| [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) and its AFlow work | Encodes software roles and searches executable workflows | Retain role-specific prompt policy, but evaluate generated workflows against repository tasks before promotion |
| [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | Active successor to AutoGen with graph workflows and orchestration APIs | Study workflow contracts and observability; do not add its runtime or distributed transport to the Kotlin/Pi architecture |
| [oraios/serena](https://github.com/oraios/serena) | Exposes symbol-level retrieval, references, editing, and refactoring through language servers | Direct precedent for converting the existing LSP client into typed Pi capabilities |
| [gersteinlab/LocAgent](https://github.com/gersteinlab/LocAgent) | Uses a repository graph to guide code localization | Add a compact symbol/dependency graph as a scheduler/context index rather than sending raw repository trees to Pi |

## arXiv Evidence and Design Consequences

### Dynamic Task Graphs and Scheduling

- [Atomic Task Graph](https://arxiv.org/abs/2607.01942) makes subtask inputs/outputs and graph evolution explicit, executes independent branches in parallel, and repairs only affected regions after failure. Swarm tasks therefore need typed artifact dependencies, not only textual `dependsOn` ids.
- [LATTE](https://arxiv.org/abs/2605.06320) lets Agents maintain a shared evolving coordination graph under partial observability and reports reductions in tokens, time, file conflicts, and redundant outputs. Swarm Editor should support controlled graph amendments, but Kotlin must validate every mutation.
- [DynTaskMAS](https://arxiv.org/abs/2603.11448) combines dynamic task graphs with Agent capability discovery. This supports constructing temporary Pi Profiles after graph expansion instead of pre-creating a fixed “team.”
- [DyLAN](https://arxiv.org/abs/2310.02170) selects Agents using observed contribution before dynamic collaboration. This supports a historical `AgentCapabilityEstimate`, but preliminary trials must be budgeted and isolated.
- [Self-Resource Allocation for Multi-Agent LLM Systems](https://arxiv.org/abs/2504.02051) treats compute allocation as part of planning. Parallelism should therefore be a budgeted decision, not a global integer alone.
- [ClawArena-Team](https://arxiv.org/abs/2606.31174) shows that subagent management quality is strongly constrained by workspace-permission precision and that cost is not a reliable proxy for management quality. Least privilege must be part of the scheduler objective.
- [Magentic-One](https://arxiv.org/abs/2411.04468) uses an orchestrator with explicit progress ledgers and replanning. Swarm Editor already has durable run/task state; it should add a scheduler ledger rather than reproduce another conversation-based orchestrator.

### Workflow Optimization and Routing

- [Language Agents as Optimizable Graphs](https://arxiv.org/abs/2402.16823) optimizes prompts and graph edges. Edge selection should become a versioned policy with evaluation evidence.
- [AFlow](https://arxiv.org/abs/2410.10762) searches executable workflows through iterative generation and evaluation. This supports offline workflow search over stored Swarm cases, not live unconstrained topology mutation.
- [RouterBench](https://arxiv.org/abs/2403.12031) formalizes quality/cost trade-offs for model routing. Swarm Editor needs per-Profile outcome and cost estimates before any “smart” Agent selector can be justified.

### Repository Context

- [Agentless](https://arxiv.org/abs/2407.01489) demonstrates that localization, repair, and validation can outperform more complicated autonomous loops in some software tasks. The default plan should remain minimal unless extra Agents have measurable marginal value.
- [RepoGraph](https://arxiv.org/abs/2410.14684) and [LocAgent](https://arxiv.org/abs/2503.09089) show the value of repository-level structural graphs for localization.
- [FastContext](https://arxiv.org/abs/2602.16838) frames repository exploration as a trained tool-using retrieval policy and reports large token reductions over stronger general models. Swarm Editor should record navigation trajectories now, while keeping deterministic LSP/graph retrieval as the initial policy.

### Security and Evolution

- [MCP Safety Audit](https://arxiv.org/abs/2504.03767) demonstrates that tool ecosystems can enable malicious code execution, remote control, and credential theft. Tool descriptions and Agent decisions are not authorization boundaries.
- [MCP Safety Lock](https://arxiv.org/abs/2506.12321) argues for constrained tool selection. Swarm Editor should authorize capabilities from Kotlin policy before exposing them to Pi.
- [Darwin Gödel Machine](https://arxiv.org/abs/2505.22954), [Live-SWE-agent](https://arxiv.org/abs/2511.13646), and [Socratic-SWE](https://arxiv.org/abs/2606.07412) support archives, trace-derived skills, and empirical validation. They do not justify editing the live backend without replay and rollback.
- [Causal Attribution for LLM Multi-Agent Systems](https://arxiv.org/abs/2508.10938) supports controlled interventions over introspective credit. Scheduler and Agent-construction decisions must become replayable treatments.

## Proposed Scheduler: Receding-Horizon Graph DP

Pure global dynamic programming is intractable because task graph mutations, Agent choices, and stochastic outcomes cause state explosion. The practical design is a deterministic outer scheduler with a bounded optimization window.

### State

At scheduling event `t`, define:

```text
S_t = (completed, running, ready, graphVersion, agentAvailability,
       remainingTokenBudget, remainingTimeBudget, workspaceClaims,
       capabilityEstimates, verificationState)
```

### Action

An action assigns zero or more ready tasks to concrete Pi Profile snapshots, optionally defers a task, requests graph refinement, or constructs a temporary Profile from an allowlisted provider/model/prompt policy.

### Utility

```text
U = expectedVerifiedQuality
    - λ_time * expectedCriticalPathDelay
    - λ_token * expectedTokenCost
    - λ_retry * failureRisk
    - λ_conflict * workspaceConflictRisk
    - λ_privilege * excessCapabilityRisk
    - λ_context * contextRehydrationCost
```

The Bellman form is `V(S) = max_a [U(S,a) + γ E(V(S'))]`, but implementation should evaluate only a small candidate beam and horizon of one to three completion events.

### Candidate Reduction

1. Rank ready tasks by critical-path slack, verification importance, and unblock count.
2. Filter Agents by hard capability and sandbox requirements.
3. Keep the top `K` Agents per task using historical success, median duration, token cost, role affinity, and repository-context affinity.
4. Reject assignments with overlapping exclusive file/worktree claims unless one task is read-only.
5. Enumerate only assignments that fit parallelism, token, time, and privilege budgets.
6. Memoize values by a stable state fingerprint and replan after every completion, failure, cancellation, graph amendment, or capability change.

### Dynamic Agent Construction

Create a temporary Pi Profile only when one of these predicates is true:

- no existing Profile satisfies hard capabilities;
- expected critical-path reduction exceeds startup/context cost;
- an independent reviewer materially reduces verification risk;
- graph expansion reveals a new specialization not known during initial planning.

Temporary Profiles must have a parent policy, immutable provider/model snapshot, explicit sandbox capability set, expiry at run completion, and recorded construction reason. They are not persisted as normal user Profiles unless promoted through evaluation.

## Typed Task and Artifact Model

The next model revision should add:

```text
TaskSpec
  requiredCapabilities
  expectedArtifacts
  verificationCommand / verificationKind
  estimatedTokens / estimatedDuration
  riskClass
  workspaceClaims(read/write/exclusive)
  contextRequirements(symbols/files/diagnostics)
  amendableGraphRegion

TaskArtifact
  type(diff, report, diagnostics, decision, test-result, symbol-set)
  contentHash
  producerTaskId
  workspaceRevision
  validationStatus
```

Downstream tasks should consume artifact ids and hashes. Text output remains useful for humans but must not be the only integration channel.

## Sandbox Hardening Roadmap

1. Add a checked-in seccomp policy or generated syscall allowlist to Bubblewrap; keep `--new-session` as defense-in-depth.
2. Introduce command capability classes such as `READ_ONLY`, `BUILD`, `TEST`, `GIT_MUTATE`, and `PACKAGE_INSTALL`; network stays a separate host-authorized capability.
3. Run mutation tasks in per-task Git worktrees. Disable repository-controlled hooks and ambient Git configuration inside the sandbox.
4. Add fallback resource enforcement when the systemd user scope is unavailable, or fail closed for high-risk Profiles.
5. Add a host-owned `WasmModuleRegistry` with pinned runtime asset, module digest, WIT contract, limits, provenance, and allowed host functions.
6. Prefer the WebAssembly component model for stable plugin interfaces; do not expose arbitrary WASI filesystem/network capabilities.
7. Define platform adapters: Bubblewrap for Linux, native sandbox policy for macOS, and an explicitly researched Windows boundary. Do not silently execute authorized untrusted tools on the host.

## LSP and Repository Intelligence Roadmap

1. Split the existing highlighter interface from a new `CodeIntelligenceService`.
2. Add typed operations for document symbols, workspace symbols, definition, references, diagnostics, hover, call hierarchy, and safe rename preview.
3. Store a compact symbol graph with file revision hashes and invalidate incrementally from file changes.
4. Expose only bounded, workspace-relative responses through the Pi tool broker and audit every query.
5. Let the scheduler use symbol ownership and reference edges to estimate file conflicts, context affinity, and affected verification scope.
6. Keep Markdown/HTML/JSON dual rendering in the UI, while source truth and Agent operations remain text plus semantic metadata.

## Implementation Order

### Phase 1 — Observability Before Optimization

- Persist every scheduler candidate, chosen assignment, rejected assignment reason, state fingerprint, estimated utility, and actual outcome.
- Add task duration, token, retry, sandbox, changed-file, and verification metrics.
- Preserve the current deterministic scheduler as the control policy.

Implemented foundation:

- `SwarmRun.schedulingDecisions` now records the `fifo-ready-v1` control policy, stable state fingerprints, available capacity, active tasks, every ready candidate, selected candidates, and explicit capacity deferrals.
- `SwarmTask.attemptRecords` now preserves each retry separately with scheduling-decision provenance, requested and resolved Agent ids, timing, duration, token usage, broker/audit ids, outcome, changed-file count, verification status, and bounded error category.
- Success, failure, timeout, fail-fast cancellation, user cancellation, scheduler failure, and interrupted-run recovery all close active attempt records instead of leaving ambiguous `RUNNING` evidence.
- Changed-file and verification values remain explicitly unavailable unless an executor supplies them. The scheduler does not infer or fabricate these metrics from textual output.

### Phase 2 — Deterministic Graph Scheduler

- Add typed task metadata and artifact dependencies.
- Implement critical-path/slack priority, capability filtering, file-claim conflict detection, and load-aware Agent selection.
- Add graph-amendment validation with versioning and cycle checks.

### Phase 3 — Bounded Dynamic Programming

- Add empirical capability estimates grouped by Profile snapshot, role, task class, language, and repository fingerprint.
- Implement top-`K` candidate generation, beam search, one-to-three-event horizon, memoization, and strict budget constraints.
- Replay the DP policy against persisted runs before enabling it by default.

### Phase 4 — Semantic Context and Dynamic Profiles

- Expose LSP/code-graph capabilities to Pi.
- Add temporary Profile construction with lifecycle and privilege constraints.
- Use semantic ownership and context affinity in scheduling utility.

### Phase 5 — Evaluated Self-Improvement

- Treat prompt, graph, scheduler-weight, capability-estimate, and skill changes as versioned candidates.
- Use content-addressed worktrees and control/treatment replay.
- Promote only changes that pass task correctness, regression, cost, latency, and least-privilege gates.

## Explicit Non-Goals

- No OCI, Podman, Kubernetes, or remote sandbox daemon in the normal desktop execution path.
- No AutoGen, Microsoft Agent Framework, MetaGPT, or other second Agent runtime embedded into the product.
- No free-form Agent spawning without budget, capability, privilege, and lifecycle policy.
- No arbitrary MCP or WASM module execution from model-provided descriptors.
- No self-modification promoted from model confidence, self-review, or observational success alone.

## Final Architecture

Swarm Editor should evolve into a **Pi-native, graph-controlled AI IDE**: Kotlin owns policy, scheduling, persistence, security, and evaluation; Pi owns reasoning and coding interaction; Bubblewrap owns native workspace isolation; Wasmtime owns deterministic extension isolation; LSP and repository graphs provide semantic context; and every adaptive decision remains observable, replayable, and reversible.
