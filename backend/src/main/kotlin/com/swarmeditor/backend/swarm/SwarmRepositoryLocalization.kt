package com.swarmeditor.backend.swarm

import com.swarmeditor.backend.lsp.SourceCodeIntelligence
import com.swarmeditor.backend.process.CommandRequest
import com.swarmeditor.backend.process.CommandRunner
import com.swarmeditor.backend.process.LocalCommandRunner
import com.swarmeditor.common.model.SwarmRepositoryEvidence
import com.swarmeditor.common.model.SwarmRepositoryEvidenceBundle
import com.swarmeditor.common.model.SwarmRepositoryEvidenceKind
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.PriorityQueue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun interface SwarmRepositoryLocalizer {
    suspend fun localize(objective: String): SwarmRepositoryEvidenceBundle
}

data class SwarmRepositoryLocalizationBudget(
    val maxScannedFiles: Int = 3_500,
    val maxFileBytes: Long = 256 * 1024,
    val maxCandidateFiles: Int = 16,
    val maxLspFiles: Int = 4,
    val maxEvidenceItems: Int = 24,
    val characterBudget: Int = 12_000,
) {
    init {
        require(maxScannedFiles > 0)
        require(maxFileBytes > 0)
        require(maxCandidateFiles > 0)
        require(maxLspFiles >= 0)
        require(maxEvidenceItems > 0)
        require(characterBudget > 0)
    }
}

class EvidenceDrivenSwarmRepositoryLocalizer(
    private val repositoryRoot: File,
    private val sourceIntelligence: SourceCodeIntelligence? = null,
    private val commandRunner: CommandRunner = LocalCommandRunner(),
    private val budget: SwarmRepositoryLocalizationBudget = SwarmRepositoryLocalizationBudget(),
    private val now: () -> kotlin.time.Instant = { Clock.System.now() },
) : SwarmRepositoryLocalizer {
    init {
        require(repositoryRoot.isDirectory) { "Repository root does not exist" }
    }

    override suspend fun localize(objective: String): SwarmRepositoryEvidenceBundle {
        require(objective.isNotBlank()) { "Repository localization objective cannot be blank" }
        val terms = objectiveTerms(objective)
        val indexedPaths = listRepositoryPaths()
        val scan = scanCandidates(indexedPaths, terms)
        val candidates = scan.candidates
        val evidence = buildList {
            candidates.forEach { candidate -> add(candidate.toEvidence()) }
            addAll(collectLspEvidence(candidates, terms))
            addAll(collectHistoryEvidence(candidates))
        }.distinctBy { listOf(it.kind.name, it.path.orEmpty(), it.line.toString(), it.summary).joinToString("|") }
            .sortedWith(compareByDescending<SwarmRepositoryEvidence> { it.score }.thenBy { it.path.orEmpty() })

        val selected = mutableListOf<SwarmRepositoryEvidence>()
        var consumedCharacters = 0
        evidence.forEach { item ->
            if (selected.size >= budget.maxEvidenceItems) return@forEach
            val itemCharacters = item.characterCost()
            if (consumedCharacters + itemCharacters <= budget.characterBudget) {
                selected += item
                consumedCharacters += itemCharacters
            }
        }
        return SwarmRepositoryEvidenceBundle(
            queryFingerprint = sha256(objective.trim().lowercase()),
            generatedAt = now(),
            scannedFileCount = scan.scannedFileCount,
            candidateFileCount = candidates.size,
            characterBudget = budget.characterBudget,
            consumedCharacters = consumedCharacters,
            truncated = selected.size < evidence.size || indexedPaths.size > budget.maxScannedFiles,
            evidence = selected,
        )
    }

    private suspend fun listRepositoryPaths(): List<String> {
        val gitResult = runCommandOrNull(
            CommandRequest(
                command = listOf("git", "ls-files", "-co", "--exclude-standard"),
                workingDirectory = repositoryRoot,
                timeout = 15.seconds,
                maxOutputChars = 4 * 1024 * 1024,
            )
        )
        if (gitResult != null && gitResult.exitCode == 0 && !gitResult.timedOut) {
            return gitResult.output.lineSequence()
                .map(String::trim)
                .filter(String::isNotEmpty)
                .distinct()
                .toList()
        }
        return withContext(Dispatchers.IO) {
            repositoryRoot.walkTopDown()
                .onEnter { directory -> directory == repositoryRoot || directory.name !in ignoredDirectories }
                .filter(File::isFile)
                .mapNotNull(::relativePath)
                .take(budget.maxScannedFiles + 1)
                .toList()
        }
    }

    private suspend fun scanCandidates(paths: List<String>, terms: Set<String>): ScanResult =
        withContext(Dispatchers.IO) {
            val candidates = PriorityQueue<FileCandidate>(compareBy<FileCandidate> { it.score }.thenByDescending { it.path })
            var scannedFileCount = 0
            paths.asSequence().take(budget.maxScannedFiles).forEach { path ->
                val file = resolveSafeFile(path) ?: return@forEach
                if (!isSearchable(file)) return@forEach
                scannedFileCount++
                val content = try {
                    file.readText()
                } catch (_: Exception) {
                    return@forEach
                }
                if ('\u0000' in content) return@forEach
                val match = score(path, content, terms)
                if (match.score <= 0.0) return@forEach
                val candidate = FileCandidate(
                    path = path.replace(File.separatorChar, '/'),
                    file = file,
                    content = content,
                    score = match.score,
                    matchedTerms = match.matchedTerms,
                    line = match.line,
                    excerpt = match.excerpt,
                )
                candidates += candidate
                if (candidates.size > budget.maxCandidateFiles) candidates.poll()
            }
            ScanResult(
                candidates = candidates.toList()
                    .sortedWith(compareByDescending<FileCandidate> { it.score }.thenBy { it.path }),
                scannedFileCount = scannedFileCount,
            )
        }

    private fun score(path: String, content: String, terms: Set<String>): MatchScore {
        val normalizedPath = path.lowercase()
        val normalizedContent = content.lowercase()
        val matchedTerms = linkedSetOf<String>()
        var score = structuralScore(normalizedPath)
        terms.forEach { term ->
            if (term in normalizedPath) {
                score += 18.0
                matchedTerms += term
            }
            val occurrenceCount = normalizedContent.countOccurrences(term, limit = 8)
            if (occurrenceCount > 0) {
                score += occurrenceCount * 3.0
                matchedTerms += term
            }
        }
        if (matchedTerms.isEmpty() && score < 4.0) return MatchScore(0.0, emptySet(), null, null)

        val lines = content.lineSequence().take(MAX_CONTENT_LINES).toList()
        val best = lines.mapIndexed { index, line ->
            val normalizedLine = line.lowercase()
            index to matchedTerms.count(normalizedLine::contains)
        }.maxByOrNull { (index, matches) -> matches * MAX_CONTENT_LINES - index }
        val bestLine = best?.takeIf { it.second > 0 }?.first
        val excerpt = bestLine?.let { line -> excerpt(lines, line) }
            ?: lines.firstOrNull { it.isNotBlank() }?.trim()?.take(MAX_EXCERPT_CHARS)
        return MatchScore(score, matchedTerms, bestLine?.plus(1), excerpt)
    }

    private suspend fun collectLspEvidence(
        candidates: List<FileCandidate>,
        terms: Set<String>,
    ): List<SwarmRepositoryEvidence> {
        val intelligence = sourceIntelligence ?: return emptyList()
        return buildList {
            candidates.asSequence().filter { it.file.extension.lowercase() in lspExtensions }
                .take(budget.maxLspFiles)
                .forEach { candidate ->
                    val insight = try {
                        intelligence.inspect(candidate.file, candidate.content)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Throwable) {
                        return@forEach
                    }
                    insight.symbols.asSequence()
                        .map { symbol -> symbol to symbolRelevance(symbol.name, terms) }
                        .filter { (_, relevance) -> relevance > 0 || terms.isEmpty() }
                        .sortedByDescending { (_, relevance) -> relevance }
                        .take(4)
                        .forEach { (symbol, relevance) ->
                            add(
                                evidence(
                                    kind = SwarmRepositoryEvidenceKind.SYMBOL,
                                    path = candidate.path,
                                    line = symbol.line + 1,
                                    score = candidate.score + 8 + relevance,
                                    summary = buildString {
                                        append("${symbol.kind} ${symbol.name}")
                                        symbol.containerName?.let { append(" in $it") }
                                        insight.serverName?.let { append(" · $it") }
                                    },
                                )
                            )
                        }
                    insight.diagnostics.asSequence().take(3).forEach { diagnostic ->
                        add(
                            evidence(
                                kind = SwarmRepositoryEvidenceKind.DIAGNOSTIC,
                                path = candidate.path,
                                line = diagnostic.line + 1,
                                score = candidate.score + if (diagnostic.severity == "error") 14 else 9,
                                summary = "${diagnostic.severity}: ${diagnostic.message.take(MAX_SUMMARY_CHARS)}",
                            )
                        )
                    }
                }
        }
    }

    private suspend fun collectHistoryEvidence(candidates: List<FileCandidate>): List<SwarmRepositoryEvidence> {
        val paths = candidates.take(MAX_HISTORY_PATHS).map(FileCandidate::path)
        if (paths.isEmpty()) return emptyList()
        val result = runCommandOrNull(
            CommandRequest(
                command = listOf(
                    "git", "log", "-n", MAX_HISTORY_COMMITS.toString(), "--date=short",
                    "--pretty=format:@@@%H%x09%ad%x09%s", "--name-only", "--",
                ) + paths,
                workingDirectory = repositoryRoot,
                timeout = 15.seconds,
                maxOutputChars = 256 * 1024,
            )
        )
        if (result == null || result.exitCode != 0 || result.timedOut) return emptyList()
        return parseHistory(result.output, paths.toSet()).take(MAX_HISTORY_EVIDENCE)
    }

    private suspend fun runCommandOrNull(request: CommandRequest) = try {
        commandRunner.run(request)
    } catch (error: CancellationException) {
        throw error
    } catch (_: Throwable) {
        null
    }

    private fun parseHistory(output: String, relevantPaths: Set<String>): List<SwarmRepositoryEvidence> {
        data class Commit(val hash: String, val date: String, val subject: String, val paths: MutableList<String>)

        val commits = mutableListOf<Commit>()
        var current: Commit? = null
        output.lineSequence().forEach { line ->
            if (line.startsWith("@@@")) {
                val fields = line.removePrefix("@@@").split('\t', limit = 3)
                if (fields.size == 3) {
                    current = Commit(fields[0], fields[1], fields[2], mutableListOf()).also(commits::add)
                }
            } else if (line.isNotBlank() && line in relevantPaths) {
                current?.paths?.add(line)
            }
        }
        return commits.filter { it.paths.isNotEmpty() }.map { commit ->
            val touched = commit.paths.distinct().take(3)
            evidence(
                kind = SwarmRepositoryEvidenceKind.GIT_HISTORY,
                path = touched.firstOrNull(),
                line = null,
                score = 22.0 + touched.size,
                summary = "${commit.date} ${commit.hash.take(10)} ${commit.subject.take(120)}",
                excerpt = "Touched: ${touched.joinToString()}",
            )
        }
    }

    private fun FileCandidate.toEvidence(): SwarmRepositoryEvidence = evidence(
        kind = SwarmRepositoryEvidenceKind.FILE_MATCH,
        path = path,
        line = line,
        score = score,
        summary = if (matchedTerms.isEmpty()) {
            "Repository entry point or project metadata"
        } else {
            "Matched: ${matchedTerms.joinToString().take(MAX_SUMMARY_CHARS)}"
        },
        excerpt = excerpt,
    )

    private fun evidence(
        kind: SwarmRepositoryEvidenceKind,
        path: String?,
        line: Int?,
        score: Double,
        summary: String,
        excerpt: String? = null,
    ): SwarmRepositoryEvidence {
        val identity = listOf(kind.name, path.orEmpty(), line.toString(), summary).joinToString("|")
        return SwarmRepositoryEvidence(
            id = "repo-${sha256(identity).take(16)}",
            kind = kind,
            path = path,
            line = line,
            score = score,
            summary = summary,
            excerpt = excerpt,
        )
    }

    private fun resolveSafeFile(path: String): File? {
        val root = repositoryRoot.toPath().toAbsolutePath().normalize()
        val resolved = root.resolve(path).normalize()
        if (!resolved.startsWith(root) || Files.isSymbolicLink(resolved)) return null
        return resolved.toFile().takeIf(File::isFile)
    }

    private fun relativePath(file: File): String? {
        val root = repositoryRoot.toPath().toAbsolutePath().normalize()
        val path = file.toPath().toAbsolutePath().normalize()
        if (!path.startsWith(root)) return null
        return root.relativize(path).toString().replace(File.separatorChar, '/')
    }

    private fun isSearchable(file: File): Boolean {
        if (file.length() !in 1..budget.maxFileBytes) return false
        val name = file.name.lowercase()
        return file.extension.lowercase() in searchableExtensions || name in searchableNames
    }
}

private data class FileCandidate(
    val path: String,
    val file: File,
    val content: String,
    val score: Double,
    val matchedTerms: Set<String>,
    val line: Int?,
    val excerpt: String?,
)

private data class ScanResult(
    val candidates: List<FileCandidate>,
    val scannedFileCount: Int,
)

private data class MatchScore(
    val score: Double,
    val matchedTerms: Set<String>,
    val line: Int?,
    val excerpt: String?,
)

private fun structuralScore(path: String): Double = when {
    path.endsWith("/main.kt") || path == "main.kt" -> 8.0
    path.endsWith("/main.java") || path == "main.java" -> 8.0
    path.substringAfterLast('/') in searchableNames -> 6.0
    "/src/" in "/$path" -> 4.0
    else -> 0.0
}

private fun objectiveTerms(objective: String): Set<String> = objectiveTermPattern.findAll(objective.lowercase())
    .map(MatchResult::value)
    .flatMap { token -> token.split('.', '/', '_', '-') }
    .flatMap { token ->
        if (token.length > 2 && token.all(::isCjkCharacter)) sequenceOf(token) + token.windowedSequence(2)
        else sequenceOf(token)
    }
    .map(String::trim)
    .filter { it.length >= 2 && it !in stopWords }
    .take(MAX_QUERY_TERMS)
    .toCollection(linkedSetOf())

private fun isCjkCharacter(character: Char): Boolean = character.code in 0x3400..0x9FFF

private fun symbolRelevance(name: String, terms: Set<String>): Int {
    val normalized = name.lowercase()
    return terms.count(normalized::contains) * 4
}

private fun String.countOccurrences(term: String, limit: Int): Int {
    if (term.isEmpty()) return 0
    var count = 0
    var offset = 0
    while (count < limit) {
        val index = indexOf(term, offset)
        if (index < 0) break
        count++
        offset = index + term.length
    }
    return count
}

private fun excerpt(lines: List<String>, line: Int): String {
    val start = (line - 1).coerceAtLeast(0)
    val end = (line + 1).coerceAtMost(lines.lastIndex)
    return (start..end).joinToString("\n") { index ->
        "${index + 1}: ${lines[index].trimEnd()}"
    }.take(MAX_EXCERPT_CHARS)
}

private fun SwarmRepositoryEvidence.characterCost(): Int =
    summary.length + path.orEmpty().length + excerpt.orEmpty().length + 32

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray())
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

private const val MAX_QUERY_TERMS = 20
private const val MAX_CONTENT_LINES = 20_000
private const val MAX_EXCERPT_CHARS = 700
private const val MAX_SUMMARY_CHARS = 180
private const val MAX_HISTORY_PATHS = 8
private const val MAX_HISTORY_COMMITS = 24
private const val MAX_HISTORY_EVIDENCE = 6
private val objectiveTermPattern = Regex("[\\p{L}\\p{N}_./-]{2,}")
private val ignoredDirectories = setOf(".git", ".gradle", ".idea", "build", "node_modules", "dist", "out")
private val stopWords = setOf(
    "the", "and", "for", "with", "from", "into", "this", "that", "then", "than", "are", "is", "to", "of",
    "in", "on", "a", "an", "进行", "实现", "优化", "继续", "需要", "项目", "代码", "功能", "模块", "一下", "这个",
)
private val searchableExtensions = setOf(
    "kt", "kts", "java", "groovy", "ts", "tsx", "js", "jsx", "py", "rs", "go", "c", "cc", "cpp", "h", "hpp",
    "swift", "m", "mm", "cs", "rb", "php", "scala", "sh", "bash", "zsh", "fish", "sql", "proto", "graphql",
    "md", "adoc", "txt", "json", "jsonl", "yaml", "yml", "toml", "xml", "html", "css", "scss", "properties",
)
private val searchableNames = setOf(
    "readme", "readme.md", "agents.md", "makefile", "dockerfile", "gradle.properties", "settings.gradle.kts",
    "build.gradle.kts", "package.json", "cargo.toml", "go.mod", "pom.xml",
)
private val lspExtensions = setOf(
    "kt", "kts", "java", "ts", "tsx", "js", "jsx", "py", "rs", "go", "c", "cc", "cpp", "h", "hpp",
)
