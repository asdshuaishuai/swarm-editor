package com.swarmeditor.backend.service

import com.swarmeditor.common.config.ConfigPaths
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

// --- Data structures for archive tree ---

@Serializable
data class SessionSummary(
    val id: String,
    val title: String,
    val agentId: String,
    val createdAt: String,
    val messageCount: Int = 0,
    val events: List<ActivityEvent> = emptyList()
)

@Serializable
data class ActivityEvent(
    val id: String,
    val type: String,       // "mcp" | "file" | "cmd" | "message"
    val timestamp: String,
    val actor: String,
    val action: String,
    val detail: String = ""
)

@Serializable
data class DayNode(
    val day: String,        // "09"
    val dateStr: String,    // "2024-06-09"
    val sessions: List<SessionSummary>
)

@Serializable
data class MonthNode(
    val month: String,      // "06"
    val days: List<DayNode>
)

@Serializable
data class YearNode(
    val year: String,       // "2024"
    val months: List<MonthNode>
)

@Serializable
data class ArchiveData(
    val years: List<YearNode>
)

// Session file JSON structure (mirrors SessionStore internal format)
@Serializable
private data class SessionFile(
    val id: String,
    val agentId: String,
    val title: String = "",
    val createdAt: String,
    val updatedAt: String,
    val messages: List<MessageFile> = emptyList(),
    val status: String = "active"
)

@Serializable
private data class MessageFile(
    val id: String,
    val role: String,
    val content: List<ContentBlockFile>,
    val createdAt: String
)

@Serializable
private data class ContentBlockFile(val type: String = "text", val text: String = "")

class ActivityService(private val sessionsDir: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    init { sessionsDir.mkdirs() }

    suspend fun getArchiveData(): ArchiveData = withContext(Dispatchers.IO) {
        val summaries = loadSessionSummaries()
        groupByDate(summaries)
    }

    suspend fun getSessionEvents(sessionId: String): List<ActivityEvent> = withContext(Dispatchers.IO) {
        val file = File(sessionsDir, "$sessionId.json")
        if (!file.exists()) return@withContext emptyList()

        try {
            val sf = json.decodeFromString(SessionFile.serializer(), file.readText())
            extractEvents(sf)
        } catch (e: Exception) {
            log.warn { "Failed to load session $sessionId: ${e.message}" }
            emptyList()
        }
    }

    private fun loadSessionSummaries(): List<SessionSummary> {
        val summaries = mutableListOf<SessionSummary>()
        sessionsDir.listFiles()?.filter { it.extension == "json" }?.forEach { file ->
            try {
                val sf = json.decodeFromString(SessionFile.serializer(), file.readText())
                summaries.add(sf.toSummary())
            } catch (e: Exception) {
                log.warn { "Failed to parse session file ${file.name}: ${e.message}" }
            }
        }
        return summaries.sortedByDescending { it.createdAt }
    }

    private fun extractEvents(sf: SessionFile): List<ActivityEvent> {
        val events = mutableListOf<ActivityEvent>()
        sf.messages.forEachIndexed { idx, msg ->
            val timeStr = formatTime(msg.createdAt)
            val contentText = msg.content.joinToString(" ") { it.text }
            val type: String
            val action: String
            val detail: String

            when {
                contentText.contains("mcp", ignoreCase = true) ||
                    contentText.contains("tool_call", ignoreCase = true) -> {
                    type = "mcp"
                    action = extractAction(contentText, "调用")
                    detail = truncate(contentText, 80)
                }
                contentText.contains("write", ignoreCase = true) ||
                    contentText.contains("写入", ignoreCase = true) ||
                    contentText.contains(".kt", ignoreCase = true) ||
                    contentText.contains(".json", ignoreCase = true) ||
                    contentText.contains(".md", ignoreCase = true) -> {
                    type = "file"
                    action = extractAction(contentText, "编辑")
                    detail = truncate(contentText, 80)
                }
                contentText.contains("gradlew", ignoreCase = true) ||
                    contentText.contains("command", ignoreCase = true) ||
                    contentText.contains("运行", ignoreCase = true) ||
                    contentText.contains("验证", ignoreCase = true) -> {
                    type = "cmd"
                    action = extractAction(contentText, "执行")
                    detail = truncate(contentText, 80)
                }
                else -> {
                    type = "message"
                    action = if (msg.role == "user") "提问" else "回复"
                    detail = truncate(contentText, 80)
                }
            }

            events.add(ActivityEvent(
                id = "${sf.id}-$idx",
                type = type,
                timestamp = timeStr,
                actor = sf.agentId.take(10),
                action = action,
                detail = detail
            ))
        }
        return events
    }

    private fun groupByDate(summaries: List<SessionSummary>): ArchiveData {
        val grouped = mutableMapOf<String, MutableMap<String, MutableMap<String, MutableList<SessionSummary>>>>()

        for (s in summaries) {
            val instant = try { Instant.parse(s.createdAt) } catch (_: Exception) { continue }
            val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
            val year = local.year.toString()
            val month = local.monthNumber.toString().padStart(2, '0')
            val day = local.dayOfMonth.toString().padStart(2, '0')

            grouped.getOrPut(year) { mutableMapOf() }
                .getOrPut(month) { mutableMapOf() }
                .getOrPut(day) { mutableListOf() }
                .add(s)
        }

        val years = grouped.keys.sortedDescending().map { year ->
            YearNode(
                year = year,
                months = grouped[year]!!.keys.sortedDescending().map { month ->
                    MonthNode(
                        month = month,
                        days = grouped[year]!![month]!!.keys.sortedDescending().map { day ->
                            DayNode(
                                day = day,
                                dateStr = "$year-$month-$day",
                                sessions = grouped[year]!![month]!![day]!!
                            )
                        }
                    )
                }
            )
        }

        return ArchiveData(years = years)
    }

    private fun SessionFile.toSummary(): SessionSummary {
        val events = extractEvents(this)
        val title = if (this.title.isNotBlank()) this.title
            else messages.firstOrNull()?.content?.firstOrNull()?.text?.take(30) ?: "会话 ${this.id}"
        return SessionSummary(
            id = this.id,
            title = title,
            agentId = this.agentId,
            createdAt = this.createdAt,
            messageCount = this.messages.size,
            events = events
        )
    }

    private fun formatTime(isoString: String): String {
        return try {
            val instant = Instant.parse(isoString)
            val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
            "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
        } catch (_: Exception) {
            isoString.take(5)
        }
    }

    private fun extractAction(text: String, fallback: String): String {
        val words = text.take(20).split(" ").firstOrNull() ?: fallback
        return if (words.length <= 6) words else fallback
    }

    private fun truncate(text: String, maxLen: Int): String {
        val cleaned = text.replace('\n', ' ').trim()
        return if (cleaned.length > maxLen) cleaned.take(maxLen) + "..." else cleaned
    }
}
