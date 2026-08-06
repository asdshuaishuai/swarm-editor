package com.swarmeditor.backend

import java.io.File

const val PROJECT_ROOT_PROPERTY: String = "swarm.projectRoot"

internal fun resolveProjectRoot(explicitRoot: String?, userDirectory: String?): File {
    val explicitDirectory = explicitRoot
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let(::File)
        ?.absoluteFile
        ?.normalize()
    if (explicitDirectory != null) {
        require(explicitDirectory.isDirectory) {
            "项目目录不存在：${explicitDirectory.absolutePath}"
        }
        return explicitDirectory
    }

    val workingDirectory = File(userDirectory.orEmpty().ifBlank { "." }).absoluteFile.normalize()
    return generateSequence(workingDirectory) { it.parentFile }
        .firstOrNull { File(it, ".git").exists() }
        ?: workingDirectory
}
