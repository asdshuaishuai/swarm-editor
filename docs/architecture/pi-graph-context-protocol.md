# Pi Graph Context Protocol

Swarm planning and task execution use Pi sessions directly over the in-process Kotlin backend and JSONL stdio runtime. Each prompt is an evidence contract, not a free-form request.

## Planning Contract

The planner receives the objective, available Pi profiles, routed project experience, and bounded repository-localization evidence. It must produce the smallest executable DAG that preserves real information and artifact dependencies.

Tarjan SCC evidence describes coupled source files, not executable task cycles. Mutually dependent files stay under one write owner unless repository evidence demonstrates a stable interface boundary. Cross-layer plans must name the complete data path and explicit downstream handoffs instead of creating one task per file.

## Execution Context Envelope

Every task prompt contains:

- resolved Agent/model identity, target thinking level, demand score, and selection rationale;
- persisted scheduling policy, utility, graph depth, reach, and bridge centrality;
- only repository evidence matching the task's read/write ownership or explicit prompt paths;
- pinned revision-contract details for rejected artifact repair;
- bounded upstream handoffs, prior failures, routed experience, ownership, and mechanical verification commands.

Repository excerpts and upstream output are delimited and labeled as evidence rather than instruction authority. Individual handoffs and total injected handoff content have deterministic character limits to prevent one verbose node from consuming the next node's context budget.

## Result Handoff

Pi tasks return structured sections for outcome, evidence, changes, verification, residual risk, and downstream handoff. This keeps observations separate from inference, prevents unexecuted checks from being presented as proof, and gives dependent nodes a stable artifact they can consume without repeating discovery.

The backend parses Markdown, plain-text, and localized section headings into `SwarmTaskHandoff`. Complete, partial, and unstructured responses are distinguished explicitly. The original Pi output remains stored for audit compatibility, while the parsed handoff is persisted on the task and attempt record, consumed by downstream prompts, and summarized by the Swarm UI and experience learner. Fenced code blocks are excluded from heading detection, and oversized sections are bounded independently.
