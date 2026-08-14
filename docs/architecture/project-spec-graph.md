# Project Spec Graph

## Purpose

`ProjectSpecGraphScanner` is the local, read-only slice inspired by JetBrains ThinkRail's
`pi-spec-graph`. It derives a project specification graph from repository files without coupling the
model to Pi, Compose, HTTP, or the Swarm execution scheduler.

The filesystem remains the source of truth. The scanner does not write, normalize, or execute spec
content. It returns parsed nodes plus diagnostics so the Specs tool window and the Pi context provider
share one host-side model.

## Spec Boundary

A file is considered a spec only when its first frontmatter block contains non-blank `id` and `type`
fields:

```yaml
---
id: module-backend
type: module-design
title: Backend module
parent: architecture
depends-on: [module-common]
references: [module-runtime]
implements: [goal-runtime]
tags: [backend, pi]
---
```

The current parser intentionally supports the small, deterministic subset needed by the first read-only
viewer: scalar values and inline comma-separated lists. Full YAML, nested fields, multiline values, and
frontmatter mutation remain out of scope until a compatible JVM YAML dependency is selected.

## Graph Rules

- `id` is the stable node key; duplicate IDs retain the lexicographically first path and emit an error.
- `title` falls back to `id` when absent.
- `parent`, `depends-on`, `references`, and `implements` must resolve to known IDs.
- Parent cycles emit errors but do not discard nodes.
- `task-spec` is represented as a normal node; durable-vs-ephemeral filtering belongs to a later host
  policy layer, matching ThinkRail's distinction.
- `.git`, `.gradle`, `.idea`, `build`, `dist`, `node_modules`, `out`, and `target` are excluded.
- Symbolic links are excluded to keep project boundaries lexical and prevent external content injection.
- Files larger than 2 MiB are ignored; unreadable candidate files produce warnings.

## Runtime Boundary

`ProjectSpecGraphScanner.scan` performs filesystem work on `Dispatchers.IO`. It is a suspend API and is
shared by `ProjectService`, the Specs view model, and the Pi context adapter. The scanner keeps a
process-local cache keyed by canonical project root and revalidates candidate paths using relative path,
size, and full filesystem modification time before reusing a graph. Directory traversal still runs on
every scan, so additions, removals, exclusions, and symlink changes are observed without making the
cache a second source of truth. File content is reread whenever metadata changes.

The model is separate from `SwarmGraph`:

- `ProjectSpecGraph` describes user-authored repository knowledge and is read-only in this slice.
- `SwarmGraph` describes an executable task DAG and owns scheduling, retries, handoffs, and artifacts.

Do not merge these graphs or use project-spec `depends-on` edges as executable Swarm dependencies without
an explicit planning step and ownership validation.

## Verification

`ProjectSpecGraphTest` verifies valid graph construction, ignored files/directories, missing references,
parent cycles, duplicate IDs, malformed frontmatter, and metadata-based cache invalidation.
`ProjectService.getSpecGraph()` exposes the scanner through the existing in-process backend boundary.
The desktop DTO/ViewModel and right-panel Specs tool window render the parent tree, diagnostics, refresh
action, and editor navigation.

The first Pi integration is deliberately narrow: only the first prompt of a new session receives a
bounded `ProjectSpecContextFormatter` result. It contains node IDs, types, paths, parent/dependency
metadata, and diagnostic count; it does not include raw spec content or executable instructions. The
context is wrapped in `<project-spec-context>` markers, labeled as untrusted navigation evidence, and
truncated to 6,000 characters by default. The local user message and Activity records remain the
original prompt, and an empty graph contributes no context. Project Skill Trust is implemented
separately as a backend admission boundary with settings controls and Activity audit.
