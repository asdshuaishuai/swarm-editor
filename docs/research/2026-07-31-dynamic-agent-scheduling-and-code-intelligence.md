# Dynamic Agent Scheduling and Code Intelligence

## Objective

Swarm Editor should behave as an AI-native IDE rather than a chat client with tools. Pi remains the only agent runtime, while Kotlin owns task-graph validity, scheduling, evidence, persistence, sandbox authority, and UI explainability.

Source snapshot: August 1, 2026. arXiv title/id mappings were checked against the arXiv API; GitHub references point to the upstream repositories reviewed on that date.

## Primary Sources Reviewed

| Work | Mechanism | Lesson for Swarm Editor |
|---|---|---|
| [CodePlan](https://arxiv.org/abs/2309.12499), [code](https://github.com/microsoft/CodePlan) | Repository-level planning with incremental context updates | Planning should produce an explicit dependency graph and revisit repository evidence after each completed step. |
| [DyLAN](https://arxiv.org/abs/2310.02170), [code](https://github.com/SALT-NLP/DyLAN) | Dynamically constructs an agent network and evaluates agent contribution | Ready tasks and Agent Profiles should be selected dynamically instead of following a fixed queue. |
| [SWE-agent](https://arxiv.org/abs/2405.15793), [code](https://github.com/SWE-agent/SWE-agent) | Agent-computer interfaces designed for software work | Tool shape, bounded output, navigation, and edit feedback matter as much as the model prompt. |
| [Agentless](https://arxiv.org/abs/2407.01489), [code](https://github.com/OpenAutoCoder/Agentless) | Separates localization, repair, and patch validation | Repository localization should be a first-class deterministic phase, not incidental exploration inside every task. |
| [OpenHands](https://arxiv.org/abs/2407.16741), [code](https://github.com/All-Hands-AI/OpenHands) | Event-driven agent/runtime platform | Agent actions should remain observable as structured events that can feed logs, replay, and evaluation. |
| [AFlow](https://arxiv.org/abs/2410.10762) | Searches agentic workflows against measured outcomes | Planner prompts and scheduling policies should become versioned candidates evaluated on held-out tasks. |
| [MetaGPT](https://arxiv.org/abs/2308.00352), [code](https://github.com/FoundationAgents/MetaGPT) | Role-specific software-engineering workflows | Planner, implementer, reviewer, and integrator roles need distinct policies and outputs, not cosmetic labels. |
| [OverEager-Gen](https://arxiv.org/abs/2605.18583) | Measures out-of-scope changes and unnecessary feature expansion by coding agents | Declared scope must be audited against the actual patch; prompt compliance is insufficient. |
| [FixedBench](https://arxiv.org/abs/2605.07769) | Separates repository understanding from deciding whether code should change | Read-only tasks and empty write scopes must be enforceable runtime contracts. |
| [Effective Strategies for Asynchronous Software Engineering Agents](https://arxiv.org/abs/2603.21489) | CAID combines centralized delegation, asynchronous execution, isolated workspaces, Git integration, and executable verification | Parallel agents need independent worktrees and explicit artifact handoff rather than a shared mutable directory. |
| [CodeTeam](https://arxiv.org/abs/2606.22082) | Dependency-aware scheduling with file ownership and asynchronous artifact integration | Downstream tasks should inherit upstream code artifacts through the DAG, not only textual summaries. |
| [IDEAL Agents](https://github.com/Indie365/IDEAL_Agents) | Git-backed event and artifact history for inspectable multi-agent work | Persisted plans, evidence ids, and immutable artifact revisions provide a stronger UI substrate than transient chat summaries. |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Confirmation mode and security analysis for risky Agent actions | Applying a verified artifact remains a separate user-authorized operation even after mechanical checks pass. |
| [(Im)Paired Programming](https://arxiv.org/abs/2607.26375) | Finds that low-effort Agent use and auto-accepted edits improve completion while reducing code understanding | Review UX should require active inspection of risky changes instead of treating an open drawer or elapsed time as proof of oversight. |
| [Trust but Verify?](https://arxiv.org/abs/2607.12428) | Studies security smells in Agent-authored changes and reports frequent supply-chain and credential failures missed before integration | Security, dependency, secret, execution, and persistence surfaces need context-aware review guards at the human/Agent handoff. |
| [Predicting Acceptance and Review Effort](https://arxiv.org/abs/2607.12057) | Uses submission-time metadata and lightweight diff statistics for advisory triage | Risk classification should prioritize attention, not automatically approve or reject a patch. |
| [AgentLens](https://arxiv.org/abs/2607.06624), [code](https://github.com/agent-lens/agent-lens-bench) | Combines formal checks with evidence-citing whole-trajectory reviews | Swarm evaluation should retain process evidence and readable causes, not only final pass/fail. |
| [SWE-Review](https://arxiv.org/abs/2607.06065), [code](https://github.com/SWE-Lego/SWE-Review) | Closes the generate-review-revise loop with structured repository-aware review | Rejection should create a new artifact and verification lineage instead of mutating the already-reviewed patch. |
| [Looping Is Not Reliability](https://arxiv.org/abs/2607.24604) | Separates admission, preservation, certification, competence, and liveness through state-bound typed revision contracts | A repair task must bind feedback and verifier evidence to the exact source artifact; merely asking the Agent to “try again” is insufficient. |
| [CodeRescue](https://arxiv.org/abs/2607.19338), [code](https://github.com/Qijia-He/agent-budget-control) | Routes post-failure recovery between another cheap attempt and stronger escalation under a calibrated budget | Revision scheduling should eventually learn when to reuse the current model, escalate, or stop instead of applying one fixed retry policy. |
| [Partial Contracts Suffice](https://arxiv.org/abs/2607.10291) | Uses caller-sufficient partial contracts for sound regression verification without requiring a complete behavioral specification | Revision preservation can begin with narrow, mechanically enforceable path and state contracts while richer semantic obligations are learned incrementally. |
| [GitButler hunk dependency](https://github.com/gitbutlerapp/gitbutler/tree/master/crates/but-hunk-dependency) | Tracks line-range ownership and dependencies so hunks and commits are only rearranged when their prerequisites remain valid | True hunk-level acceptance needs an explicit dependency graph; visual selection alone is not sufficient evidence that hunks are independently applicable. |
| [Proof-or-Stop](https://arxiv.org/abs/2607.14890) | Gates lifecycle transitions on fresh source-state-bound evidence | “Reviewed” and “ready to apply” must be enforced states backed by current evidence, not Agent or UI claims. |
| [HALO](https://arxiv.org/abs/2607.27636) | Rechecks localized obligations immediately before dispatch and rejects stale components | Artifact application should revalidate the exact plan and only admit reviewed components whose prerequisites remain true. |
| [CodeSpec](https://arxiv.org/abs/2607.26777) | Compiles architecture and behavior expectations into executable specifications for long-horizon features | Planning should evolve from free-form tasks toward machine-checkable cross-component contracts. |
| [VITAL-RAG](https://arxiv.org/abs/2607.26937) | Allocates context by canonical code object while suppressing redundant views | Repository evidence should deduplicate repeated fragments without discarding semantically distinct local context. |

## Synthesis

The shared pattern is **structured narrowing**:

1. Localize the relevant repository surface.
2. Build a dependency-aware plan with explicit ownership and verification.
3. Select only the agents and tasks useful for the current state.
4. Execute through a constrained, observable interface.
5. Validate patches and feed measured outcomes into the next decision.

The previous scheduler violated step three: every ready task was dispatched in stored order under `fifo-ready-v1`. This ignored downstream critical paths, historical duration, retries, and Agent Profile contention.

## Implemented Iteration

`critical-path-dp-ownership-v2` now computes remaining path cost over the unfinished task DAG using memoized dynamic programming. Ready tasks are ranked by:

- estimated remaining critical-path cost;
- direct dependent tasks unlocked on success;
- retry recovery priority;
- a penalty when the requested Agent Profile is already active;
- deterministic original task order as the final tie-breaker.

Every scheduling decision persists the policy id, state fingerprint, utility, disposition, and an explanation. The Agent orchestration UI exposes the active policy and per-task DP utility. Planner tasks now declare repository-relative `readPaths` and `writePaths`; the scheduler greedily preserves DP order while refusing active/read-write and same-wave/write-write overlap. Conflict deferrals are persisted as `DEFERRED_OWNERSHIP_CONFLICT` evidence.

Repository localization is now a deterministic pre-planning phase. It performs bounded path/text ranking, enriches high-value source files with LSP document symbols and diagnostics, adds related Git history, enforces a persisted character budget, and stores the resulting evidence bundle on the `SwarmRun`. Pi Planner receives the bundle as incomplete evidence that must be verified rather than rediscovered blindly.

Production Pi task execution now uses detached Git worktrees. Each completed attempt persists the concrete name-status path list, durable artifact revision, declared write scopes, ownership policy, and violations. Out-of-scope edits fail the task with `SwarmOwnershipViolationException`; the scheduler stores that root cause and evidence id. Legacy tasks with no ownership declaration remain unaudited for compatibility, while Planner-produced read-only tasks are enforced by declaring read paths with an empty write set.

Dependency code flow is now artifact-based. A downstream task with one dependency starts from that dependency's pinned artifact revision. Multiple dependencies are merged into a pinned synthetic base before Pi starts; conflicts fail without wasting retries. The end-to-end scheduler test proves that a downstream Pi session reads a file created by its upstream dependency while the user's main worktree remains untouched. Verified artifact integration also accepts these dependency-derived revisions and merges their complete tree against the run baseline.

Task verification is now runtime-owned rather than Agent-reported. Planner tasks declare structured argv commands; the verifier executes them sequentially inside the task worktree, stops on the first failure, persists sandbox preflight and output digests, and records the evidence id on every scheduler attempt. Native verification records only the protections it actually provides; Bubblewrap is an explicit stronger Linux mode.

Verified artifacts now follow an evidence-first review/apply flow. The backend prepares and pins a three-way integration plan without touching the user's worktree, exposes a bounded unified diff derived from the reviewed Git trees, and applies only after an explicit UI action. Application revalidates the current repository snapshot, writes a patch without moving `HEAD`, rolls back if persistence fails, and discards stale plans so a fresh review can be generated. The Compose orchestration screen presents this as a dedicated side drawer with verification identity, changed paths, syntax-colored diff lines, and a second-step inline confirmation.

Human review now produces its own structured Swarm evidence without entering the Agent activity log. `OPENED`, `COVERAGE_RECORDED`, `CLOSED`, `REJECTED`, `APPLY_REQUESTED`, `APPLIED`, `STALE`, `APPLY_FAILED`, and `APPLY_CANCELED` events persist the plan/task identity, bounded dwell time, diff size, changed-path count, timestamp, and failure category—but never raw reviewer text or unrelated UI behavior. This separates collaboration-quality telemetry from Agent tool/MCP/Skill activity while preserving enough provenance to detect rubber-stamp review and evaluate intervention outcomes.

The August 1 review iteration makes that evidence hunk-aware. The backend deterministically splits the bounded unified diff, classifies each hunk with controlled risk reasons, and exposes stable hunk ids. The Compose drawer renders independent hunk cards, records which ids actually entered the viewport, and shows total and high-risk coverage. Applying a plan is now rejected when the preview is truncated or any high-risk hunk lacks persisted coverage evidence. The gate remains advisory for low-risk hunks and never stores reviewer text, pointer coordinates, or unrelated UI activity.

The rejection path is now a state-bound revision loop rather than a terminal UI action. Reviewers choose a controlled defect reason, optionally target viewed hunk ids, and either abandon the plan or request revision. A revision request discards the prepared integration plan, releases its pinned reference, and appends a fresh Pi implementer task whose `SwarmArtifactRevisionContract` records the exact source plan, task attempt, artifact revision/tree, target hunks, target paths, and rejection reason. The task depends on the rejected source task, so the dependency resolver starts it from that artifact rather than the user's worktree. It inherits ownership and structured verification commands, must produce a new artifact, and passes through the normal ownership audit and runtime verification before another integration plan can exist.

Revision preservation is now explicit. The reviewer chooses `TARGET_PATHS_ONLY` for a narrow repair or `SOURCE_WRITE_SCOPE` when the root cause requires sibling changes inside the original task boundary. The contract stores both the selected mode and the source write declarations; `SwarmGraph` requires the generated task's `writePaths` to exactly match that choice and requires every target path to be writable. The existing workspace ownership audit then rejects any out-of-contract file change. The orchestration task card renders the source task, attempt, artifact id, rejection reason, scope mode, and target count so the revision lineage remains visible instead of appearing as an unrelated new task.

Artifact review now also derives an explicit hunk dependency graph. Unified-diff headers provide old/new line ranges and file lifecycle operations; overlapping ranges and added, deleted, renamed, or binary file lifecycles create structural edges. Lifecycle coupling uses a bidirectional anchor graph, preserving the same closure with linear rather than quadratic edge growth. A bounded changed-symbol heuristic links declaration hunks to hunks that reference the changed name. The backend deterministically condenses dependency cycles into strongly connected components, and the drawer marks those components as coupled review units. When a reviewer requests revision, the backend computes the target hunks' prerequisite closure, persists those hunk and path ids as read-only context, and does not widen the selected write scope.

The preview now supplements those heuristics with Git-backed isolated applicability evidence. For each bounded textual hunk, the backend reconstructs its complete file patch envelope, loads the reviewed `currentTree` into a disposable `GIT_INDEX_FILE`, and executes `git apply --cached --check` without reading or writing the user's index or worktree. Results are controlled statuses rather than raw Git output: independently applicable, not independently applicable, unsupported, skipped by the bounded check limit, skipped because the preview is truncated, or checker failure. High-risk hunks are checked first, and the UI states the exact reviewed tree semantics instead of treating a successful check as semantic correctness.

Reviewers can now request a selection preview before submitting structured revision feedback. The backend validates the requested hunk ids, computes the full transitive prerequisite closure—including strongly connected groups—reconstructs one ordered multi-file patch with one prelude per file, and checks that combined patch against the reviewed tree's disposable index. The result reports requested, automatically included, and effective hunk ids plus changed paths and a controlled applicability status. It remains a preview only: it neither writes the user's worktree nor bypasses the requirement to synthesize and re-verify a replacement artifact.

## Known Limits

- Cost estimates use role weights and local attempt durations; they do not yet learn per-model or per-repository distributions.
- The scheduler can append a state-bound revision task after explicit review rejection, but it does not yet perform general graph replanning after arbitrary evidence or repeated failure.
- Ownership enforcement is path-declaration based; legacy tasks without declarations remain compatible and therefore are not audited or conflict-gated.
- Localization uses ranked textual evidence and LSP document intelligence; it does not yet maintain an incremental cross-file call graph.
- Rejection feedback can target files or hunks, but acceptance remains whole-plan; partial acceptance still requires generating and re-verifying a new artifact tree rather than selectively applying an already-verified patch.
- The hunk graph and its strongly connected components currently prove only bounded line-range, file-lifecycle, and changed-symbol heuristic relationships. They are not a complete semantic dependency proof and cannot yet guarantee preservation of unselected same-file hunks.
- An isolated Git applicability pass proves only that a reconstructed hunk patch can be applied to the reviewed tree's index. It does not prove compilation, behavior, semantic independence, or that omitting neighboring hunks is correct.
- Risk classification is deterministic and explainable but still heuristic; it needs repository-specific calibration and measured false-positive/false-negative analysis.
- Review coverage proves that a hunk entered the viewport, not that the reviewer understood it; comprehension-sensitive evaluation remains an open problem.

## Next Research-Driven Layers

1. Add incremental cross-file symbol/reference edges to the localization bundle.
2. Learn duration and failure priors by role, model, file surface, and verifier class from persisted attempt records.
3. Support incremental replanning after dependency completion or repeated failure while preserving the original plan lineage.
4. Combine isolated applicability, semantic symbol edges, and prerequisite closure to synthesize a candidate partial artifact tree; always run ownership audit and verification on that new tree before presenting a replacement integration plan.
5. Learn revision routing across model reuse, escalation, split, and abandon decisions from measured cost and recovery outcomes.
6. Calibrate risk rules against persisted review outcomes and security/static-analysis findings while keeping automatic decisions out of the classifier.
7. Archive planner and scheduler variants, then evaluate them with AFlow-style controlled suites rather than self-reported confidence.
