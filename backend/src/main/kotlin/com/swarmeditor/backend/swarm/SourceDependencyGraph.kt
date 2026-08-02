package com.swarmeditor.backend.swarm

import java.nio.file.Path
import kotlin.io.path.Path
import kotlin.io.path.invariantSeparatorsPathString

data class SourceDependencyCluster(
    val id: String,
    val members: List<String>,
    val incomingClusterIds: Set<String>,
    val outgoingClusterIds: Set<String>,
)

data class SourceDependencyAnalysis(
    val dependencies: Map<String, Set<String>>,
    val clusters: List<SourceDependencyCluster>,
)

object SourceDependencyGraph {
    fun analyze(files: Map<String, String>): SourceDependencyAnalysis {
        val normalizedFiles = files.entries.associate { normalizePath(it.key) to it.value }
        val aliases = buildAliases(normalizedFiles)
        val dependencies = normalizedFiles.mapValues { (path, content) ->
            resolveDependencies(path, content, normalizedFiles.keys, aliases)
        }.toSortedMap()
        val components = stronglyConnectedComponents(dependencies)
        val clusterIdByPath = buildMap {
            components.forEachIndexed { index, members -> members.forEach { put(it, "scc-${index + 1}") } }
        }
        val clusters = components.mapIndexed { index, members ->
            val id = "scc-${index + 1}"
            val outgoing = members.asSequence()
                .flatMap { dependencies[it].orEmpty().asSequence() }
                .mapNotNull(clusterIdByPath::get)
                .filterNot(id::equals)
                .toSortedSet()
            val incoming = dependencies.asSequence()
                .filter { (source, targets) -> clusterIdByPath[source] != id && targets.any { clusterIdByPath[it] == id } }
                .mapNotNull { (source, _) -> clusterIdByPath[source] }
                .toSortedSet()
            SourceDependencyCluster(
                id = id,
                members = members,
                incomingClusterIds = incoming,
                outgoingClusterIds = outgoing,
            )
        }
        return SourceDependencyAnalysis(dependencies = dependencies, clusters = clusters)
    }

    private fun buildAliases(files: Map<String, String>): Map<String, Set<String>> {
        val aliases = mutableMapOf<String, MutableSet<String>>()
        files.forEach { (path, content) ->
            val withoutExtension = path.substringBeforeLast('.')
            val simpleName = withoutExtension.substringAfterLast('/')
            val directory = withoutExtension.substringBeforeLast('/', "")
            listOf(withoutExtension, withoutExtension.replace('/', '.'), simpleName).forEach { alias ->
                aliases.getOrPut(alias) { linkedSetOf() } += path
            }
            if (directory.isNotEmpty()) {
                aliases.getOrPut("${directory.replace('/', '.')}.$simpleName") { linkedSetOf() } += path
            }
            val packageName = PACKAGE_REGEX.find(content)?.groupValues?.get(1)
            if (packageName != null) {
                aliases.getOrPut("$packageName.$simpleName") { linkedSetOf() } += path
                TYPE_DECLARATION_REGEX.findAll(content).forEach { declaration ->
                    aliases.getOrPut("$packageName.${declaration.groupValues[1]}") { linkedSetOf() } += path
                }
            }
        }
        return aliases.mapValues { it.value.toSet() }
    }

    private fun resolveDependencies(
        path: String,
        content: String,
        knownPaths: Set<String>,
        aliases: Map<String, Set<String>>,
    ): Set<String> {
        val resolved = linkedSetOf<String>()
        JVM_IMPORT_REGEX.findAll(content).forEach { match ->
            val imported = match.groupValues[1]
            if (imported.endsWith(".*")) {
                val prefix = imported.removeSuffix("*")
                aliases.asSequence()
                    .filter { (alias) -> alias.startsWith(prefix) }
                    .flatMap { it.value.asSequence() }
                    .filterNot(path::equals)
                    .forEach(resolved::add)
            } else {
                aliases[imported].orEmpty().filterNot(path::equals).forEach(resolved::add)
            }
        }
        RELATIVE_IMPORT_REGEX.findAll(content).forEach { match ->
            resolveRelativeImport(path, match.groupValues[1], knownPaths)?.let(resolved::add)
        }
        return resolved.toSortedSet()
    }

    private fun resolveRelativeImport(sourcePath: String, imported: String, knownPaths: Set<String>): String? {
        if (!imported.startsWith('.')) return null
        val sourceParent = Path(sourcePath).parent ?: Path("")
        val candidate = sourceParent.resolve(imported).normalize().invariantSeparatorsPathString
        val candidates = sequenceOf(
            candidate,
            "$candidate.kt",
            "$candidate.kts",
            "$candidate.java",
            "$candidate.ts",
            "$candidate.tsx",
            "$candidate.js",
            "$candidate.jsx",
            "$candidate.py",
            "$candidate.rs",
            "$candidate/index.ts",
            "$candidate/index.tsx",
            "$candidate/index.js",
        )
        return candidates.firstOrNull(knownPaths::contains)
    }

    private fun stronglyConnectedComponents(graph: Map<String, Set<String>>): List<List<String>> {
        var nextIndex = 0
        val indexes = mutableMapOf<String, Int>()
        val lowLinks = mutableMapOf<String, Int>()
        val stack = ArrayDeque<String>()
        val onStack = mutableSetOf<String>()
        val components = mutableListOf<List<String>>()

        fun visit(node: String) {
            indexes[node] = nextIndex
            lowLinks[node] = nextIndex
            nextIndex += 1
            stack.addLast(node)
            onStack += node
            graph[node].orEmpty().sorted().forEach { target ->
                if (target !in graph) return@forEach
                if (target !in indexes) {
                    visit(target)
                    lowLinks[node] = minOf(lowLinks.getValue(node), lowLinks.getValue(target))
                } else if (target in onStack) {
                    lowLinks[node] = minOf(lowLinks.getValue(node), indexes.getValue(target))
                }
            }
            if (lowLinks.getValue(node) == indexes.getValue(node)) {
                val component = mutableListOf<String>()
                while (true) {
                    val member = stack.removeLast()
                    onStack -= member
                    component += member
                    if (member == node) break
                }
                components += component.sorted()
            }
        }

        graph.keys.sorted().forEach { if (it !in indexes) visit(it) }
        return components.sortedBy { it.first() }
    }

    private fun normalizePath(path: String): String = path.replace('\\', '/').removePrefix("./")
}

private val JVM_IMPORT_REGEX = Regex("(?m)^\\s*import\\s+([A-Za-z_][A-Za-z0-9_.]*(?:\\.\\*)?)")
private val RELATIVE_IMPORT_REGEX = Regex("(?:from\\s+|require\\s*\\()?['\"](\\.{1,2}/[^'\"]+)['\"]")
private val PACKAGE_REGEX = Regex("(?m)^\\s*package\\s+([A-Za-z_][A-Za-z0-9_.]*)")
private val TYPE_DECLARATION_REGEX = Regex("\\b(?:class|interface|object|enum\\s+class|data\\s+class)\\s+([A-Za-z_][A-Za-z0-9_]*)")
