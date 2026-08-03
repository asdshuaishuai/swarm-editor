# Dynamic Agent Allocation

Swarm tasks do not bind to persisted child-Agent profiles. The primary Pi profile supplies identity, prompt policy, working directory, timeout, and model-selection strategy. At execution time, `AgentService.acquireDynamicAgent` creates an ephemeral allocation for the task role.

## Capacity Model

Two independent limits must be available before a Pi session starts:

- `AgentConfig.maxDynamicSubagents` limits concurrent children of the selected primary profile.
- `ModelConfig.maxConcurrentAgents` limits concurrent sessions using one configured model.

`ModelService.acquire` selects only enabled, role-compatible models with remaining capacity. Quality-first and speed-first strategies fall through to the next available model; balanced selection weights remaining capacity and keeps affinity deterministic. Saturated tasks suspend without polling and remain cancellable.

## Lifecycle and Evidence

The executor owns the allocation for the complete Pi session lifecycle. Session creation failure, prompt failure, timeout, cancellation, verification failure, and normal completion all release model and Agent slots in `NonCancellable` cleanup. Release is idempotent.

Each `SwarmTaskAttemptRecord` persists the resolved Agent id, model-config id, provider, and model. The Swarm task UI displays the actual model used, so scheduling claims can be checked against stored execution evidence rather than inferred from current settings.
