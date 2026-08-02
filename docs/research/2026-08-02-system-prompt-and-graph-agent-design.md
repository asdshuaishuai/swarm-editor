# System Prompt and Graph-Agent Capability Design

This iteration strengthens Swarm Editor's Pi-only agent system around two first-principles constraints: a model can only use its capability effectively when its operating contract is explicit, and parallel agents are only useful when their information and artifact dependencies are represented as a real graph.

## Research Basis

- [CodePlan](https://arxiv.org/abs/2309.12499) and [microsoft/CodePlan](https://github.com/microsoft/CodePlan) treat repository work as an incrementally updated dependency plan rather than a one-shot checklist.
- [DyLAN](https://arxiv.org/abs/2310.02170) and [SALT-NLP/DyLAN](https://github.com/SALT-NLP/DyLAN) dynamically select useful agent connections instead of preserving a fixed team topology.
- [AFlow](https://arxiv.org/abs/2410.10762) evaluates agent workflows as measurable programs, supporting versioned prompt and scheduler policies rather than intuition-only orchestration.
- [SWE-agent](https://arxiv.org/abs/2405.15793) and [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) show that tool interfaces, bounded observations, and action feedback are part of agent capability, not merely infrastructure.
- [Agentless](https://arxiv.org/abs/2407.01489) and [OpenAutoCoder/Agentless](https://github.com/OpenAutoCoder/Agentless) separate localization, repair, and validation, reducing repeated discovery and unsupported edits.
- [MetaGPT](https://arxiv.org/abs/2308.00352) and [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) reinforce role-specific output contracts, while Swarm keeps roles dynamic rather than instantiating a fixed organization.

## Prompt Architecture

Every dynamically created Pi sub-Agent now receives a shared system protocol plus a role contract. The shared protocol requires repository-grounded decisions, distinguishes observation from inference, forbids invented verification, preserves graph and ownership boundaries, and defines when to stop. Role prompts specialize planning, implementation, adversarial review, and integration without duplicating the task payload.

Task prompts add five capability surfaces:

1. graph position and downstream consequence;
2. explicit repository and write ownership;
3. tool-driven uncertainty reduction;
4. focused then integration-level verification;
5. an auditable result contract covering evidence, residual risk, and justified no-change outcomes.

The design intentionally requests decision evidence rather than hidden chain-of-thought.

## Graph-Theoretic Scheduling

`SwarmGraph.analyze` derives a stable topological order, root depth, transitive upstream and downstream reach, direct dependents, and normalized bridge centrality. The scheduler retains dynamic-programming critical-path cost, then adds structural leverage for nodes that unlock broad downstream work. Ownership conflicts and active-profile contention remain hard scheduling constraints.

This produces a practical topology: high-information localization at the root, safe implementation fan-out, and evidence-driven review or integration fan-in. Redundant transitive edges are discouraged because they inflate coordination without adding information flow.

## Evaluation Direction

Prompt and scheduler identifiers must remain versioned. Future Pi eval cases should compare graph completion time, verified success, token cost, unnecessary edits, retry recovery, and downstream rework. A more elaborate topology is only an improvement when these measured outcomes improve.
