package com.swarmeditor.backend.service

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
    ): SearchResult {
        require(query.isNotBlank()) { "Search query cannot be blank" }
        require(maxMatches > 0) { "Search result limit must be positive" }

        val root = currentProjectDir().toPath().toRealPath()
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

        searchDirectory(root, depth = 0)
        return SearchResult(
            query = query,
            matches = matches,
            filesSearched = filesSearched,
            truncated = truncated,
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
