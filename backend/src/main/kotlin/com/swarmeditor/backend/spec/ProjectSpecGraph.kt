package com.swarmeditor.backend.spec

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class SpecDiagnosticSeverity {
    ERROR,
    WARNING,
}

data class SpecDiagnostic(
    val severity: SpecDiagnosticSeverity,
    val path: String,
    val message: String,
    val line: Int? = null,
)

data class ProjectSpecNode(
    val id: String,
    val type: String,
    val title: String,
    val path: String,
    val parent: String? = null,
    val dependsOn: List<String> = emptyList(),
    val references: List<String> = emptyList(),
    val implements: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
)

data class ProjectSpecGraph(
    val nodes: List<ProjectSpecNode>,
    val diagnostics: List<SpecDiagnostic>,
) {
    val nodesById: Map<String, ProjectSpecNode> by lazy { nodes.associateBy(ProjectSpecNode::id) }
}

class ProjectSpecGraphScanner(
    private val maxFileBytes: Long = DEFAULT_MAX_FILE_BYTES,
) {
    init {
        require(maxFileBytes > 0) { "maxFileBytes must be positive" }
    }

    suspend fun scan(projectRoot: File): ProjectSpecGraph = withContext(Dispatchers.IO) {
        val root = projectRoot.toPath().toRealPath()
        val parsed = mutableListOf<ParsedSpec>()
        val diagnostics = mutableListOf<SpecDiagnostic>()
        walk(root, root, parsed, diagnostics)
        ProjectSpecGraphValidator.validate(parsed, diagnostics)
    }

    private fun walk(
        directory: Path,
        root: Path,
        parsed: MutableList<ParsedSpec>,
        diagnostics: MutableList<SpecDiagnostic>,
    ) {
        Files.list(directory).use { entries ->
            entries.sorted().forEach { entry ->
                if (!isInsideRoot(entry, root) || Files.isSymbolicLink(entry)) return@forEach
                if (Files.isDirectory(entry)) {
                    if (entry.fileName.toString() !in EXCLUDED_DIRECTORIES) {
                        walk(entry, root, parsed, diagnostics)
                    }
                    return@forEach
                }
                if (!Files.isRegularFile(entry) || Files.size(entry) > maxFileBytes) return@forEach
                val relativePath = root.relativize(entry).toString().replace(File.separatorChar, '/')
                val source = try {
                    Files.readString(entry)
                } catch (error: Exception) {
                    diagnostics += SpecDiagnostic(
                        severity = SpecDiagnosticSeverity.WARNING,
                        path = relativePath,
                        message = "Unable to read candidate spec: ${error.message ?: error::class.simpleName}",
                    )
                    return@forEach
                }
                when (val result = ProjectSpecFrontmatter.parse(relativePath, source)) {
                    is SpecParseResult.NotASpec -> Unit
                    is SpecParseResult.Invalid -> diagnostics += result.diagnostic
                    is SpecParseResult.Valid -> parsed += result.spec
                }
            }
        }
    }

    private fun isInsideRoot(path: Path, root: Path): Boolean =
        path.toAbsolutePath().normalize().startsWith(root)

    private companion object {
        const val DEFAULT_MAX_FILE_BYTES = 2L * 1024 * 1024
        val EXCLUDED_DIRECTORIES = setOf(
            ".git",
            ".gradle",
            ".idea",
            "build",
            "dist",
            "node_modules",
            "out",
            "target",
        )
    }
}

private data class ParsedSpec(
    val id: String,
    val type: String,
    val title: String,
    val path: String,
    val parent: String?,
    val dependsOn: List<String>,
    val references: List<String>,
    val implements: List<String>,
    val tags: List<String>,
)

private sealed interface SpecParseResult {
    data object NotASpec : SpecParseResult
    data class Invalid(val diagnostic: SpecDiagnostic) : SpecParseResult
    data class Valid(val spec: ParsedSpec) : SpecParseResult
}

private object ProjectSpecFrontmatter {
    fun parse(path: String, source: String): SpecParseResult {
        val lines = source.lines()
        if (lines.firstOrNull()?.trim() != "---") return SpecParseResult.NotASpec
        val end = lines.indexOfFirstAfter(1) { it.trim() == "---" }
        if (end < 0) {
            return SpecParseResult.Invalid(
                SpecDiagnostic(SpecDiagnosticSeverity.ERROR, path, "Spec frontmatter is not closed", 1)
            )
        }
        val fields = linkedMapOf<String, String>()
        lines.subList(1, end).forEachIndexed { index, rawLine ->
            val line = rawLine.trim()
            if (line.isEmpty() || line.startsWith("#")) return@forEachIndexed
            val separator = line.indexOf(':')
            if (separator <= 0) {
                return SpecParseResult.Invalid(
                    SpecDiagnostic(
                        SpecDiagnosticSeverity.ERROR,
                        path,
                        "Invalid frontmatter entry: $rawLine",
                        index + 2,
                    )
                )
            }
            val key = line.substring(0, separator).trim()
            val value = line.substring(separator + 1).trim()
            if (key.isBlank()) {
                return SpecParseResult.Invalid(
                    SpecDiagnostic(SpecDiagnosticSeverity.ERROR, path, "Frontmatter key cannot be blank", index + 2)
                )
            }
            fields[key] = value
        }

        val id = fields.scalar("id")
        val type = fields.scalar("type")
        if (id.isNullOrBlank() || type.isNullOrBlank()) {
            return SpecParseResult.Invalid(
                SpecDiagnostic(SpecDiagnosticSeverity.ERROR, path, "A spec requires non-blank id and type", 1)
            )
        }
        return SpecParseResult.Valid(
            ParsedSpec(
                id = id,
                type = type,
                title = fields.scalar("title") ?: id,
                path = path,
                parent = fields.scalar("parent"),
                dependsOn = fields.list("depends-on"),
                references = fields.list("references"),
                implements = fields.list("implements"),
                tags = fields.list("tags"),
            )
        )
    }

    private fun Map<String, String>.scalar(key: String): String? = get(key)
        ?.trim()
        ?.removeSurrounding("\"")
        ?.removeSurrounding("'")
        ?.takeIf(String::isNotBlank)

    private fun Map<String, String>.list(key: String): List<String> {
        val raw = get(key)?.trim().orEmpty()
        if (raw.isBlank() || raw == "[]") return emptyList()
        val value = raw.removePrefix("[").removeSuffix("]")
        return value.split(',')
            .map { it.trim().removeSurrounding("\"").removeSurrounding("'") }
            .filter(String::isNotBlank)
    }

    private fun <T> List<T>.indexOfFirstAfter(start: Int, predicate: (T) -> Boolean): Int {
        for (index in start until size) {
            if (predicate(this[index])) return index
        }
        return -1
    }
}

private object ProjectSpecGraphValidator {
    fun validate(parsed: List<ParsedSpec>, initialDiagnostics: List<SpecDiagnostic>): ProjectSpecGraph {
        val diagnostics = initialDiagnostics.toMutableList()
        val byId = linkedMapOf<String, ParsedSpec>()
        parsed.sortedBy(ParsedSpec::path).forEach { spec ->
            val previous = byId.putIfAbsent(spec.id, spec)
            if (previous != null) {
                diagnostics += SpecDiagnostic(
                    severity = SpecDiagnosticSeverity.ERROR,
                    path = spec.path,
                    message = "Duplicate spec id '${spec.id}'; first declared in ${previous.path}",
                )
            }
        }

        val nodes = byId.values.map { spec ->
            ProjectSpecNode(
                id = spec.id,
                type = spec.type,
                title = spec.title,
                path = spec.path,
                parent = spec.parent,
                dependsOn = spec.dependsOn,
                references = spec.references,
                implements = spec.implements,
                tags = spec.tags,
            )
        }
        nodes.forEach { node ->
            node.parent?.let { parent ->
                if (parent !in byId) diagnostics += missingReference(node, "parent", parent)
            }
            node.dependsOn.forEach { dependency ->
                if (dependency !in byId) diagnostics += missingReference(node, "depends-on", dependency)
            }
            node.references.forEach { reference ->
                if (reference !in byId) diagnostics += missingReference(node, "references", reference)
            }
            node.implements.forEach { implementation ->
                if (implementation !in byId) diagnostics += missingReference(node, "implements", implementation)
            }
        }
        detectParentCycles(nodes, diagnostics)
        return ProjectSpecGraph(nodes, diagnostics.sortedWith(compareBy(SpecDiagnostic::path, SpecDiagnostic::line, SpecDiagnostic::message)))
    }

    private fun missingReference(node: ProjectSpecNode, field: String, target: String) = SpecDiagnostic(
        severity = SpecDiagnosticSeverity.ERROR,
        path = node.path,
        message = "Unknown $field target '$target'",
    )

    private fun detectParentCycles(nodes: List<ProjectSpecNode>, diagnostics: MutableList<SpecDiagnostic>) {
        val parents = nodes.associate { it.id to it.parent }
        val visited = mutableSetOf<String>()
        val active = mutableSetOf<String>()
        fun visit(id: String) {
            if (!visited.add(id)) return
            active += id
            val parent = parents[id]
            if (parent != null && parent in active) {
                val node = nodes.first { it.id == id }
                diagnostics += SpecDiagnostic(
                    severity = SpecDiagnosticSeverity.ERROR,
                    path = node.path,
                    message = "Parent cycle detected through '$parent'",
                )
            } else if (parent != null && parent in parents) {
                visit(parent)
            }
            active -= id
        }
        nodes.forEach { visit(it.id) }
    }
}
