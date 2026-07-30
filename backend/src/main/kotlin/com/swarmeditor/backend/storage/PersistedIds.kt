package com.swarmeditor.backend.storage

import java.io.File

private val persistedIdPattern = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
private val reservedWindowsFileNames = buildSet {
    addAll(listOf("CON", "PRN", "AUX", "NUL"))
    (1..9).forEach { suffix ->
        add("COM$suffix")
        add("LPT$suffix")
    }
}

internal fun String.isSafePersistedId(): Boolean =
    persistedIdPattern.matches(this) && substringBefore('.').uppercase() !in reservedWindowsFileNames

internal fun requireSafePersistedId(id: String) {
    require(id.isSafePersistedId()) { "Invalid persisted identifier: $id" }
}

internal fun File.persistedJsonFile(id: String): File {
    requireSafePersistedId(id)
    val directory = toPath().toAbsolutePath().normalize()
    val target = directory.resolve("$id.json").normalize()
    require(target.parent == directory) { "Persisted identifier escapes its directory: $id" }
    return target.toFile()
}
