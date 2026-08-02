package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmArtifactDiffHunk
import com.swarmeditor.common.model.SwarmArtifactFileOperation
import com.swarmeditor.common.model.SwarmArtifactHunkDependency
import com.swarmeditor.common.model.SwarmArtifactHunkDependencyComponent
import com.swarmeditor.common.model.SwarmArtifactHunkDependencyKind
import com.swarmeditor.common.model.SwarmArtifactRiskLevel
import com.swarmeditor.common.model.SwarmArtifactRiskReason
import java.security.MessageDigest

internal object SwarmArtifactRiskAnalyzer {
    fun analyze(unifiedDiff: String): List<SwarmArtifactDiffHunk> {
        if (unifiedDiff.isBlank()) return emptyList()

        val hunks = mutableListOf<SwarmArtifactDiffHunk>()
        var currentPath = "unknown"
        var currentHeader: String? = null
        var currentLines = mutableListOf<String>()
        var metadataLines = mutableListOf<String>()
        var currentOperation = SwarmArtifactFileOperation.MODIFIED
        var ordinal = 0

        fun flushHunk() {
            val header = currentHeader ?: return
            val lines = currentLines.toList()
            hunks += createHunk(currentPath, header, lines, currentOperation, ordinal++)
            currentHeader = null
            currentLines = mutableListOf()
        }

        fun flushMetadata() {
            if (metadataLines.isEmpty()) return
            hunks += createHunk(
                currentPath,
                "文件元数据变更",
                metadataLines.toList(),
                currentOperation,
                ordinal++,
            )
            metadataLines = mutableListOf()
        }

        unifiedDiff.lineSequence().forEach { line ->
            when {
                line.startsWith("diff --git ") -> {
                    flushHunk()
                    flushMetadata()
                    currentPath = parseDiffPath(line) ?: currentPath
                    currentOperation = SwarmArtifactFileOperation.MODIFIED
                    metadataLines += line
                }
                line.startsWith("new file mode ") -> {
                    currentOperation = SwarmArtifactFileOperation.ADDED
                    metadataLines += line
                }
                line.startsWith("deleted file mode ") -> {
                    currentOperation = SwarmArtifactFileOperation.DELETED
                    metadataLines += line
                }
                line.startsWith("rename from ") || line.startsWith("rename to ") -> {
                    currentOperation = SwarmArtifactFileOperation.RENAMED
                    metadataLines += line
                }
                line.startsWith("Binary files ") || line == "GIT binary patch" -> {
                    currentOperation = SwarmArtifactFileOperation.BINARY
                    if (currentHeader == null) metadataLines += line else currentLines += line
                }
                line.startsWith("+++ ") -> {
                    currentPath = parseMarkerPath(line) ?: currentPath
                    if (currentHeader == null) metadataLines += line else currentLines += line
                }
                line.startsWith("@@") -> {
                    flushHunk()
                    metadataLines.clear()
                    currentHeader = line
                    currentLines += line
                }
                currentHeader != null -> currentLines += line
                else -> metadataLines += line
            }
        }
        flushHunk()
        flushMetadata()
        return hunks
    }

    fun dependencies(hunks: List<SwarmArtifactDiffHunk>): List<SwarmArtifactHunkDependency> {
        if (hunks.size < 2) return emptyList()
        val dependencies = linkedMapOf<String, SwarmArtifactHunkDependency>()

        fun add(
            prerequisite: SwarmArtifactDiffHunk,
            dependent: SwarmArtifactDiffHunk,
            kind: SwarmArtifactHunkDependencyKind,
            symbol: String? = null,
        ) {
            if (prerequisite.id == dependent.id) return
            val identity = "${prerequisite.id}\u0000${dependent.id}\u0000${kind.name}\u0000${symbol.orEmpty()}"
            val dependency = SwarmArtifactHunkDependency(
                id = "hdep-${sha256(identity).take(20)}",
                prerequisiteHunkId = prerequisite.id,
                dependentHunkId = dependent.id,
                kind = kind,
                symbol = symbol,
            )
            dependencies.putIfAbsent(dependency.id, dependency)
        }

        hunks.groupBy { it.path }.values.forEach { fileHunks ->
            if (fileHunks.any { it.fileOperation != SwarmArtifactFileOperation.MODIFIED }) {
                val lifecycleAnchor = fileHunks.first()
                fileHunks.drop(1).forEach { hunk ->
                    add(lifecycleAnchor, hunk, SwarmArtifactHunkDependencyKind.FILE_LIFECYCLE)
                    add(hunk, lifecycleAnchor, SwarmArtifactHunkDependencyKind.FILE_LIFECYCLE)
                }
            }
            fileHunks.zipWithNext().forEach { (first, second) ->
                if (rangesOverlap(first, second)) {
                    add(first, second, SwarmArtifactHunkDependencyKind.RANGE_OVERLAP)
                }
            }
        }

        val declarations = hunks.flatMap { hunk ->
            declaredSymbols(hunk).map { symbol -> symbol to hunk }
        }.groupBy({ it.first }, { it.second })
        hunks.forEach { dependent ->
            val referenced = referencedSymbols(dependent)
            referenced.forEach { symbol ->
                declarations[symbol].orEmpty().forEach { prerequisite ->
                    add(prerequisite, dependent, SwarmArtifactHunkDependencyKind.SYMBOL_REFERENCE, symbol)
                }
            }
        }
        return dependencies.values.toList()
    }

    fun dependencyComponents(
        hunks: List<SwarmArtifactDiffHunk>,
        dependencies: List<SwarmArtifactHunkDependency>,
    ): List<SwarmArtifactHunkDependencyComponent> {
        if (hunks.isEmpty()) return emptyList()
        val orderByHunkId = hunks.mapIndexed { index, hunk -> hunk.id to index }.toMap()
        val hunkIds = hunks.map { it.id }
        val outgoing = hunkIds.associateWith { mutableListOf<String>() }
        val incoming = hunkIds.associateWith { mutableListOf<String>() }
        dependencies.forEach { dependency ->
            if (dependency.prerequisiteHunkId in orderByHunkId && dependency.dependentHunkId in orderByHunkId) {
                outgoing.getValue(dependency.prerequisiteHunkId) += dependency.dependentHunkId
                incoming.getValue(dependency.dependentHunkId) += dependency.prerequisiteHunkId
            }
        }
        outgoing.values.forEach { adjacent -> adjacent.sortBy(orderByHunkId::getValue) }
        incoming.values.forEach { adjacent -> adjacent.sortBy(orderByHunkId::getValue) }

        val finishOrder = mutableListOf<String>()
        val visited = mutableSetOf<String>()
        hunkIds.forEach { start ->
            if (start in visited) return@forEach
            val pending = ArrayDeque<Pair<String, Boolean>>()
            pending.addLast(start to false)
            while (pending.isNotEmpty()) {
                val (hunkId, expanded) = pending.removeLast()
                if (expanded) {
                    finishOrder += hunkId
                } else if (visited.add(hunkId)) {
                    pending.addLast(hunkId to true)
                    outgoing.getValue(hunkId).asReversed().forEach { adjacent ->
                        if (adjacent !in visited) pending.addLast(adjacent to false)
                    }
                }
            }
        }

        val assigned = mutableSetOf<String>()
        val componentMembers = mutableListOf<List<String>>()
        finishOrder.asReversed().forEach { start ->
            if (!assigned.add(start)) return@forEach
            val members = mutableListOf<String>()
            val pending = ArrayDeque<String>()
            pending.addLast(start)
            while (pending.isNotEmpty()) {
                val hunkId = pending.removeLast()
                members += hunkId
                incoming.getValue(hunkId).asReversed().forEach { adjacent ->
                    if (assigned.add(adjacent)) pending.addLast(adjacent)
                }
            }
            componentMembers += members.sortedBy(orderByHunkId::getValue)
        }
        componentMembers.sortBy { members -> orderByHunkId.getValue(members.first()) }

        val componentIds = componentMembers.map { members ->
            "hcomp-${sha256(members.joinToString("\u0000")).take(20)}"
        }
        val componentIdByHunk = buildMap {
            componentMembers.forEachIndexed { componentIndex, members ->
                members.forEach { hunkId -> put(hunkId, componentIds[componentIndex]) }
            }
        }
        val componentOrder = componentIds.withIndex().associate { (index, id) -> id to index }
        val prerequisitesByComponent = componentIds.associateWith { linkedSetOf<String>() }
        dependencies.forEach { dependency ->
            val prerequisiteComponentId = componentIdByHunk[dependency.prerequisiteHunkId] ?: return@forEach
            val dependentComponentId = componentIdByHunk[dependency.dependentHunkId] ?: return@forEach
            if (prerequisiteComponentId != dependentComponentId) {
                prerequisitesByComponent.getValue(dependentComponentId) += prerequisiteComponentId
            }
        }
        return componentMembers.mapIndexed { index, members ->
            SwarmArtifactHunkDependencyComponent(
                id = componentIds[index],
                hunkIds = members,
                prerequisiteComponentIds = prerequisitesByComponent.getValue(componentIds[index])
                    .sortedBy(componentOrder::getValue),
                cyclic = members.size > 1,
            )
        }
    }

    fun prerequisiteClosure(
        dependencies: List<SwarmArtifactHunkDependency>,
        targetHunkIds: Collection<String>,
    ): List<String> {
        if (targetHunkIds.isEmpty() || dependencies.isEmpty()) return emptyList()
        val prerequisitesByDependent = dependencies.groupBy(
            keySelector = { it.dependentHunkId },
            valueTransform = { it.prerequisiteHunkId },
        )
        val targets = targetHunkIds.toSet()
        val context = linkedSetOf<String>()
        val pending = ArrayDeque(targetHunkIds)
        while (pending.isNotEmpty()) {
            prerequisitesByDependent[pending.removeFirst()].orEmpty().forEach { prerequisite ->
                if (prerequisite !in targets && context.add(prerequisite)) pending.addLast(prerequisite)
            }
        }
        return context.toList()
    }

    private fun createHunk(
        path: String,
        header: String,
        lines: List<String>,
        fileOperation: SwarmArtifactFileOperation,
        ordinal: Int,
    ): SwarmArtifactDiffHunk {
        val addedLineCount = lines.count { it.startsWith("+") && !it.startsWith("+++") }
        val removedLineCount = lines.count { it.startsWith("-") && !it.startsWith("---") }
        val range = parseHunkRange(header)
        val reasons = classify(path, lines, addedLineCount + removedLineCount)
        val riskLevel = when {
            reasons.any { it in criticalReasons } -> SwarmArtifactRiskLevel.HIGH
            reasons.size >= 2 -> SwarmArtifactRiskLevel.HIGH
            reasons.isNotEmpty() -> SwarmArtifactRiskLevel.MEDIUM
            else -> SwarmArtifactRiskLevel.LOW
        }
        val diff = lines.joinToString("\n").let { if (it.endsWith('\n')) it else "$it\n" }
        val identity = "$path\u0000$header\u0000$ordinal\u0000$diff"
        return SwarmArtifactDiffHunk(
            id = "hunk-${sha256(identity).take(20)}",
            path = path,
            header = header,
            diff = diff,
            addedLineCount = addedLineCount,
            removedLineCount = removedLineCount,
            riskLevel = riskLevel,
            riskReasons = reasons.toList(),
            oldStartLine = range?.oldStart,
            oldLineCount = range?.oldCount,
            newStartLine = range?.newStart,
            newLineCount = range?.newCount,
            fileOperation = fileOperation,
        )
    }

    private fun parseHunkRange(header: String): HunkRange? {
        val match = hunkHeader.find(header) ?: return null
        return HunkRange(
            oldStart = match.groupValues[1].toInt(),
            oldCount = match.groupValues[2].takeIf(String::isNotEmpty)?.toInt() ?: 1,
            newStart = match.groupValues[3].toInt(),
            newCount = match.groupValues[4].takeIf(String::isNotEmpty)?.toInt() ?: 1,
        )
    }

    private fun rangesOverlap(first: SwarmArtifactDiffHunk, second: SwarmArtifactDiffHunk): Boolean {
        if (first.path != second.path) return false
        return intervalsOverlap(first.oldStartLine, first.oldLineCount, second.oldStartLine, second.oldLineCount) ||
            intervalsOverlap(first.newStartLine, first.newLineCount, second.newStartLine, second.newLineCount)
    }

    private fun intervalsOverlap(firstStart: Int?, firstCount: Int?, secondStart: Int?, secondCount: Int?): Boolean {
        if (firstStart == null || firstCount == null || secondStart == null || secondCount == null) return false
        val firstEnd = firstStart + firstCount.coerceAtLeast(1)
        val secondEnd = secondStart + secondCount.coerceAtLeast(1)
        return firstStart < secondEnd && secondStart < firstEnd
    }

    private fun declaredSymbols(hunk: SwarmArtifactDiffHunk): Set<String> = declarationPattern
        .findAll(changedSource(hunk))
        .map { it.groupValues[1] }
        .filter(::isUsefulSymbol)
        .toSet()

    private fun referencedSymbols(hunk: SwarmArtifactDiffHunk): Set<String> {
        val declared = declaredSymbols(hunk)
        return identifierPattern.findAll(changedSource(hunk))
            .map(MatchResult::value)
            .filter(::isUsefulSymbol)
            .filterNot(declared::contains)
            .toSet()
    }

    private fun changedSource(hunk: SwarmArtifactDiffHunk): String = hunk.diff.lineSequence()
        .filter { line ->
            (line.startsWith("+") && !line.startsWith("+++")) ||
                (line.startsWith("-") && !line.startsWith("---"))
        }
        .joinToString("\n") { it.drop(1) }

    private fun isUsefulSymbol(symbol: String): Boolean =
        symbol.length >= 3 && symbol.lowercase() !in ignoredSymbols

    private fun classify(
        path: String,
        hunkLines: List<String>,
        changedLineCount: Int,
    ): LinkedHashSet<SwarmArtifactRiskReason> {
        val normalizedPath = path.lowercase()
        val changedText = hunkLines.joinToString("\n").lowercase()
        val reasons = linkedSetOf<SwarmArtifactRiskReason>()

        if (authorizationPath.containsMatchIn(normalizedPath) || authorizationContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.AUTHORIZATION
        }
        if (secretContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.SECRET_HANDLING
        }
        if (processContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.PROCESS_OR_TOOL_EXECUTION
        }
        if (persistencePath.containsMatchIn(normalizedPath) || persistenceContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.PERSISTENCE_OR_MIGRATION
        }
        if (publicContractPath.containsMatchIn(normalizedPath) || publicContractContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.PUBLIC_CONTRACT
        }
        if (buildPath.containsMatchIn(normalizedPath)) {
            reasons += SwarmArtifactRiskReason.BUILD_OR_DEPENDENCY
        }
        if (sandboxPath.containsMatchIn(normalizedPath) || sandboxContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.SANDBOX_BOUNDARY
        }
        if (binaryContent.containsMatchIn(changedText)) {
            reasons += SwarmArtifactRiskReason.BINARY_OR_GENERATED
        }
        if (changedLineCount >= LARGE_CHANGE_LINE_COUNT) {
            reasons += SwarmArtifactRiskReason.LARGE_CHANGE
        }
        return reasons
    }

    private fun parseDiffPath(line: String): String? =
        Regex("^diff --git a/(.+) b/(.+)$").matchEntire(line)?.groupValues?.get(2)

    private fun parseMarkerPath(line: String): String? = line.removePrefix("+++ ")
        .takeUnless { it == "/dev/null" }
        ?.removePrefix("b/")

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

    private val criticalReasons = setOf(
        SwarmArtifactRiskReason.AUTHORIZATION,
        SwarmArtifactRiskReason.SECRET_HANDLING,
        SwarmArtifactRiskReason.PROCESS_OR_TOOL_EXECUTION,
        SwarmArtifactRiskReason.PERSISTENCE_OR_MIGRATION,
        SwarmArtifactRiskReason.PUBLIC_CONTRACT,
        SwarmArtifactRiskReason.BUILD_OR_DEPENDENCY,
        SwarmArtifactRiskReason.SANDBOX_BOUNDARY,
        SwarmArtifactRiskReason.BINARY_OR_GENERATED,
    )
    private val authorizationPath = Regex("(^|/)(auth|authorization|permission|policy|acl)(/|\\.|$)")
    private val authorizationContent = Regex("\\b(authoriz|permission|accesscontrol|principal|role|capabilit)")
    private val secretContent = Regex("\\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\\b")
    private val processContent = Regex("\\b(processbuilder|runtime\\.getruntime|exec\\s*\\(|commandrequest|shell|spawn|fork)\\b")
    private val persistencePath = Regex("(^|/)(store|storage|database|db|migration|migrations|schema|persistence)(/|\\.|$)")
    private val persistenceContent = Regex("\\b(migration|transaction|database|serialize|deserialize|atomic move|write failure|rollback)\\b")
    private val publicContractPath = Regex("(^|/)common/src/|(^|/)(api|model|protocol|rpc)(/|\\.|$)")
    private val publicContractContent = Regex("(^|\\n)[+-]\\s*(public\\s+)?(data\\s+class|class|interface|enum\\s+class|fun)\\s+|@serializable")
    private val buildPath = Regex("(^|/)(build\\.gradle(\\.kts)?|settings\\.gradle(\\.kts)?|gradle\\.properties|libs\\.versions\\.toml|package(-lock)?\\.json|pom\\.xml|cargo\\.(toml|lock))$")
    private val sandboxPath = Regex("(^|/)(sandbox|bubblewrap|wasm|executor|verifier)(/|\\.|$)")
    private val sandboxContent = Regex("\\b(bwrap|bubblewrap|sandbox|wasmtime|capability|seccomp|namespace)\\b")
    private val binaryContent = Regex("binary files .* differ|git binary patch")
    private val hunkHeader = Regex("^@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@")
    private val declarationPattern = Regex(
        "(?:data\\s+class|enum\\s+class|class|interface|object|fun|function|def|type)\\s+([A-Za-z_][A-Za-z0-9_]*)"
    )
    private val identifierPattern = Regex("[A-Za-z_][A-Za-z0-9_]*")
    private val ignoredSymbols = setOf(
        "class", "interface", "object", "function", "return", "value", "result", "string", "boolean",
        "number", "public", "private", "internal", "protected", "override", "suspend", "main", "this",
    )
    private const val LARGE_CHANGE_LINE_COUNT = 120

    private data class HunkRange(
        val oldStart: Int,
        val oldCount: Int,
        val newStart: Int,
        val newCount: Int,
    )
}
