# Pi Swarm Self-Evolution Research

## Objective

Swarm Editor should improve from completed work without introducing another agent runtime or unsafe, opaque self-modification. The target is a Pi-only learning loop that remains local, inspectable, reversible, and compatible with Kotlin structured concurrency.

## Primary Sources Reviewed

| Work | Mechanism | Relevant lesson |
|---|---|---|
| [Reflexion](https://arxiv.org/abs/2303.11366) | Stores verbal reflections after feedback | Failure text should become future context, not disappear with a session. |
| [ExpeL](https://arxiv.org/abs/2308.10144), [code](https://github.com/LeapLabTHU/ExpeL) | Extracts reusable insights and retrieves similar successful trajectories | Cross-run learning needs durable experience plus relevance-based retrieval. |
| [AFlow](https://arxiv.org/abs/2410.10762) | Searches executable agent workflows and evaluates candidates | Workflow evolution must be measured against tasks, not selected by model confidence. |
| [Darwin Gödel Machine](https://arxiv.org/abs/2505.22954), [code](https://github.com/jennyzzt/dgm) | Keeps an archive of modified agents and empirically evaluates descendants | Never overwrite the only working agent; retain parentage, candidates, scores, and rollback. |
| [ACE](https://arxiv.org/abs/2510.04618), [code](https://github.com/ace-agent/ace) | Generator–Reflector–Curator with incremental playbook deltas | Preserve accumulated detail through localized updates instead of repeatedly rewriting one prompt. |
| [Live-SWE-agent](https://arxiv.org/abs/2511.13646), [code](https://github.com/OpenAutoCoder/live-swe-agent) | Revises runtime capabilities while solving software issues | Live evolution is valuable, but generated tools must be isolated and bounded. |
| [ERL](https://arxiv.org/abs/2603.24639) | Distills successful and failed trajectories into procedural memory | Both positive strategies and failure-derived pitfalls should be retained. |
| [Socratic-SWE](https://arxiv.org/abs/2606.07412) | Converts coding traces into reusable agent skills | Mature experiences can graduate into versioned Pi skills after validation. |
| [Managing Procedural Memory in LLM Agents](https://arxiv.org/abs/2511.01805) | Separates procedural memory quality, retrieval, and lifecycle management | More stored procedures do not guarantee better behavior; lifecycle policy is part of the agent. |
| [Influence-Based Credit Assignment](https://arxiv.org/abs/2508.07261) | Measures component contribution through interventions and removal-based influence | Agent self-reports are not reliable causal attribution; promotion needs controlled evaluation. |
| [SkillRL](https://arxiv.org/abs/2602.08234), [code](https://github.com/aiming-lab/SkillRL) | Retrieves, applies, and evolves reusable skills with outcome feedback | Skill evolution should retain task evidence and evaluate reuse rather than regenerate instructions each time. |
| [GEPA](https://arxiv.org/abs/2507.19457), [code](https://github.com/gepa-ai/gepa) | Reflective prompt evolution with explicit evaluation and Pareto selection | Candidate instructions should be retained as versions and selected by measured quality, not overwritten in place. |
| [Causal Attribution for LLM Multi-Agent Systems](https://arxiv.org/abs/2508.10938) | Estimates agent contribution with counterfactual interventions | Multi-agent promotion requires controlled treatment and control runs under comparable environments. |
| [PYTHALAB-MERA](https://arxiv.org/abs/2605.08468) | Validation-grounded episodic memory with adaptive retrieval and delayed credit | Coding memory should be selected by measured validation utility, not lexical similarity alone. |
| [Mem-$\pi$](https://arxiv.org/abs/2605.21463) | Learns both when to provide memory and what guidance to provide | Abstaining from memory injection is a first-class action when guidance is likely to distract. |
| [Agents that Matter](https://arxiv.org/abs/2605.27621) | Uses removal-based attribution to find structural bottlenecks efficiently | Leave-one-out interventions remain preferable to introspective claims about contribution. |
| [Self-Evolving Agent Harnesses via Gated Semantic Quality-Diversity](https://arxiv.org/abs/2607.13683) | Separates model proposals from deterministic measurement and archives changes by pathology | Evolution should preserve diverse, pathology-specific candidates and require code-owned gates. |
| [Reward-Free Evolving Agents via Pairwise Validator](https://arxiv.org/abs/2607.14408) | Replaces fragile scalar rewards with pairwise parent/child comparison | Where executable scoring is incomplete, pairwise review can rank candidates but must not replace hard verification. |
| [Who Grades the Grader?](https://arxiv.org/abs/2607.12790) | Co-evolves transparent metrics and skills under anchored audits | Evaluators need their own lifecycle, fixed anchors, and held-out audits to resist reward hacking. |
| [ClawArena-Team](https://arxiv.org/abs/2606.31174), [code](https://github.com/aiming-lab/ClawArena) | Execution-based benchmark for dynamic subagent management and least-privilege routing | Swarm quality must include delegation precision and privilege discipline, not task correctness alone. |
| [PACE](https://arxiv.org/abs/2607.02032) | Selects compact, target-relevant proxy instances that predict expensive agent benchmarks | Evaluation budgets should prioritize representative, informative cases instead of replaying every trace uniformly. |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench) | Reproducible repository-level evaluation with containerized execution | Coding-agent evidence must come from executable repository tests in isolated environments. |
| [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | Agent evaluation framework with Docker and other sandbox providers | Sandboxing should be an explicit provider boundary, not an assumption attached to a temporary directory. |
| [SWE-ReX](https://github.com/SWE-agent/SWE-ReX) | Isolated, resource-limited execution environments for software agents | Workspaces, process execution, resources, and cleanup need separate lifecycle controls. |
| [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) | OS-enforced filesystem and network restrictions for agent commands | Policy enforcement belongs outside prompts, with secrets and unrestricted host access excluded from the execution boundary. |
| [Kubernetes agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) | Declarative lifecycle and warm-pool management for isolated agent environments | Sandbox allocation, reuse, execution, and teardown should be explicit lifecycle states rather than incidental subprocess behavior. |
| [Self-Evolving Agents Survey](https://arxiv.org/abs/2507.21046) | Organizes evolution of models, memory, tools, prompts, workflows, and populations | Swarm Editor should evolve layers independently and require a gate between learning and activation. |

## Current Gap

The scheduler already supports dynamic Pi planning, role-specific subagents, retries, failure history, token accounting, and DAG execution. Before this work, learning stopped at the current task: a later run could not reuse a successful strategy or known pitfall. There was no persistent playbook, reflector, retrieval layer, candidate archive, or evaluation gate.

## Implemented Phase: Experience Playbook

The first safe evolution layer is now implemented:

1. A completed `SUCCEEDED` or `FAILED` run is passed to a Pi reviewer acting as reflector.
2. The reflector emits bounded structured insights: stable ID, principle, rationale, strategy/pitfall kind, role, tags, and success/failure evidence.
3. `SwarmExperienceStore` merges insights atomically into `~/.swarm-editor/swarm-experiences.json`, retains source-run provenance, and caps catalog growth.
4. Deterministic lexical and role-aware retrieval selects relevant experience for a new objective or task.
5. Retrieved experience is injected into both Pi planning and Pi task execution as fallible evidence, never as an unconditional instruction.
6. Reflection failure is logged but cannot change an already completed run result.

This follows ACE's incremental playbook approach, ExpeL/ERL's experiential retrieval, and Reflexion's feedback reuse while avoiding DGM-style code mutation in the application process.

## Implemented Phase: Observational Credit Ledger

Each task now persists the exact experience IDs injected into its Pi prompt. Successful first-attempt completion, success after recovery, and terminal failure are counted separately and keyed by `runId:taskId`, making updates idempotent across retries, reloads, or repeated reflection calls.

These counters are deliberately labelled **observational**:

- `successfulUses` means the task succeeded while the experience was present.
- `recoveredUses` means the task required retry or correction before succeeding.
- `failedUses` means the task failed while the experience was present.
- None of these values proves that the experience caused the outcome.

Retrieval uses the counts only as a small ranking signal after objective-term and role relevance. Pi planning, execution, and reflection prompts explicitly warn that the counts are correlational. This follows influence-based and counterfactual evaluation research rather than trusting agent introspection.

## Implemented Phase: Counterfactual Promotion Gate

The evolution ledger now stores matched control and treatment metrics for an experience. Each evaluation records a task fingerprint, an environment fingerprint, pass/fail, normalized quality, retries, token usage, and duration. Promotion assessment requires:

- at least three evaluation cases across three distinct task fingerprints;
- one comparable model/runtime/budget environment fingerprint;
- sufficient observational reuse and successful reflection evidence;
- at least one control-failure to treatment-success win;
- a positive median quality delta;
- no regressions under the default conservative policy.

Passing this gate permits Pi to generate a **candidate** `SKILL.md`, not an active Skill. The candidate is persisted in the evolution catalog with the exact evaluation IDs used for generation. Its frontmatter always contains `disable-model-invocation: true`, its status remains `DRAFT`, and repeated generation with unchanged evidence reuses the existing candidate.

This creates three separate states: experience, causally evaluated capability candidate, and eventually validated Pi Skill. No current code path promotes or synchronizes a generated candidate into an Agent Profile.

## Implemented Phase: Isolated Counterfactual Replay

Swarm Editor can now produce evaluation records from two prepared code patches under matched conditions:

1. Control and treatment start from the same explicit Git commit hash.
2. Each variant receives its own detached worktree under `~/.swarm-editor/evaluation-worktrees`.
3. Patches are applied with direct `git apply` arguments; no shell interpolation is used.
4. Verification runs concurrently for both variants through a pre-existing local Podman image.
5. Podman must report `rootless=true` before any verification starts.
6. The container uses `--pull=never`, disabled networking, a read-only root filesystem, dropped capabilities, `no-new-privileges`, private IPC, PID/memory/CPU limits, and an ephemeral `/tmp`.
7. The only writable host mount is the individual evaluation worktree.
8. Podman infrastructure exits (`125`–`127`) abort the replay and are never recorded as experience failures.
9. Worktrees are removed in `NonCancellable` cleanup even when patching, verification, or sibling execution fails.

Configuration is intentionally explicit:

```bash
export SWARM_EVAL_IMAGE=localhost/swarm-eval:current
export SWARM_EVAL_RUNTIME=/usr/bin/podman # optional when podman is on PATH
```

`infra/evaluation/build-image.sh` builds the project-specific offline image and emits a local manifest containing the exact source revision, source-tree hash, pinned base-image digest, and resulting image ID. Use the emitted `sha256:...` ID as `SWARM_EVAL_IMAGE`; promotion-grade evidence should only use manifests whose `sourceDirty` field is `false`.

Uncommitted editor state is captured without touching the user's index: a temporary `GIT_INDEX_FILE` stages the effective working tree, two consecutive tree captures must agree, and a deterministic `git commit-tree` object is pinned under `refs/swarm-editor/evaluation-snapshots/`. The resulting commit hash is the shared replay revision, so both variants start from identical tracked and untracked content.

## Implemented Phase: Utility-Aware Memory Selection

Experience retrieval now separates lexical/role recall from evidence-based admission:

1. `SwarmExperienceStore` recalls an expanded candidate set using only task relevance, role compatibility, reflection evidence, and recency.
2. `UtilityAwareSwarmExperienceSelector` scores observational outcomes and matched control/treatment evidence independently.
3. Repeated observational harm can trigger abstention only after a minimum evidence threshold; unseen memory remains eligible for bounded exploration.
4. Two or more distinct task regressions within one comparable environment suppress an experience even when it is lexically dominant; incompatible environment cohorts are never pooled.
5. Controlled wins override noisy observational failures because correlated task outcomes are weaker evidence than interventions.
6. Every candidate produces an inspectable decision containing a hashed query fingerprint, relevance, utility, controlled environment, wins/regressions, median quality delta, final score, and abstention reason; relevant candidates beyond the injection budget are explicitly marked `ABSTAINED_LIMIT` rather than falsely recorded as selected.
7. Planner and task execution use the gated selector. Planning decisions are stored on `SwarmRun`; per-attempt task decisions survive success, failure, timeout, retry, and persistence. This creates the trace needed for later route-policy evaluation.
8. The reflector deliberately uses ungated recall so a quarantined lesson can receive new evidence and recover rather than becoming permanently unreachable.

This is a deterministic approximation of the “when to use memory” policy suggested by Mem-$\pi$ and the validation-conditioned controller in PYTHALAB-MERA. It does not claim learned optimal retrieval; it creates the auditable data and safe abstention behavior needed before training or model-based routing is justified.

## Implemented Phase: Evidence-Driven Routing Challenges

Persisted routing decisions now feed an on-demand challenge planner that allocates scarce counterfactual evaluation effort:

1. Controlled regressions receive the highest priority and remain visible for recheck or retirement review.
2. `ABSTAINED_OBSERVED_HARM` decisions become leave-one-out challenges only when no comparable controlled case already exists.
3. Repeated selected failures and failed planning injections become removal challenges, while repeated unverified successes become benefit-verification challenges.
4. Repeated `ABSTAINED_LIMIT` outcomes are tracked separately as routing-capacity questions rather than being mislabeled as harmful memory.
5. Priorities are deterministic and include selected success/recovery/failure counts, planning outcomes, abstention reasons, comparable evaluation summaries, hashed query fingerprints, run ids, and task keys.
6. The planner never promotes, retires, or changes an experience. It only creates an auditable queue for later matched replay.

This operationalizes the inexpensive LOO attribution result from Agents that Matter and the target-relevant case-selection principle from PACE. The challenge score is a scheduling heuristic, not a causal estimate; causal claims still require control/treatment replay under one environment fingerprint.

## Implemented Phase: Reproducible Routing Evaluation Cases

The challenge queue can now be materialized into persistent leave-one-out case specifications without claiming that an executable variant already exists:

1. All cases in one preparation batch share one content-addressed repository snapshot, including its tree hash and pinned reference.
2. Task-level provenance is preferred over planning provenance when both exist because it preserves the concrete prompt, role, Agent Profile, attempt, and selected experience cohort.
3. The control cohort removes the challenged experience; the treatment cohort adds it back while preserving other selected experiences from the same attempt.
4. Case and task fingerprints are deterministic, so repeated preparation against the same snapshot, provenance, cohort, and verifier command is idempotent.
5. Missing runs, tasks, routing decisions, or Agent Profile identity produce explicit `BLOCKED_PROVENANCE` cases rather than silently guessing.
6. Cases remain `READY_FOR_VARIANT_GENERATION`, not replayable evaluations. Pi must still generate both variants through the isolated tool broker before the existing matched verifier can run them.

This separates experimental design from patch generation and prevents observational output or incomplete traces from being mislabeled as counterfactual evidence.

The image must already exist locally and contain every dependency required by the verifier command. Runtime package downloads are impossible because evaluation containers have no network access.

Current replay evaluates prepared control/treatment patches; it does not put Pi model credentials or the Pi agent process inside the container. This prevents untrusted code from reading model secrets. Automated Pi generation of both patches will require a separate brokered tool-execution architecture.

The broker keeps Pi and model credentials on the host, overrides Pi's existing pluggable read/bash/edit/write operations, and multiplexes tool requests over the existing JSONL subprocess channel. Native repository-facing operations execute in a persistent Bubblewrap sandbox with no provider secrets; deterministic plugin capabilities use a separate Wasmtime sandbox. The complete protocol, capability model, cancellation strategy, and rollout plan are documented in `docs/architecture/pi-tool-broker.md`.

The Pi-side protocol, Kotlin host broker, persistent audit store, and Bubblewrap capability executor are now implemented. Session constructors accept caller-provided base tools, RPC mode owns the only stdin reader, and responses are correlated through nonce-bound pending-request state machines on both sides. Kotlin independently enforces operation allowlists, payload limits, deadlines, cancellation, mandatory audit ids, and host-only activation. Broker session ids and audit ids now flow into persisted Swarm task records across success, failure, timeout, and retries. Authorized Agent Profiles opt in through an explicit Agent-id allowlist and require no OCI image; the remaining evolution work is to generate control/treatment patches in isolated content-addressed worktrees and bind those task audit ids into executable evaluation variants.

## Next Evolution Layers

### 1. Validation and Credit Assignment

- Generate executable control/treatment patches from prepared cases through the isolated Pi tool broker.
- Compare baseline, experience-enabled, and leave-one-experience-out variants under matching model and budget settings.
- Track success, retries, token cost, duration, test results, and reviewer findings.
- Promote or challenge experience only after controlled evidence; never from self-assessment alone.
- Retire low-value or repeatedly contradicted experience without deleting provenance.
- Maintain sealed anchor cases for evaluator changes and reject metric updates that improve candidate scores while degrading anchor agreement.
- Add role-level leave-one-out replay and privilege-precision metrics inspired by Agents that Matter and ClawArena-Team.
- Execute prepared cases only after both variants are generated inside isolated workspaces and pass provenance checks.

### 2. Trace-Derived Pi Skills

- Generate disabled candidate `SKILL.md` packages only after the counterfactual promotion gate passes.
- Require both observational support and leave-one-out evaluation improvement.
- Run focused repository tests in an isolated worktree before activation.
- Keep generated skills disabled until human approval or a configured benchmark threshold.

### 3. Workflow and Profile Archive

- Treat planner policies, role assignments, prompts, model choices, and concurrency as versioned candidates.
- Preserve parent/child lineage and benchmark results, following DGM's archive rather than replacing the current best configuration.
- Use AFlow-style search only against explicit evaluation suites and cost budgets.

### 4. Sandboxed Live Evolution

- Allow Pi to generate temporary tools or workflow code only inside an isolated process/worktree.
- Deny automatic mutation of the vendored Pi runtime, production configuration, credentials, and main working tree.
- Require compilation, tests, security checks, and rollback metadata before promotion.
- Keep model/API credentials outside verification containers; broker only bounded file and process operations.

## Non-Negotiable Gates

- No HTTP/WebSocket control plane; learning remains in-process Kotlin plus Pi JSONL subprocesses.
- Preserve coroutine cancellation and bound every reflection/evaluation operation.
- Keep source-run provenance and reversible state transitions.
- Separate generation, evaluation, and activation; model self-assessment alone is not evidence.
- Optimize for verified task success and integration quality, not the volume of stored memories.
