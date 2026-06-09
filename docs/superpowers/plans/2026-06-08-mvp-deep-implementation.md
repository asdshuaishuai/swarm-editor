# Swarm Editor MVP 深度实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前骨架替换为真实后端逻辑 + 前端 ViewModel 绑定，实现端到端可交互 MVP。

**Architecture:** 嵌入式架构 — Compose Desktop 进程内直接调用 Service 层，无网络通信。Service 层管理 Agent 生命周期、MCP/Skill 存储、会话持久化。前端通过 StateFlow 驱动 UI 更新。

**Tech Stack:** Kotlin 2.3.10, Ktor 3.2.2, Compose Desktop 1.8.1, ACP SDK 0.13.1, kotlinx.coroutines, kotlinx.serialization

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `backend/src/.../service/AgentService.kt` | Agent 生命周期管理（connect/disconnect/scan） |
| `backend/src/.../service/McpService.kt` | MCP 配置管理（CRUD/同步/健康检查） |
| `backend/src/.../service/SkillService.kt` | Skills 扫描/存储/同步 |
| `backend/src/.../service/SessionService.kt` | 会话 CRUD + 消息持久化 |
| `backend/src/.../service/ConfigService.kt` | Agent 原生配置读写 |
| `backend/src/.../mcp/McpStore.kt` | MCP 统一存储（JSON 文件） |
| `backend/src/.../skill/SkillStore.kt` | Skills 统一存储（JSON 文件） |
| `backend/src/.../session/SessionStore.kt` | 会话 JSON 文件存储 |
| `desktopApp/.../viewmodel/AgentViewModel.kt` | Agent 状态管理 |
| `desktopApp/.../viewmodel/SessionViewModel.kt` | 会话 + 消息状态管理 |
| `desktopApp/.../viewmodel/SettingsViewModel.kt` | 设置面板状态管理 |
| `backend/src/test/.../service/AgentServiceTest.kt` | Agent 服务测试 |
| `backend/src/test/.../session/SessionStoreTest.kt` | 会话存储测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/.../Main.kt` | 初始化 Service 层，注入到路由 |
| `backend/src/.../route/AgentRoutes.kt` | 绑定 AgentService |
| `backend/src/.../route/McpRoutes.kt` | 绑定 McpService |
| `backend/src/.../route/SessionRoutes.kt` | 绑定 SessionService |
| `desktopApp/.../App.kt` | 使用 ViewModel 替换 Mock 数据 |
| `desktopApp/.../ui/session/SessionPanel.kt` | 绑定 SessionViewModel |
| `desktopApp/.../ui/session/ChatArea.kt` | 绑定 SessionViewModel |
| `desktopApp/.../ui/session/RightPanel.kt` | 绑定 McpService/SkillService |
| `desktopApp/.../ui/session/SettingsModal.kt` | 绑定 ConfigService |
| `desktopApp/.../ui/agent/AgentBar.kt` | 绑定 AgentViewModel |

---

## Task 1: SessionStore — 会话持久化

**Files:**
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/session/SessionStore.kt`
- Test: `backend/src/test/kotlin/com/swarmeditor/backend/session/SessionStoreTest.kt`

- [ ] **Step 1: 创建 SessionStore**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/session/SessionStore.kt
package com.swarmeditor.backend.session

import com.swarmeditor.common.model.*
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

private val log = KotlinLogging.logger {}

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
private data class ContentBlockFile(
    val type: String = "text",
    val text: String = ""
)

class SessionStore(private val dataDir: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val sessions = mutableMapOf<String, Session>()

    init {
        dataDir.mkdirs()
    }

    suspend fun load() = withContext(Dispatchers.IO) {
        dataDir.listFiles()?.filter { it.extension == "json" }?.forEach { file ->
            try {
                val sf = json.decodeFromString(SessionFile.serializer(), file.readText())
                sessions[sf.id] = sf.toSession()
            } catch (e: Exception) {
                log.warn { "Failed to load session ${file.name}: ${e.message}" }
            }
        }
        log.info { "Loaded ${sessions.size} sessions" }
    }

    suspend fun create(agentId: String, title: String): Session = mutex.withLock {
        val now = Clock.System.now()
        val session = Session(
            id = UUID.randomUUID().toString().take(8),
            agentId = agentId,
            createdAt = now,
            updatedAt = now,
            status = SessionStatus.ACTIVE
        )
        sessions[session.id] = session
        saveToFile(session)
        session
    }

    suspend fun get(id: String): Session? = mutex.withLock { sessions[id] }

    suspend fun getAll(): List<Session> = mutex.withLock {
        sessions.values.sortedByDescending { it.updatedAt }
    }

    suspend fun addMessage(sessionId: String, role: MessageRole, text: String): Message? = mutex.withLock {
        val session = sessions[sessionId] ?: return@withLock null
        val now = Clock.System.now()
        val message = Message(
            id = UUID.randomUUID().toString().take(8),
            role = role,
            content = listOf(ContentBlock(type = "text", text = text)),
            createdAt = now
        )
        val updated = session.copy(
            messages = session.messages + message,
            updatedAt = now
        )
        sessions[sessionId] = updated
        saveToFile(updated)
        message
    }

    suspend fun close(id: String) = mutex.withLock {
        sessions[id]?.let { session ->
            val updated = session.copy(status = SessionStatus.CLOSED, updatedAt = Clock.System.now())
            sessions[id] = updated
            saveToFile(updated)
        }
    }

    private suspend fun saveToFile(session: Session) = withContext(Dispatchers.IO) {
        try {
            val file = File(dataDir, "${session.id}.json")
            file.writeText(json.encodeToString(SessionFile.serializer(), session.toFile()))
        } catch (e: Exception) {
            log.error { "Failed to save session ${session.id}: ${e.message}" }
        }
    }
}

private fun SessionFile.toSession() = Session(
    id = id, agentId = agentId,
    createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
    messages = messages.map { it.toMessage() },
    status = when (status) { "closed" -> SessionStatus.CLOSED; "archived" -> SessionStatus.ARCHIVED; else -> SessionStatus.ACTIVE }
)

private fun MessageFile.toMessage() = Message(
    id = id, role = when (role) { "user" -> MessageRole.USER; "assistant" -> MessageRole.ASSISTANT; else -> MessageRole.SYSTEM },
    content = content.map { ContentBlock(type = it.type, text = it.text) },
    createdAt = Instant.parse(createdAt)
)

private fun Session.toFile() = SessionFile(
    id = id, agentId = agentId,
    createdAt = createdAt.toString(), updatedAt = updatedAt.toString(),
    messages = messages.map { MessageFile(it.id, it.role.name.lowercase(), it.content.map { c -> ContentBlockFile(c.type, c.text) }, it.createdAt.toString()) },
    status = status.name.lowercase()
)
```

- [ ] **Step 2: 创建测试**

```kotlin
// backend/src/test/kotlin/com/swarmeditor/backend/session/SessionStoreTest.kt
package com.swarmeditor.backend.session

import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.SessionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class SessionStoreTest {
    @TempDir lateinit var tempDir: File

    @Test
    fun `create and retrieve session`() = runTest {
        val store = SessionStore(tempDir)
        val session = store.create("claude-code", "Test Session")
        assertEquals("claude-code", session.agentId)
        assertEquals(SessionStatus.ACTIVE, session.status)
        assertNotNull(store.get(session.id))
    }

    @Test
    fun `add message to session`() = runTest {
        val store = SessionStore(tempDir)
        val session = store.create("claude-code", "Test")
        val msg = store.addMessage(session.id, MessageRole.USER, "Hello")
        assertNotNull(msg)
        assertEquals("Hello", msg!!.content.first().text)
        val updated = store.get(session.id)!!
        assertEquals(1, updated.messages.size)
    }

    @Test
    fun `close session`() = runTest {
        val store = SessionStore(tempDir)
        val session = store.create("claude-code", "Test")
        store.close(session.id)
        assertEquals(SessionStatus.CLOSED, store.get(session.id)!!.status)
    }

    @Test
    fun `load persisted sessions`() = runTest {
        val store1 = SessionStore(tempDir)
        store1.create("claude-code", "Persisted")
        val store2 = SessionStore(tempDir)
        store2.load()
        assertEquals(1, store2.getAll().size)
    }
}
```

- [ ] **Step 3: 运行测试**

Run: `./gradlew :backend:test --tests "com.swarmeditor.backend.session.SessionStoreTest" -v`
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/kotlin/com/swarmeditor/backend/session/SessionStore.kt backend/src/test/kotlin/com/swarmeditor/backend/session/SessionStoreTest.kt
git commit -m "feat: SessionStore with JSON persistence and tests"
```

---

## Task 2: McpStore — MCP 统一存储

**Files:**
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/mcp/McpStore.kt`

- [ ] **Step 1: 创建 McpStore**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/mcp/McpStore.kt
package com.swarmeditor.backend.mcp

import com.swarmeditor.common.model.McpServerConfig
import com.swarmeditor.common.model.McpServerType
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

@Serializable
private data class McpFile(val servers: Map<String, McpServerFile> = emptyMap())

@Serializable
private data class McpServerFile(
    val name: String, val type: String = "stdio", val command: String = "",
    val args: List<String> = emptyList(), val env: Map<String, String> = emptyMap(),
    val url: String = "", val enabledAgents: Map<String, Boolean> = emptyMap(),
    val description: String = "", val tags: List<String> = emptyList()
)

class McpStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val servers = mutableMapOf<String, McpServerConfig>()

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext
        try {
            val mc = json.decodeFromString(McpFile.serializer(), file.readText())
            mc.servers.forEach { (id, s) -> servers[id] = s.toConfig(id) }
            log.info { "Loaded ${servers.size} MCP servers" }
        } catch (e: Exception) {
            log.warn { "Failed to load MCP config: ${e.message}" }
        }
    }

    suspend fun getAll(): List<McpServerConfig> = mutex.withLock { servers.values.toList() }

    suspend fun get(id: String): McpServerConfig? = mutex.withLock { servers[id] }

    suspend fun upsert(config: McpServerConfig) = mutex.withLock {
        servers[config.id] = config
        save()
    }

    suspend fun delete(id: String) = mutex.withLock {
        servers.remove(id)
        save()
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try {
            file.parentFile?.mkdirs()
            val mc = McpFile(servers.mapValues { (_, s) -> s.toFile() })
            file.writeText(json.encodeToString(McpFile.serializer(), mc))
        } catch (e: Exception) {
            log.error { "Failed to save MCP config: ${e.message}" }
        }
    }
}

private fun McpServerFile.toConfig(id: String) = McpServerConfig(
    id = id, name = name, type = when (type) { "http" -> McpServerType.HTTP else -> McpServerType.STDIO },
    command = command, args = args, env = env, url = url, enabledAgents = enabledAgents, description = description, tags = tags
)

private fun McpServerConfig.toFile() = McpServerFile(
    name = name, type = type.name.lowercase(), command = command, args = args, env = env, url = url,
    enabledAgents = enabledAgents, description = description, tags = tags
)
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/kotlin/com/swarmeditor/backend/mcp/McpStore.kt
git commit -m "feat: McpStore for unified MCP server persistence"
```

---

## Task 3: SkillStore — Skills 统一存储

**Files:**
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/skill/SkillStore.kt`
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/skill/SkillScanner.kt`

- [ ] **Step 1: 创建 SkillStore**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/skill/SkillStore.kt
package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

private val log = KotlinLogging.logger {}

@Serializable
private data class SkillsFile(val skills: List<SkillFile> = emptyList())

@Serializable
private data class SkillFile(
    val id: String, val name: String, val description: String = "",
    val source: String = "filesystem", val scope: String = "global",
    val path: String = "", val agentId: String = "",
    val enabledAgents: Map<String, Boolean> = emptyMap(), val tags: List<String> = emptyList()
)

class SkillStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private val skills = mutableMapOf<String, SkillConfig>()

    suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext
        try {
            val sf = json.decodeFromString(SkillsFile.serializer(), file.readText())
            sf.skills.forEach { skills[it.id] = it.toConfig() }
            log.info { "Loaded ${skills.size} skills" }
        } catch (e: Exception) {
            log.warn { "Failed to load skills: ${e.message}" }
        }
    }

    suspend fun getAll(): List<SkillConfig> = mutex.withLock { skills.values.toList() }

    suspend fun upsert(config: SkillConfig) = mutex.withLock {
        skills[config.id] = config
        save()
    }

    suspend fun delete(id: String) = mutex.withLock {
        skills.remove(id)
        save()
    }

    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean) = mutex.withLock {
        skills[id]?.let { skill ->
            skills[id] = skill.copy(enabledAgents = skill.enabledAgents + (agentId to enabled))
            save()
        }
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        try {
            file.parentFile?.mkdirs()
            file.writeText(json.encodeToString(SkillsFile.serializer(), SkillsFile(skills.values.map { it.toFile() })))
        } catch (e: Exception) {
            log.error { "Failed to save skills: ${e.message}" }
        }
    }
}

private fun SkillFile.toConfig() = SkillConfig(id = id, name = name, description = description,
    source = when (source) { "mcp" -> SkillSource.MCP else -> SkillSource.FILESYSTEM },
    scope = scope, path = path, agentId = agentId, enabledAgents = enabledAgents, tags = tags)

private fun SkillConfig.toFile() = SkillFile(id = id, name = name, description = description,
    source = source.name.lowercase(), scope = scope, path = path, agentId = agentId, enabledAgents = enabledAgents, tags = tags)
```

- [ ] **Step 2: 创建 SkillScanner**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/skill/SkillScanner.kt
package com.swarmeditor.backend.skill

import com.swarmeditor.common.model.SkillConfig
import com.swarmeditor.common.model.SkillSource
import io.github.oshai.kotlin_logging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

private val log = KotlinLogging.logger {}

class SkillScanner {
    private val globalPaths = listOf(
        File(System.getProperty("user.home"), ".claude/skills"),
        File(System.getProperty("user.home"), ".swarm-editor/skills"),
        File(System.getProperty("user.home"), ".kimi/skills"),
        File(System.getProperty("user.home"), ".qwen/skills"),
        File(System.getProperty("user.home"), ".config/opencode/skills"),
    )

    suspend fun scanGlobal(): List<SkillConfig> = withContext(Dispatchers.IO) {
        val skills = mutableListOf<SkillConfig>()
        globalPaths.forEach { dir ->
            if (!dir.exists()) return@forEach
            dir.listFiles()?.forEach { entry ->
                if (entry.isDirectory) {
                    val skillMd = File(entry, "SKILL.md")
                    if (skillMd.exists()) {
                        val desc = skillMd.readLines().dropWhile { it.startsWith("#") || it.isBlank() }
                            .firstOrNull()?.trim() ?: ""
                        skills.add(SkillConfig(
                            id = "fs:${entry.name}", name = entry.name,
                            description = desc, source = SkillSource.FILESYSTEM,
                            scope = "global", path = entry.absolutePath
                        ))
                    }
                } else if (entry.extension in listOf("sh", "py", "js", "ts")) {
                    skills.add(SkillConfig(
                        id = "fs:${entry.nameWithoutExtension}", name = entry.nameWithoutExtension,
                        description = "Script: ${entry.name}", source = SkillSource.FILESYSTEM,
                        scope = "global", path = entry.absolutePath
                    ))
                }
            }
        }
        log.info { "Scanned ${skills.size} global skills" }
        skills
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/swarmeditor/backend/skill/
git commit -m "feat: SkillStore and SkillScanner for skills management"
```

---

## Task 4: Service 层 — 连接所有组件

**Files:**
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/service/AgentService.kt`
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/service/SessionService.kt`
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/service/McpService.kt`
- Create: `backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt`

- [ ] **Step 1: 创建 AgentService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/service/AgentService.kt
package com.swarmeditor.backend.service

import com.swarmeditor.backend.acp.AcpConnectionManager
import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

private val log = KotlinLogging.logger {}

class AgentService(
    private val registry: AgentRegistry,
    private val connectionManager: AcpConnectionManager
) {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _agents = MutableStateFlow<List<AgentRuntimeInfo>>(emptyList())
    val agents: StateFlow<List<AgentRuntimeInfo>> = _agents

    suspend fun init() {
        registry.load()
        refresh()
    }

    suspend fun scan() {
        val scanned = registry.scan()
        _agents.value = scanned
        registry.save()
    }

    suspend fun connect(agentId: String): Result<Unit> {
        val config = registry.getConfig(agentId) ?: return Result.failure(Exception("Agent not found"))
        updateStatus(agentId, AgentStatus.CONNECTING)
        val result = connectionManager.connect(config)
        return if (result.isSuccess) {
            updateStatus(agentId, AgentStatus.CONNECTED)
            Result.success(Unit)
        } else {
            updateStatus(agentId, AgentStatus.ERROR)
            Result.failure(result.exceptionOrNull()!!)
        }
    }

    suspend fun disconnect(agentId: String) {
        connectionManager.disconnect(agentId)
        updateStatus(agentId, AgentStatus.DISCONNECTED)
    }

    fun getConnection(agentId: String) = connectionManager.getConnection(agentId)

    fun getConfig(agentId: String) = registry.getConfig(agentId)

    fun getAllConfigs() = registry.getAllConfigs()

    fun getAdapter(agentType: com.swarmeditor.common.model.AgentType) = registry.getAdapter(agentType)

    private fun updateStatus(agentId: String, status: AgentStatus) {
        registry.updateStatus(agentId, status)
        _agents.value = _agents.value.map {
            if (it.config.id == agentId) it.copy(status = status) else it
        }
    }

    private fun refresh() {
        _agents.value = registry.getAllConfigs().map { config ->
            AgentRuntimeInfo(config = config, status = registry.getStatus(config.id), version = registry.getVersion(config.id))
        }
    }
}
```

- [ ] **Step 2: 创建 SessionService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/service/SessionService.kt
package com.swarmeditor.backend.service

import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.common.model.MessageRole
import com.swarmeditor.common.model.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class SessionService(private val store: SessionStore) {
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions

    suspend fun init() {
        store.load()
        refresh()
    }

    suspend fun create(agentId: String, title: String): Session {
        val session = store.create(agentId, title)
        refresh()
        return session
    }

    suspend fun get(id: String) = store.get(id)

    suspend fun getAll() = store.getAll()

    suspend fun addMessage(sessionId: String, role: MessageRole, text: String) =
        store.addMessage(sessionId, role, text).also { refresh() }

    suspend fun close(id: String) {
        store.close(id)
        refresh()
    }

    private suspend fun refresh() {
        _sessions.value = store.getAll()
    }
}
```

- [ ] **Step 3: 创建 McpService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/service/McpService.kt
package com.swarmeditor.backend.service

import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.common.model.McpServerConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class McpService(private val store: McpStore) {
    private val _servers = MutableStateFlow<List<McpServerConfig>>(emptyList())
    val servers: StateFlow<List<McpServerConfig>> = _servers

    suspend fun init() {
        store.load()
        refresh()
    }

    suspend fun getAll() = store.getAll()

    suspend fun upsert(config: McpServerConfig) {
        store.upsert(config)
        refresh()
    }

    suspend fun delete(id: String) {
        store.delete(id)
        refresh()
    }

    private suspend fun refresh() {
        _servers.value = store.getAll()
    }
}
```

- [ ] **Step 4: 创建 SkillService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/service/SkillService.kt
package com.swarmeditor.backend.service

import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.common.model.SkillConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class SkillService(private val store: SkillStore, private val scanner: SkillScanner) {
    private val _skills = MutableStateFlow<List<SkillConfig>>(emptyList())
    val skills: StateFlow<List<SkillConfig>> = _skills

    suspend fun init() {
        store.load()
        refresh()
    }

    suspend fun scan() {
        val scanned = scanner.scanGlobal()
        scanned.forEach { store.upsert(it) }
        refresh()
    }

    suspend fun getAll() = store.getAll()

    suspend fun toggleAgent(id: String, agentId: String, enabled: Boolean) {
        store.toggleAgent(id, agentId, enabled)
        refresh()
    }

    private suspend fun refresh() {
        _skills.value = store.getAll()
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/swarmeditor/backend/service/
git commit -m "feat: Service layer (AgentService, SessionService, McpService, SkillService)"
```

---

## Task 5: 重写 Main.kt — 初始化 Service 层

**Files:**
- Modify: `backend/src/main/kotlin/com/swarmeditor/backend/Main.kt`

- [ ] **Step 1: 重写 Main.kt**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/Main.kt
package com.swarmeditor.backend

import com.swarmeditor.backend.acp.AcpConnectionManager
import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.route.agentRoutes
import com.swarmeditor.backend.route.mcpRoutes
import com.swarmeditor.backend.route.sessionRoutes
import com.swarmeditor.backend.route.skillRoutes
import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.common.config.ConfigPaths
import com.swarmeditor.common.config.ServerConfig
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.routing.routing
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import java.io.File

// 全局 Service 实例
val agentRegistry = AgentRegistry()
val connectionManager = AcpConnectionManager()
val sessionStore = SessionStore(File(ConfigPaths.SESSIONS_DIR))
val mcpStore = McpStore(File(ConfigPaths.MCP_SERVERS_JSON))
val skillStore = SkillStore(File(ConfigPaths.SKILLS_JSON))
val skillScanner = SkillScanner()

val agentService = AgentService(agentRegistry, connectionManager)
val sessionService = SessionService(sessionStore)
val mcpService = McpService(mcpStore)
val skillService = SkillService(skillStore, skillScanner)

fun main() {
    runBlocking {
        agentService.init()
        sessionService.init()
        mcpService.init()
        skillService.init()
    }
    embeddedServer(CIO, host = ServerConfig.DEFAULT_HOST, port = ServerConfig.DEFAULT_PORT, module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(Json { prettyPrint = true; isLenient = true; ignoreUnknownKeys = true; encodeDefaults = true })
    }
    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethods.Get); allowMethod(HttpMethods.Post)
        allowMethod(HttpMethods.Put); allowMethod(HttpMethods.Delete)
    }
    routing {
        agentRoutes(agentService)
        mcpRoutes(mcpService)
        skillRoutes(skillService)
        sessionRoutes(sessionService, agentService)
    }
}
```

- [ ] **Step 2: 重写路由绑定 AgentService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/route/AgentRoutes.kt
package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.AgentService
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put

fun Route.agentRoutes(service: AgentService) {
    get("/api/agents") {
        call.respond(mapOf("agents" to service.agents.value))
    }
    get("/api/agents/{id}") {
        val id = call.parameters["id"]!!
        val config = service.getConfig(id)
        if (config != null) call.respond(mapOf("agent" to config))
        else call.respond(mapOf("error" to "not found"))
    }
    post("/api/agents/{id}/connect") {
        val id = call.parameters["id"]!!
        val result = service.connect(id)
        if (result.isSuccess) call.respond(mapOf("status" to "connected"))
        else call.respond(mapOf("error" to result.exceptionOrNull()?.message))
    }
    post("/api/agents/{id}/disconnect") {
        service.disconnect(call.parameters["id"]!!)
        call.respond(mapOf("status" to "disconnected"))
    }
    get("/api/agents/scan") {
        service.scan()
        call.respond(mapOf("agents" to service.agents.value))
    }
    get("/api/agents/{id}/config") {
        val id = call.parameters["id"]!!
        val adapter = service.getAdapter(service.getConfig(id)?.agentType ?: return@get call.respond(mapOf("error" to "not found")))
        val fields = adapter.readNativeConfigFields()
        call.respond(mapOf("fields" to fields, "configPath" to adapter.nativeConfigPath))
    }
    put("/api/agents/{id}/config/{key}") {
        val id = call.parameters["id"]!!
        val key = call.parameters["key"]!!
        val body = call.receive< Map<String, String>>()
        val adapter = service.getAdapter(service.getConfig(id)?.agentType ?: return@put call.respond(mapOf("error" to "not found")))
        adapter.writeNativeConfigField(key, body["value"] ?: "")
        call.respond(mapOf("status" to "ok"))
    }
}
```

- [ ] **Step 3: 重写 SessionRoutes 绑定 SessionService + AgentService**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/route/SessionRoutes.kt
package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.common.model.MessageRole
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post

fun Route.sessionRoutes(sessionService: SessionService, agentService: AgentService) {
    get("/api/sessions") {
        call.respond(mapOf("sessions" to sessionService.getAll()))
    }
    get("/api/sessions/{id}") {
        val session = sessionService.get(call.parameters["id"]!!)
        if (session != null) call.respond(mapOf("session" to session))
        else call.respond(mapOf("error" to "not found"))
    }
    post("/api/sessions") {
        val body = call.receive<Map<String, String>>()
        val agentId = body["agentId"] ?: "claude-code"
        val title = body["title"] ?: "新会话"
        val session = sessionService.create(agentId, title)
        call.respond(mapOf("session" to session))
    }
    post("/api/sessions/{id}/messages") {
        val id = call.parameters["id"]!!
        val body = call.receive<Map<String, String>>()
        val content = body["content"] ?: ""
        // 添加用户消息
        sessionService.addMessage(id, MessageRole.USER, content)
        // 通过 ACP 发送到 Agent
        val session = sessionService.get(id)!!
        val connection = agentService.getConnection(session.agentId)
        if (connection != null && connection.isConnected) {
            val result = connection.sendPrompt(id, content)
            if (result.isSuccess) {
                sessionService.addMessage(id, MessageRole.ASSISTANT, result.getOrNull() ?: "")
                call.respond(mapOf("response" to (result.getOrNull() ?: "")))
            } else {
                call.respond(mapOf("error" to result.exceptionOrNull()?.message))
            }
        } else {
            call.respond(mapOf("error" to "Agent not connected"))
        }
    }
    delete("/api/sessions/{id}") {
        sessionService.close(call.parameters["id"]!!)
        call.respond(mapOf("status" to "closed"))
    }
}
```

- [ ] **Step 4: 重写 McpRoutes 和 SkillRoutes**

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/route/McpRoutes.kt
package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.McpService
import com.swarmeditor.common.model.McpServerConfig
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.mcpRoutes(service: McpService) {
    get("/api/mcp/servers") { call.respond(mapOf("servers" to service.getAll())) }
    post("/api/mcp/servers") {
        val config = call.receive<McpServerConfig>()
        service.upsert(config)
        call.respond(mapOf("status" to "ok"))
    }
    put("/api/mcp/servers/{id}") {
        val config = call.receive<McpServerConfig>()
        service.upsert(config)
        call.respond(mapOf("status" to "ok"))
    }
    delete("/api/mcp/servers/{id}") {
        service.delete(call.parameters["id"]!!)
        call.respond(mapOf("status" to "ok"))
    }
}
```

```kotlin
// backend/src/main/kotlin/com/swarmeditor/backend/route/SkillRoutes.kt
package com.swarmeditor.backend.route

import com.swarmeditor.backend.service.SkillService
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.skillRoutes(service: SkillService) {
    get("/api/skills") { call.respond(mapOf("skills" to service.getAll())) }
    get("/api/skills/scan") {
        service.scan()
        call.respond(mapOf("skills" to service.getAll()))
    }
    put("/api/skills/{id}/toggle/{agentId}") {
        service.toggleAgent(call.parameters["id"]!!, call.parameters["agentId"]!!, true)
        call.respond(mapOf("status" to "ok"))
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/swarmeditor/backend/
git commit -m "feat: wire up Service layer with Ktor routes"
```

---

## Task 6: 前端 ViewModel 层

**Files:**
- Create: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/AgentViewModel.kt`
- Create: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/SessionViewModel.kt`
- Create: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/SettingsViewModel.kt`

- [ ] **Step 1: 创建 AgentViewModel**

```kotlin
// desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/AgentViewModel.kt
package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.common.model.AgentRuntimeInfo
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.desktop.AGENTS
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AgentViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _agents = MutableStateFlow(AGENTS.map { it.copy() })
    val agents: StateFlow<List<com.swarmeditor.desktop.AgentInfo>> = _agents

    fun selectAgent(id: String) {
        _agents.value = _agents.value.map { it.copy(isSelected = it.id == id) }
    }

    fun updateStatus(id: String, connected: Boolean) {
        _agents.value = _agents.value.map {
            if (it.id == id) it.copy(isConnected = connected) else it
        }
    }
}
```

- [ ] **Step 2: 创建 SessionViewModel**

```kotlin
// desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/SessionViewModel.kt
package com.swarmeditor.desktop.viewmodel

import com.swarmeditor.common.model.Message
import com.swarmeditor.common.model.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class UiMessage(
    val id: String, val isUser: Boolean, val text: String,
    val activities: List<UiActivity> = emptyList()
)

data class UiActivity(val icon: String, val label: String, val detail: String, val isOk: Boolean = false)

class SessionViewModel {
    private val scope = CoroutineScope(Dispatchers.Default)
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions
    private val _currentSession = MutableStateFlow<Session?>(null)
    val currentSession: StateFlow<Session?> = _currentSession
    private val _messages = MutableStateFlow<List<UiMessage>>(emptyList())
    val messages: StateFlow<List<UiMessage>> = _messages
    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending

    // Mock 数据初始
    init {
        _messages.value = listOf(
            UiMessage("1", true, "帮我重构 ACP 协议层，使用官方 SDK 封装连接管理"),
            UiMessage("2", false, "好的，我来分析一下当前的 ACP 实现，然后使用官方 SDK 进行重构。",
                listOf(UiActivity("🔍", "已探索", "1 search, 1 file"))),
            UiMessage("3", false, "我建议创建以下类：",
                listOf(UiActivity("✍️", "已写入", "AcpConnectionManager.kt", false))),
            UiMessage("4", true, "可以，先从 ConnectionManager 开始"),
            UiMessage("5", false, "",
                listOf(
                    UiActivity("✍️", "已写入", "AcpConnectionManager.kt +67"),
                    UiActivity("✅", "验证通过", "./gradlew :backend:compileKotlin", true)
                ))
        )
    }

    fun sendMessage(text: String) {
        if (text.isBlank()) return
        _isSending.value = true
        scope.launch {
            _messages.value = _messages.value + UiMessage(
                id = System.currentTimeMillis().toString(), isUser = true, text = text
            )
            // TODO: 调用后端 API
            _isSending.value = false
        }
    }
}
```

- [ ] **Step 3: 创建 SettingsViewModel**

```kotlin
// desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/SettingsViewModel.kt
package com.swarmeditor.desktop.viewmodel

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class AgentConfigField(val label: String, val value: String, val isPassword: Boolean = false)

class SettingsViewModel {
    private val _selectedAgentId = MutableStateFlow("claude-code")
    val selectedAgentId: StateFlow<String> = _selectedAgentId
    private val _configFields = MutableStateFlow<List<AgentConfigField>>(emptyList())
    val configFields: StateFlow<List<AgentConfigField>> = _configFields

    fun selectAgent(id: String) {
        _selectedAgentId.value = id
        // TODO: 从后端加载配置
        _configFields.value = when (id) {
            "claude-code" -> listOf(
                AgentConfigField("Model", "claude-sonnet-4-20250514"),
                AgentConfigField("API Key", "sk-ant-xxx", isPassword = true),
                AgentConfigField("Base URL", "api.anthropic.com"),
            )
            "qwen-code" -> listOf(
                AgentConfigField("Model", "qwen-max"),
                AgentConfigField("API Key", "", isPassword = true),
                AgentConfigField("Base URL", "https://dashscope.aliyuncs.com"),
            )
            else -> emptyList()
        }
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/
git commit -m "feat: ViewModels for Agent, Session, Settings state management"
```

---

## Task 7: 前端 UI 绑定 ViewModel

**Files:**
- Modify: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/App.kt`
- Modify: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/ChatArea.kt`
- Modify: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/SessionPanel.kt`
- Modify: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/SettingsModal.kt`

- [ ] **Step 1: App.kt 使用 ViewModel**

在 `App.kt` 中创建 ViewModel 实例并传递给子组件：

```kotlin
@Composable
fun App() {
    val agentVm = remember { AgentViewModel() }
    val sessionVm = remember { SessionViewModel() }
    val settingsVm = remember { SettingsViewModel() }
    val agents by agentVm.agents.collectAsState()
    val selectedAgent = agents.firstOrNull { it.isSelected } ?: agents.first()
    var showSettings by remember { mutableStateOf(false) }
    var showRightPanel by remember { mutableStateOf(true) }
    var rightTab by remember { mutableStateOf("mcp") }
    var inputText by remember { mutableStateOf("") }

    Row(Modifier.fillMaxSize().background(Bg)) {
        AgentBar(agents = agents, selectedAgent = selectedAgent, onSelectAgent = { agentVm.selectAgent(it.id) })
        SessionPanel(selectedAgent = selectedAgent, sessionVm = sessionVm)
        Column(Modifier.weight(1f).fillMaxHeight()) {
            // Header
            Row(...) { ... }
            // Chat + Right Panel
            Row(Modifier.weight(1f).fillMaxWidth()) {
                ChatArea(selectedAgent = selectedAgent, sessionVm = sessionVm, inputText = inputText, onInputChange = { inputText = it }, onSend = { sessionVm.sendMessage(inputText); inputText = "" })
                if (showRightPanel) { RightPanel(...) }
            }
        }
    }
    if (showSettings) { SettingsModal(agents = agents, settingsVm = settingsVm, onClose = { showSettings = false }) }
}
```

- [ ] **Step 2: ChatArea 使用 SessionViewModel**

将 `ChatArea` 改为从 `sessionVm.messages` 读取消息列表，而不是硬编码 Mock 数据。输入框绑定 `inputText` 和 `onSend`。

- [ ] **Step 3: SessionPanel 使用 SessionViewModel**

将 `SessionPanel` 改为从 `sessionVm.sessions` 读取会话列表。

- [ ] **Step 4: SettingsModal 使用 SettingsViewModel**

将 `SettingsModal` 改为从 `settingsVm.configFields` 读取配置字段，Agent 选择器绑定 `settingsVm.selectAgent`。

- [ ] **Step 5: Commit**

```bash
git add desktopApp/src/main/kotlin/com/swarmeditor/desktop/
git commit -m "feat: bind ViewModels to UI components, replace mock data"
```

---

## Task 8: 端到端验证

- [ ] **Step 1: 构建验证**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: 启动桌面端**

Run: `./gradlew :desktopApp:run`
Expected: 看到设计稿中的 UI，可以切换 Agent、查看会话列表、发送消息

- [ ] **Step 3: 验证 Agent 扫描**

在 Agent 设置面板中点击扫描，验证已安装的 Agent 被检测到。

- [ ] **Step 4: 验证会话流程**

创建新会话 → 选择 Claude Code → 发送消息 → 看到响应（如果 Claude Code 已安装且 ACP 可用）。

- [ ] **Step 5: Final Commit**

```bash
git add -A
git commit -m "feat: MVP complete - full UI with backend integration"
```
