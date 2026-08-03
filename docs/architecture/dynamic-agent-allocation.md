# Dynamic Agent Allocation

Swarm tasks do not bind to persisted child-Agent profiles. The primary Pi profile supplies identity, prompt policy, working directory, timeout, and model-selection strategy. At execution time, `AgentService.acquireDynamicAgent` creates an ephemeral allocation for the task role.

## Capacity Model

Two independent limits must be available before a Pi session starts:

- `AgentConfig.maxDynamicSubagents` limits concurrent children of the selected primary profile.
- `ModelConfig.maxConcurrentAgents` limits concurrent sessions using one configured model.

`ModelService.acquire` selects only enabled, role-compatible models with remaining capacity. Quality-first and speed-first preserve their explicit ordering. Balanced Swarm allocation matches the task's target thinking level first, then model priority and remaining capacity; if the closest model is saturated, it falls back to the closest available model. Saturated tasks suspend without polling and remain cancellable.

## Task-Aware Demand

`SwarmModelDemandAssessor` derives a normalized demand score from role, retry count, write-scope breadth, verification commands, revision contracts, downstream reach, bridge centrality, and matching repository dependency-cluster evidence. The score maps to a Pi thinking target from `minimal` through `xhigh`.

Tarjan SCC evidence remains repository-localization evidence rather than an executable task graph. When a task owns files inside a detected SCC, its repository-risk score raises both model demand and scheduler utility so tightly coupled changes receive stronger reasoning and earlier attention.

## Lifecycle and Evidence

The executor owns the allocation for the complete Pi session lifecycle. Session creation failure, prompt failure, timeout, cancellation, verification failure, and normal completion all release model and Agent slots in `NonCancellable` cleanup. Release is idempotent.

Each `SwarmTaskAttemptRecord` persists the resolved Agent id, model-config id, provider, model, assessed demand, target thinking level, repository risk, and selection explanation. The Swarm task UI displays the actual model and demand target, so scheduling claims can be checked against stored execution evidence rather than inferred from current settings.
