# Project Workspace

## Boundary

`ProjectWorkspace` is the user-visible workspace registry inspired by ThinkRail's project → workspace
→ worktree model. It is separate from Swarm's short-lived task/evaluation worktrees:

- `DEFAULT` points at the canonical project root and cannot be removed.
- `MANAGED_WORKTREE` is created and removed by `WorkspaceService` under
  `ConfigPaths.PROJECT_WORKSPACES_DIR`.
- `ATTACHED_WORKTREE` references an existing Git worktree and is detached from the registry without
  deleting user files.

The registry persists canonical project path, workspace id, cwd, branch, kind, active workspace id,
and timestamps in `ConfigPaths.PROJECT_WORKSPACES_JSON`. `WorkspaceStore` uses a bounded, atomic JSON
replacement with corrupt-file quarantine and rolls back its in-memory map when persistence fails.

## Git Safety

`WorkspaceService` passes Git arguments as a list through `CommandRunner`; it does not construct shell
strings. Branch names are restricted to a conservative Git-safe grammar. Managed worktrees are created
with `git worktree add -b`, and cleanup runs `git worktree remove --force` followed by `git worktree
prune`. Attached worktrees must already appear in `git worktree list --porcelain`, so an arbitrary
directory cannot be registered as a project workspace.

The managed worktree path is normalized under the configured workspace root. If registry persistence
fails after creation, the service attempts non-cancellable Git cleanup and preserves the original error.
Removing an attached workspace only changes the registry; it never runs Git removal.

## Current Integration Boundary

The backend composition root exposes `WorkspaceService`, which maintains an in-memory active cwd backed by
the persisted active workspace id. `ProjectService` and `GitService` resolve their directory through that
boundary, while Pi sessions use the active cwd when an agent profile does not specify an explicit working
directory. Conversation project-spec context follows the same active cwd. Explicit agent working
directories and Swarm task/evaluation isolation remain independent of this registry.

Behavior tests cover default creation, managed create/select/remove, attached registration, attached
non-destructive removal, invalid branch rejection, registry persistence, dynamic project/Git reads, and
Pi working-directory resolution.
