# GitHub Pages Capability Readiness

This matrix is the release contract for claims published by `site/index.html`. A capability is advertised as ready only when it has production wiring and automated evidence.

| Capability | Status | Production evidence | Verification evidence |
| --- | --- | --- | --- |
| Pi-native runtime | Ready | Vendored `pi-0.83.0` is launched through JSONL stdio by `PiRuntimeManager`. | Pi lifecycle, RPC, tool-broker, and distribution tests. |
| In-process desktop/backend | Ready | Compose view models call Kotlin services in the same JVM; no application HTTP/WS transport. | Backend shutdown and service/view-model tests. |
| Dynamic graph-aware Swarm | Ready | Planner creates a dependency DAG; scheduler combines critical path, downstream reach, bridge centrality, retries, repository/SCC risk, capacity, and ownership gates. Balanced model allocation maps each task to a target Pi thinking level. Each Pi task receives a bounded graph context envelope with matching repository evidence, scheduling rationale, revision contracts, and truncated upstream handoffs. | Graph, prompt-context, demand-assessment, model-allocation, scheduler, dependency integration, and scheduling-policy tests. |
| Git-isolated task execution | Ready | Every Swarm attempt receives a linked Git worktree outside the repository and produces immutable workspace/artifact evidence. | Workspace, isolation integration, artifact integration, and evidence-store tests. |
| LSP code intelligence | Ready with fallback | Source previews expose semantic tokens, document symbols, diagnostics, and line navigation. Missing external language servers fall back to JVM syntax highlighting. | LSP service, project service/view-model, and file renderer tests. |
| Markdown/HTML/JSON dual rendering | Ready | File renderer provides source mode plus bounded preview renderers. | File content renderer tests. |
| Evidence-first review | Ready for Swarm runs | Scheduling decisions, Agent tool audits, verification results, workspace deltas, patches, Diff, and Git artifacts are persisted and shown by review surfaces. | Evidence, verification, artifact, Diff drawer, activity log, and right-panel tests. |
| Bubblewrap isolation | Conditional ready | Linux installations can enable fail-closed Bubblewrap tool brokering and verification after runtime preflight; native mode remains explicitly recorded elsewhere. | Bubblewrap broker, tool worker integration, sandbox preflight, and isolation tests. |

## Not Advertised as Ready

- The hash-pinned Wasmtime execution kernel is implemented and unit tested, but it is not yet connected to the production plugin lifecycle.
- Strongly connected component scheduling is intentionally not used because executable Swarm plans are validated as DAGs.

`./scripts/verify-pages-readiness.sh` checks site wording, Pi version alignment, forbidden overclaims, and the complete project test/build gate. GitHub Pages runs the same verifier before deployment.
