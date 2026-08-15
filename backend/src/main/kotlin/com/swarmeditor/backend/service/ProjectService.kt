package com.swarmeditor.backend.service

import com.swarmeditor.common.model.ContextEvidence
import com.swarmeditor.common.model.ContextEvidenceBundle
import com.swarmeditor.common.model.ContextEvidenceKind
import com.swarmeditor.common.model.ContextEvidenceSource
import com.swarmeditor.backend.lsp.LspHighlightResult
import com.swarmeditor.backend.lsp.LspDocumentInsight
import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.lsp.SourcePositionInsight
import com.swarmeditor.backend.lsp.SourceSemanticHighlighter
import com.swarmeditor.backend.lsp.WorkspaceSourceSymbol
import com.swarmeditor.backend.spec.ProjectSpecGraph
import com.swarmeditor.backend.spec.ProjectSpecGraphScanner
import com.swarmeditor.backend.storage.atomicWriteText
import java.io.File
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.Path
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.file.LinkOption
import java.security.MessageDigest
import kotlin.io.path.fileSize
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

internal const val MAX_PROJECT_FILE_BYTES = 256 * 1024

class ProjectService(
    private val projectDir: File,
    private val semanticHighlighter: SourceSemanticHighlighter? = null,
    private val specGraphScanner: ProjectSpecGraphScanner = ProjectSpecGraphScanner(),
    private val projectDirProvider: () -> File = { projectDir },
) {
    val projectPath: String
        get() = currentProjectDir().absolutePath

    data class FilePreview(
        val path: String,
        val content: String,
        val sizeBytes: Long,
        val truncated: Boolean,
        val binary: Boolean,
    )

    data class FileNode(
        val name: String,
        val path: String,
        val isDirectory: Boolean,
        val children: List<FileNode> = emptyList(),
        val changeStatus: String? = null,
    )

    data class SearchMatch(
        val path: String,
        val line: Int,
        val startCharacter: Int,
        val endCharacter: Int,
        val lineText: String,
    )

    data class SearchResult(
        val query: String,
        val matches: List<SearchMatch>,
        val filesSearched: Int,
        val truncated: Boolean,
    )

    fun getTree(): FileNode {
        val root = currentProjectDir().toPath().toRealPath()
        return walkDir(root.toFile(), root, depth = 0)
    }

    suspend fun getSpecGraph(): ProjectSpecGraph = specGraphScanner.scan(currentProjectDir())

    fun readFile(relativePath: String): FilePreview {
        val root = currentProjectDir().toPath().toRealPath()
        val resolved = root.resolve(relativePath).normalize().toRealPath()
        require(resolved.startsWith(root)) { "File is outside the project: $relativePath" }
        require(Files.isRegularFile(resolved)) { "Not a regular file: $relativePath" }

        val bytes = Files.newInputStream(resolved).use { input -> input.readNBytes(MAX_PROJECT_FILE_BYTES + 1) }
        val truncated = bytes.size > MAX_PROJECT_FILE_BYTES
        val previewBytes = if (truncated) bytes.copyOf(MAX_PROJECT_FILE_BYTES) else bytes
        val decoded = decodeUtf8Text(previewBytes, allowIncompleteTail = truncated)
        return FilePreview(
            path = relativePath,
            content = decoded.orEmpty(),
            sizeBytes = resolved.fileSize(),
            truncated = truncated,
            binary = decoded == null,
        )
    }

    fun writeFile(relativePath: String, content: String): FilePreview {
        val root = currentProjectDir().toPath().toRealPath()
        val resolved = root.resolve(relativePath).normalize().toRealPath()
        require(resolved.startsWith(root)) { "File is outside the project: $relativePath" }
        require(Files.isRegularFile(resolved)) { "Not a regular file: $relativePath" }
        require(resolved.fileSize() <= MAX_PROJECT_FILE_BYTES) {
            "Truncated files cannot be edited in the built-in editor: $relativePath"
        }
        require(decodeUtf8Text(Files.readAllBytes(resolved), allowIncompleteTail = false) != null) {
            "File is not valid UTF-8 text: $relativePath"
        }
        require('\u0000' !in content) { "Text content cannot contain NUL bytes: $relativePath" }
        require(content.toByteArray(Charsets.UTF_8).size <= MAX_PROJECT_FILE_BYTES) {
            "File is too large to edit in the built-in editor: $relativePath"
        }

        resolved.toFile().atomicWriteText(content)
        return readFile(relativePath)
    }

    suspend fun searchText(
        query: String,
        caseSensitive: Boolean = false,
        maxMatches: Int = DEFAULT_MAX_SEARCH_MATCHES,
        pathPrefix: String? = null,
    ): SearchResult {
        require(query.isNotBlank()) { "Search query cannot be blank" }
        require(maxMatches > 0) { "Search result limit must be positive" }

        val root = currentProjectDir().toPath().toRealPath()
        val searchRoot = resolveSearchRoot(root, pathPrefix)
        val matches = mutableListOf<SearchMatch>()
        var filesSearched = 0
        var truncated = false

        suspend fun searchDirectory(directory: Path, depth: Int) {
            currentCoroutineContext().ensureActive()
            if (truncated || depth > MAX_DEPTH) return

            val entries = directory.toFile().listFiles()
                ?.asSequence()
                ?.filter { entry -> isSearchableProjectEntry(entry, root) }
                ?.sortedWith(compareBy({ !it.isDirectory }, { it.name }))
                ?.toList()
                .orEmpty()

            for (entry in entries) {
                currentCoroutineContext().ensureActive()
                if (truncated) return
                val entryPath = entry.toPath()
                when {
                    entry.isDirectory -> searchDirectory(entryPath, depth + 1)
                    !Files.isRegularFile(entryPath, LinkOption.NOFOLLOW_LINKS) -> Unit
                    entryPath.fileSize() > MAX_PROJECT_FILE_BYTES -> Unit
                    else -> {
                        val content = decodeUtf8Text(Files.readAllBytes(entryPath), allowIncompleteTail = false)
                            ?: continue
                        filesSearched += 1
                        val relativePath = projectRelativePath(root, entryPath)
                        for ((lineIndex, lineText) in content.lineSequence().withIndex()) {
                            if (truncated) break
                            var searchFrom = 0
                            while (searchFrom <= lineText.length - query.length) {
                                currentCoroutineContext().ensureActive()
                                val matchStart = lineText.indexOf(query, searchFrom, ignoreCase = !caseSensitive)
                                if (matchStart < 0) break
                                matches += SearchMatch(
                                    path = relativePath,
                                    line = lineIndex,
                                    startCharacter = matchStart,
                                    endCharacter = matchStart + query.length,
                                    lineText = lineText,
                                )
                                if (matches.size >= maxMatches) {
                                    truncated = true
                                    break
                                }
                                searchFrom = matchStart + query.length.coerceAtLeast(1)
                            }
                        }
                    }
                }
            }
        }

        searchDirectory(searchRoot, depth = 0)
        return SearchResult(
            query = query,
            matches = matches,
            filesSearched = filesSearched,
            truncated = truncated,
        )
    }

    suspend fun collectContextEvidence(
        query: String,
        pathPrefix: String? = null,
        maxResults: Int = DEFAULT_MAX_CONTEXT_EVIDENCE,
        maxSearchMatches: Int = DEFAULT_MAX_SEARCH_MATCHES,
        broadRetryBudget: Int = 0,
    ): ContextEvidenceBundle {
        require(query.isNotBlank()) { "Context evidence query cannot be blank" }
        require(maxResults > 0) { "Context evidence limit must be positive" }
        require(maxSearchMatches > 0) { "Context search limit must be positive" }
        require(broadRetryBudget >= 0) { "Broad retry budget cannot be negative" }

        val normalizedPathPrefix = pathPrefix?.trim()?.trim('/')?.takeUnless(String::isBlank)
        val queryFingerprint = contextQueryFingerprint(query, normalizedPathPrefix, maxResults, maxSearchMatches)

        suspend fun collect(pathFilter: String?): EvidenceCollection {
            val search = searchText(
                query = query,
                maxMatches = maxSearchMatches,
                pathPrefix = pathFilter,
            )
            val symbols = searchWorkspaceSymbols(query, maxResults)
                .filter { symbol -> pathMatches(symbol.uri, pathFilter) }
            val graph = getSpecGraph()
            val graphEvidence = buildList {
                graph.nodes
                    .filter { node -> pathMatches(node.path, pathFilter) }
                    .filter { node -> nodeMatches(node, query) }
                    .forEach { node ->
                        add(
                            contextEvidence(
                                kind = ContextEvidenceKind.SPEC_NODE,
                                source = ContextEvidenceSource.SPEC_GRAPH,
                                path = node.path,
                                summary = "${node.type}: ${node.title}",
                                excerpt = node.id,
                                confidence = 0.8,
                                queryFingerprint = queryFingerprint,
                            ),
                        )
                    }
                graph.diagnostics
                    .filter { diagnostic -> pathMatches(diagnostic.path, pathFilter) }
                    .filter { diagnostic -> diagnostic.message.contains(query, ignoreCase = true) }
                    .forEach { diagnostic ->
                        add(
                            contextEvidence(
                                kind = ContextEvidenceKind.SPEC_DIAGNOSTIC,
                                source = ContextEvidenceSource.SPEC_GRAPH,
                                path = diagnostic.path,
                                line = diagnostic.line,
                                summary = diagnostic.message,
                                confidence = 0.4,
                                queryFingerprint = queryFingerprint,
                            ),
                        )
                    }
            }
            return EvidenceCollection(
                evidence = buildList {
                    addAll(
                        search.matches.map { match ->
                            contextEvidence(
                                kind = ContextEvidenceKind.TEXT_MATCH,
                                source = ContextEvidenceSource.PROJECT_SEARCH,
                                path = match.path,
                                line = match.line,
                                startCharacter = match.startCharacter,
                                endCharacter = match.endCharacter,
                                summary = match.lineText,
                                excerpt = match.lineText,
                                confidence = 0.6,
                                truncated = search.truncated,
                                queryFingerprint = queryFingerprint,
                            )
                        },
                    )
                    addAll(
                        symbols.map { symbol ->
                            contextEvidence(
                                kind = ContextEvidenceKind.SOURCE_SYMBOL,
                                source = ContextEvidenceSource.LSP,
                                path = symbol.uri,
                                line = symbol.line,
                                startCharacter = symbol.character,
                                summary = "${symbol.kind}: ${symbol.name}",
                                confidence = 0.9,
                                queryFingerprint = queryFingerprint,
                            )
                        },
                    )
                    addAll(graphEvidence)
                },
                truncated = search.truncated,
            )
        }

        var collection = collect(normalizedPathPrefix)
        var retryCount = 0
        var broadSearchRetried = false
        if (collection.evidence.isEmpty() && normalizedPathPrefix != null && broadRetryBudget > 0) {
            collection = collect(null)
            retryCount = 1
            broadSearchRetried = true
        }

        val evidence = collection.evidence
            .distinctBy(ContextEvidence::id)
            .sortedWith(compareByDescending<ContextEvidence> { it.confidence }.thenBy { it.path.orEmpty() })
        return ContextEvidenceBundle(
            query = query,
            queryFingerprint = queryFingerprint,
            pathPrefix = normalizedPathPrefix,
            evidence = evidence.take(maxResults),
            truncated = collection.truncated || evidence.size > maxResults,
            retryBudget = broadRetryBudget,
            retryCount = retryCount,
            broadSearchRetried = broadSearchRetried,
        )
    }

    suspend fun highlightFile(relativePath: String, content: String): LspHighlightResult? {
        val highlighter = semanticHighlighter ?: return null
        val resolved = resolveProjectFile(relativePath)
        return highlighter.highlight(resolved.toFile(), content)
    }

    suspend fun inspectFile(relativePath: String, content: String): LspDocumentInsight? {
        val highlighter = semanticHighlighter ?: return null
        val resolved = resolveProjectFile(relativePath)
        return if (highlighter is SourceCodeIntelligence) {
            highlighter.inspect(resolved.toFile(), content)
        } else {
            highlighter.highlight(resolved.toFile(), content).let { highlighted ->
                LspDocumentInsight(
                    languageId = highlighted.languageId,
                    serverName = highlighted.serverName,
                    highlights = highlighted.highlights,
                    message = highlighted.message,
                )
            }
        }
    }

    suspend fun inspectPosition(
        relativePath: String,
        content: String,
        line: Int,
        character: Int,
    ): SourcePositionInsight? {
        val intelligence = semanticHighlighter as? SourceCodeIntelligence ?: return null
        val resolved = resolveProjectFile(relativePath)
        return intelligence.inspectPosition(resolved.toFile(), content, line, character)
    }

    suspend fun searchWorkspaceSymbols(query: String, maxResults: Int = 100): List<WorkspaceSourceSymbol> {
        val intelligence = semanticHighlighter as? SourceCodeIntelligence ?: return emptyList()
        require(query.isNotBlank()) { "Workspace symbol query cannot be blank" }
        require(maxResults > 0) { "Workspace symbol limit must be positive" }
        return intelligence.searchWorkspaceSymbols(query, maxResults)
            .mapNotNull { symbol ->
                val relativePath = projectRelativePathFromUri(currentProjectDir(), symbol.uri) ?: return@mapNotNull null
                symbol.copy(uri = relativePath)
            }
            .distinctBy { symbol -> listOf(symbol.uri, symbol.line, symbol.character, symbol.name) }
            .take(maxResults)
    }

    private fun resolveProjectFile(relativePath: String): Path {
        val root = currentProjectDir().toPath().toRealPath()
        val resolved = root.resolve(relativePath).normalize().toRealPath()
        require(resolved.startsWith(root)) { "File is outside the project: $relativePath" }
        require(Files.isRegularFile(resolved)) { "Not a regular file: $relativePath" }
        return resolved
    }

    private fun resolveSearchRoot(root: Path, pathPrefix: String?): Path {
        if (pathPrefix.isNullOrBlank()) return root
        val resolved = root.resolve(pathPrefix).normalize().toRealPath()
        require(resolved.startsWith(root)) { "Search path is outside the project: $pathPrefix" }
        require(Files.isDirectory(resolved)) { "Search path is not a directory: $pathPrefix" }
        return resolved
    }

    private fun currentProjectDir(): File = projectDirProvider().canonicalFile

    private fun walkDir(dir: File, root: Path, depth: Int): FileNode {
        val children = dir.listFiles()
            ?.filter { child ->
                child.name !in EXCLUDED_DIRS &&
                    !child.name.startsWith(".") &&
                    isProjectEntry(child, root)
            }
            ?.sortedWith(compareBy({ !it.isDirectory }, { it.name }))
            ?.map { child ->
                val relativePath = projectRelativePath(root, child.toPath())
                if (child.isDirectory && !Files.isSymbolicLink(child.toPath()) && depth < MAX_DEPTH) {
                    walkDir(child, root, depth + 1)
                } else {
                    FileNode(
                        name = child.name,
                        path = relativePath,
                        isDirectory = child.isDirectory,
                    )
                }
            } ?: emptyList()

        return FileNode(
            name = dir.name,
            path = projectRelativePath(root, dir.toPath()),
            isDirectory = true,
            children = children,
        )
    }

    private fun isProjectEntry(entry: File, root: Path): Boolean {
        if (!Files.isSymbolicLink(entry.toPath())) return true
        return runCatching { entry.toPath().toRealPath().startsWith(root) }.getOrDefault(false)
    }

    private fun isSearchableProjectEntry(entry: File, root: Path): Boolean {
        if (entry.name in EXCLUDED_DIRS || entry.name.startsWith(".")) return false
        if (Files.isSymbolicLink(entry.toPath())) return false
        return entry.toPath().toAbsolutePath().normalize().startsWith(root)
    }

    companion object {
        private const val MAX_DEPTH = 32
        private const val DEFAULT_MAX_SEARCH_MATCHES = 500
        private const val DEFAULT_MAX_CONTEXT_EVIDENCE = 100
        private val EXCLUDED_DIRS = setOf(
            ".git",
            ".gradle",
            ".idea",
            ".next",
            ".omo",
            ".turbo",
            "build",
            "coverage",
            "dist",
            "node_modules",
            "out",
            "target",
        )
    }
}

private data class EvidenceCollection(
    val evidence: List<ContextEvidence>,
    val truncated: Boolean,
)

private fun contextEvidence(
    kind: ContextEvidenceKind,
    source: ContextEvidenceSource,
    path: String?,
    line: Int? = null,
    endLine: Int? = null,
    startCharacter: Int? = null,
    endCharacter: Int? = null,
    summary: String,
    excerpt: String? = null,
    confidence: Double,
    truncated: Boolean = false,
    queryFingerprint: String,
): ContextEvidence {
    val identity = listOf(
        kind.name,
        source.name,
        path.orEmpty(),
        line?.toString().orEmpty(),
        summary,
        queryFingerprint,
    ).joinToString("\u0000")
    return ContextEvidence(
        id = "context-${sha256(identity).take(20)}",
        kind = kind,
        source = source,
        path = path,
        line = line,
        endLine = endLine,
        startCharacter = startCharacter,
        endCharacter = endCharacter,
        summary = summary.take(MAX_CONTEXT_TEXT_CHARS),
        excerpt = excerpt?.take(MAX_CONTEXT_TEXT_CHARS),
        confidence = confidence,
        truncated = truncated,
        queryFingerprint = queryFingerprint,
    )
}

private fun nodeMatches(node: com.swarmeditor.backend.spec.ProjectSpecNode, query: String): Boolean = listOf(
    node.id,
    node.type,
    node.title,
    node.path,
    node.parent.orEmpty(),
    node.dependsOn.joinToString(" "),
    node.references.joinToString(" "),
    node.implements.joinToString(" "),
    node.tags.joinToString(" "),
).any { value -> value.contains(query, ignoreCase = true) }

private fun pathMatches(path: String, pathPrefix: String?): Boolean {
    if (pathPrefix.isNullOrBlank()) return true
    return path == pathPrefix || path.startsWith("$pathPrefix/")
}

private fun contextQueryFingerprint(
    query: String,
    pathPrefix: String?,
    maxResults: Int,
    maxSearchMatches: Int,
): String = sha256(
    listOf(query.trim(), pathPrefix.orEmpty(), maxResults, maxSearchMatches).joinToString("\u0000"),
)

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

private const val MAX_CONTEXT_TEXT_CHARS = 1_000

internal fun projectRelativePath(root: Path, path: Path): String {
    val normalizedRoot = root.toAbsolutePath().normalize()
    val normalizedPath = path.toAbsolutePath().normalize()
    require(normalizedPath.startsWith(normalizedRoot)) { "Path is outside the project: $path" }
    val relative = normalizedRoot.relativize(normalizedPath)
    return if (relative.toString().isEmpty()) "." else relative.joinToString("/") { segment -> segment.toString() }
}

internal fun projectRelativePathFromUri(projectDir: File, uri: String): String? {
    val path = runCatching { Path.of(java.net.URI(uri)) }.getOrNull() ?: return null
    val root = runCatching { projectDir.toPath().toRealPath() }.getOrNull() ?: return null
    val resolved = runCatching { path.toRealPath() }.getOrNull() ?: return null
    if (!resolved.startsWith(root) || !Files.isRegularFile(resolved)) return null
    return projectRelativePath(root, resolved)
}

internal fun decodeUtf8Text(bytes: ByteArray, allowIncompleteTail: Boolean): String? {
    if (bytes.any { byte -> byte == 0.toByte() }) return null
    val maximumTrim = if (allowIncompleteTail) minOf(3, bytes.size) else 0
    for (trim in 0..maximumTrim) {
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        try {
            return decoder.decode(ByteBuffer.wrap(bytes, 0, bytes.size - trim)).toString()
        } catch (_: CharacterCodingException) {
            Unit
        }
    }
    return null
}
