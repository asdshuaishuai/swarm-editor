package com.swarmeditor.backend.swarm

import java.io.File

internal fun requireGitWorktree(repositoryRoot: File, capability: String) {
    require(File(repositoryRoot, ".git").exists()) {
        "$capability requires a Git worktree; initialize Git in ${repositoryRoot.absolutePath} first"
    }
}
