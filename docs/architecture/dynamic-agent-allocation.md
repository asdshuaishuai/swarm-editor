# Dynamic Agent Allocation

Swarm tasks do not bind to persisted child-Agent profiles. The primary Pi Agent is system-defined and persists only its selected main-model ID. At execution time, `AgentService.acquireDynamicAgent` derives an ephemeral runtime profile from the task role and assessed model demand.

## Capacity Model

Two independent limits must be available before a Pi session starts:

- The system `AgentConfig.maxDynamicSubagents` default limits concurrent ephemeral children; it is not a user-facing primary-Agent setting.
- `ModelConfig.maxConcurrentAgents` limits concurrent sessions using one configured model.

`ModelService.acquire` selects only enabled, role-compatible models with remaining capacity. Dynamic Swarm allocation uses balanced demand matching: target thinking level first, then model priority and remaining capacity. If the closest model is saturated, it falls back to the closest available model. Saturated tasks suspend without polling and remain cancellable. The main model does not pin child-Agent model selection.

## Task-Aware Demand

`SwarmModelDemandAssessor` derives a normalized demand score from role, retry count, write-scope breadth, verification commands, revision contracts, downstream reach, bridge centrality, and matching repository dependency-cluster evidence. The score maps to a Pi thinking target from `minimal` through `xhigh`.

Tarjan SCC evidence remains repository-localization evidence rather than an executable task graph. When a task owns files inside a detected SCC, its repository-risk score raises both model demand and scheduler utility so tightly coupled changes receive stronger reasoning and earlier attention.

## Lifecycle and Evidence

The executor owns the allocation for the complete Pi session lifecycle. Session creation failure, prompt failure, timeout, cancellation, verification failure, and normal completion all release model and Agent slots in `NonCancellable` cleanup. Release is idempotent.

Each `SwarmTaskAttemptRecord` persists the resolved Agent id, model-config id, provider, model, assessed demand, target thinking level, repository risk, and selection explanation. The Swarm task UI displays the actual model and demand target, so scheduling claims can be checked against stored execution evidence rather than inferred from current settings.
