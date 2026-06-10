# Swarm Editor 设计修复方案

> 从架构设计角度，重新审视当前实现与 spec 的偏差，制定修复路线。

---

## 一、当前架构设计问题诊断

### 1.1 依赖声明与实际使用严重脱节

```
声明的依赖          实际使用情况            设计决策
─────────────────────────────────────────────────────────
acp:0.13.1         ❌ 零 import            应使用（用户已决策）
koog-agents:0.7.3   ❌ 零 import            暂不需要（未来能力）
mcp-client:0.4.0    ❌ 零 import            需评估（版本解析到0.8.1）
```

**设计问题**：三个 AI 相关依赖全部是"占位符式声明"——为了 future use 而引入，但代码中没有集成点。这导致：
- 构建时间增加（下载不必要的依赖）
- 版本锁定风险（Koog 0.7.3 锁定 Kotlin 2.3.10）
- 开发者困惑（新加入者会以为这些库已被使用）

**修复原则**：
- ACP SDK：立即集成（这是协议层核心）
- Koog：移除依赖声明（直到有实际使用场景）
- MCP SDK：评估是否要用其客户端功能，还是保持当前的 McpStore 自建方案

---

### 1.2 协议层重复造轮子

当前手写实现 vs ACP SDK 提供的功能：

| 功能 | 手写实现 | SDK 提供 | 重复度 |
|------|---------|---------|--------|
| stdio 传输 | `AcpConnection` (351行) | `StdioTransport` | 高 |
| JSON-RPC 协议 | `sendRequest/readLoop` | `Protocol` | 高 |
| Agent 生命周期 | `AcpConnectionManager` | `Agent` 类 | 中 |
| 消息模型 | `AcpMessages.kt` (63行) | `model/ContentBlock` 等 | 中 |
| 会话管理 | `SessionService` + Store | `AgentSession` | 低（业务层不同）|

**设计问题**：手写实现虽然工作正常，但：
1. 维护成本高（协议升级需手动同步）
2. 缺少 SDK 的边界情况处理（如连接断开恢复、心跳机制）
3. 与 SDK 的数据模型不兼容（项目自己的 ContentBlock vs SDK 的 ContentBlock）

**修复原则**：
- 传输层和协议层：用 SDK 的 `StdioTransport` + `Protocol` 替换手写实现
- 业务层（会话存储、UI 绑定）：保留，但适配 SDK 的模型
- 迁移策略：逐步替换，先替换 AcpConnection，再替换 AcpConnectionManager

---

### 1.3 架构模式：双进程 HTTP vs 嵌入式

当前架构（实际运行的）：
```
desktopApp (JVM)          backend (JVM)
├── Compose UI            ├── Ktor Server :8080
├── ViewModel             │   ├── REST Routes
├── ApiClient ──HTTP──→   │   ├── Service Layer
└── StateFlow             │   ├── ACP Layer ──stdio──→ Agent CLI
                          └── embeddedServer(CIO)
```

目标架构（spec 要求）：
```
Compose Desktop 进程 (单 JVM)
├── Compose UI
├── ViewModel ──直接调用──→ Service Layer
│                           ├── AgentService
│                           ├── SessionService
│                           ├── McpService
│                           └── SkillService
└── ACP Layer (SDK) ──stdio──→ Agent CLI
```

**设计问题**：
1. **进程边界导致状态同步困难**：ViewModel 的 StateFlow 和 Service 的 StateFlow 是两套独立系统，通过 HTTP 轮询同步
2. **启动复杂**：需要同时启动 backend 和 desktopApp 两个进程
3. **测试困难**：集成测试需要启动完整 HTTP 服务器

**修复原则**：
- 将 Service 层从 backend 进程"提升"到 desktopApp 进程
- Ktor Server 保留但改为可选（debug/扩展用）
- ViewModel 直接订阅 Service 的 StateFlow（消除轮询）

---

### 1.4 配置同步设计缺陷

当前数据流（单向、不同步）：
```
UI 修改 Agent 配置
    ↓
PUT /api/agents/{id}/config/{key}
    ↓
AgentAdapter.writeNativeConfigField(key, value)
    ↓
~/.claude/settings.json 更新
    ✗ agents.json 未同步更新
```

设计问题：
1. **两个数据源**：agents.json（Swarm Editor 的权威）vs ~/.claude/settings.json（Agent 的权威）
2. **写后不同步**：修改原生配置后，agents.json 中的 env/args 等字段仍是旧值
3. **读取时未合并**：scan() 只检测版本，未读取原生配置中的字段来丰富 AgentConfig

修复后的数据流（双向同步）：
```
AgentRegistry.scan()
    ↓
adapter.detect() ──→ 发现版本
    ↓
adapter.readNativeConfigFields() ──→ 读取 env/args 等
    ↓
合并到 AgentConfig ──→ 保存到 agents.json

UI 修改配置
    ↓
AgentService.saveConfig(agentId, fields)
    ↓
并行写入：
    ├── adapter.writeNativeConfig(config) ──→ ~/.claude/settings.json
    └── 更新内存 AgentConfig ──→ agents.json
```

---

### 1.5 MCP/Skills 同步触发点缺失

当前：修改后只改 Swarm Editor 的 JSON，Agent 看不到。

修复设计：

**MCP 同步**：
```
McpService.upsert(config)
    ↓
保存到 ~/.swarm-editor/mcp-servers.json
    ↓
遍历 config.enabledAgents
    ├── claude:true ──→ ClaudeCodeAdapter.writeMcpConfig(servers)
    │                   └── ~/.claude.json 更新
    └── qwen:true ──→ QwenCodeAdapter.writeMcpConfig(servers)
                        └── ~/.qwen/settings.json 更新
```

**Skills 同步**（已实现但缺少触发）：
```
SkillService.toggleAgent(id, agentId, true)
    ↓
store.toggleAgent(id, agentId, true) ──→ ~/.swarm-editor/skills.json
    ↓
syncSkillsToAgent(agentType, enabledSkillNames)
    ↓
在 ~/.claude/skills/ 创建符号链接
```

---

## 二、Claude Code 优先策略

> **核心原则**：当前阶段只验证 Claude Code 的端到端流程。其他 Agent（Qwen/Kimi/Gemini/OpenCode）的适配器已存在，但同步逻辑、测试、验证均先聚焦 Claude Code。
>
> **理由**：
> 1. Claude Code 是目前最成熟的 ACP CLI 实现
> 2. ClaudeCodeAdapter 已实现最完整（detect、native config I/O、MCP I/O、Provider presets）
> 3. 减少验证复杂度，快速打通核心链路
> 4. 其他 Agent 的同步逻辑与 Claude 相同（通过 AgentAdapter 接口抽象），后续只需验证格式差异

### Claude Code 当前适配状态

| 功能 | ClaudeCodeAdapter | 被 Service 调用？ |
|------|------------------|------------------|
| detect() | ✅ 实现 | ✅ AgentRegistry.scan() |
| readNativeConfig() | ✅ 实现 | ✅ SettingsViewModel |
| readNativeConfigFields() | ✅ 实现（支持 ${VAR} 展开） | ✅ SettingsViewModel |
| writeNativeConfigField() | ✅ 实现 | ✅ AgentRoutes PUT config |
| readMcpConfig() | ✅ 实现（~/.claude.json） | ❌ **从未调用** |
| writeMcpConfig() | ✅ 实现 | ❌ **从未调用** |
| syncSkillsToAgent() | ✅ SkillService 实现 | ❌ **从未从 toggleAgent 调用** |
| Provider presets | ✅ 5 个预设 | ❌ **从未展示** |

### 其他 Agent 状态

| Agent | detect | readNativeConfig | writeNativeConfig | readMcpConfig | writeMcpConfig | Provider presets |
|-------|--------|-----------------|-------------------|---------------|----------------|------------------|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| QwenCode | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Kimi Code | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Gemini CLI | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| OpenCode | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

**结论**：所有 Agent 适配器接口已实现，但 Service 层的调用逻辑（MCP 同步、Skills 同步）**全部缺失**。先验证 Claude Code，其他 Agent 的同步逻辑通用（通过 adapterResolver），后续扩展成本低。

---

## 三、修复优先级（设计角度）

### P0：架构根基（Claude Code 端到端的前提）

| # | 任务 | 设计理由 | Claude Code 相关？ |
|---|------|---------|------------------|
| 1 | **ACP SDK 集成** | 协议层是根基，手写代码与 SDK 模型不兼容 | 通用（不依赖特定 Agent） |
| 2 | **嵌入式架构迁移** | 消除 HTTP 层后，ViewModel 才能直接订阅 Service StateFlow | 通用 |
| 3 | **ViewModel 直调 Service** | 消除 HTTP 轮询，实现真正的实时 UI 更新 | 通用 |

### P1：Claude Code 数据一致性（功能正确性）

| # | 任务 | 设计理由 | Claude Code 验证点 |
|---|------|---------|------------------|
| 4 | **MCP → Agent 同步** | 没有同步，MCP 功能只是"配置编辑器" | `McpService.upsert()` 后验证 `~/.claude.json` 更新 |
| 5 | **Skills 同步触发** | syncSkillsToAgent 已实现但从未被调用 | `toggleAgent()` 后验证 `~/.claude/skills/` 符号链接 |
| 6 | **双向配置同步** | agents.json 与 native config 不一致 | `scan()` 后验证 agents.json 包含 Claude env 字段；`saveConfig()` 后双向一致 |

### P2：Claude Code 用户体验

| # | 任务 | 设计理由 | Claude Code 验证点 |
|---|------|---------|------------------|
| 7 | **流式消息输出** | 核心交互体验 | 连接 Claude → 发送消息 → 看到实时打字机效果 |
| 8 | **Provider 预设切换** | 5 个预设已定义但从未展示 | UI 切换预设后，Claude native config 的 env 更新 |

### P3：质量保障

| # | 任务 | 设计理由 | Claude Code 验证点 |
|---|------|---------|------------------|
| 9 | **测试覆盖** | 当前只有 2 个测试文件 | `ClaudeCodeAdapterTest`：detect、read/write config、read/write MCP |
| 10 | **错误处理与重试** | 连接失败、超时需要优雅降级 | Claude 连接失败后的重试和错误提示 |

---

## 三、具体设计方案

### 3.1 ACP SDK 集成设计

**目标**：用手写实现替换为 SDK 的 `StdioTransport` + `Protocol` + `Agent`。

**迁移策略（渐进式）**：

Step 1: 保留 `AcpConnection` 接口，内部改用 SDK
```kotlin
class AcpConnection(agentId, config) {
    private val transport = StdioTransport(config.command, config.args)
    private val protocol = Protocol(transport)
    // ... 适配现有 API
}
```

Step 2: 逐步替换 `AcpConnectionManager`
- SDK 的 `Agent` 类已经管理连接生命周期
- 但需要保留 `Mutex` 保护的 Map 结构（多 Agent 并发）
- 或者评估 SDK 是否支持多 Agent 管理

Step 3: 统一消息模型
- 项目自己的 `ContentBlock` → SDK 的 `com.agentclientprotocol.model.ContentBlock`
- 项目自己的 `JsonRpcRequest/Response` → SDK 的协议类

**风险**：
- SDK 0.13.1 较旧（最新 0.20.0+），API 可能有变化
- 需要确认 SDK 是否支持流式输出（session/update 通知）

### 3.2 嵌入式架构设计

**模块依赖调整**：
```kotlin
// desktopApp/build.gradle.kts
dependencies {
    implementation(projects.common)
    implementation(projects.backend)  // ← 新增
    // ... Ktor Client 可以保留（用于外部 API）
}
```

**Service 初始化**：
```kotlin
// desktopApp/Main.kt
fun main() {
    // 初始化 Service（从 backend/Main.kt 提取）
    val services = ServiceProvider.initialize()
    
    application {
        Window(...) {
            App(services)  // 注入 Service 实例
        }
    }
}
```

**ViewModel 注入**：
```kotlin
// App.kt
@Composable
fun App(services: Services) {
    val agentVm = remember { AgentViewModel(services.agentService) }
    val sessionVm = remember { SessionViewModel(services.sessionService) }
    // ... 其他 VM
}
```

**Ktor Server 可选化**：
```kotlin
// backend/Main.kt
fun main(args: Array<String>) {
    val runServer = args.contains("--server")
    
    // Service 初始化（无论是否启动 Server）
    initializeServices()
    
    if (runServer) {
        embeddedServer(CIO, ...).start(wait = true)
    }
}
```

### 3.3 MCP 同步设计

```kotlin
class McpService(private val store: McpStore, 
                 private val agentService: AgentService) {
    
    suspend fun upsert(config: McpServerConfig) {
        store.upsert(config)
        syncToAgents(config)
    }
    
    private suspend fun syncToAgents(config: McpServerConfig) {
        config.enabledAgents.forEach { (agentId, enabled) ->
            if (!enabled) return@forEach
            val adapter = agentService.getAdapter(agentId) ?: return@forEach
            val allServers = store.getAll().filter { 
                it.enabledAgents[agentId] == true 
            }
            adapter.writeMcpConfig(allServers.associateBy { it.id })
        }
    }
}
```

### 3.4 流式消息设计

```kotlin
// SessionService
suspend fun sendMessage(sessionId: String, text: String): Flow<String> = 
    callbackFlow {
        val connection = agentService.getConnection(sessionId)
        connection?.onNotification { notification ->
            when (notification.method) {
                "session/update" -> {
                    val chunk = extractTextChunk(notification)
                    trySend(chunk)
                }
            }
        }
        connection?.sendPrompt(sessionId, text)
        awaitClose { /* cleanup */ }
    }

// SessionViewModel
fun sendMessage(text: String) {
    viewModelScope.launch {
        sessionService.sendMessage(sessionId, text)
            .collect { chunk ->
                // 增量更新当前消息的文本
                _messages.value = _messages.value.map { msg ->
                    if (msg.id == currentMessageId) 
                        msg.copy(text = msg.text + chunk)
                    else msg
                }
            }
    }
}
```

---

## 四、依赖清理建议

### 立即清理

| 依赖 | 行动 | 理由 |
|------|------|------|
| `ai.koog:koog-agents:0.7.3` | **移除** | 声明但未使用，且锁定 Kotlin 版本 |
| `io.modelcontextprotocol:kotlin-sdk-client:0.4.0` | **评估后决定** | 如果只用 McpStore 自建方案，可移除；如果需要 MCP 客户端功能（连接外部 MCP Server），保留并升级到 0.8.1 |

### 升级

| 依赖 | 当前 | 建议 | 理由 |
|------|------|------|------|
| `com.agentclientprotocol:acp` | 0.13.1 | 调研 0.20.0+ | 新版本可能有流式支持和 bug 修复 |
| `io.modelcontextprotocol:kotlin-sdk-client` | 0.4.0 | 对齐缓存的 0.8.1 | Gradle 已解析到 0.8.1，声明版本与实际不符 |

---

## 五、验收标准（设计角度）

1. **架构**：`./gradlew :desktopApp:run` 不启动 `localhost:8080` 即可运行
2. **协议**：`AcpConnection` 内部使用 `StdioTransport`（可通过反射或日志验证）
3. **同步**：修改 MCP 后 3 秒内 Agent 原生配置文件更新
4. **流式**：发送消息后，UI 在 500ms 内开始显示内容（非等完整响应）
5. **依赖**：移除 Koog 后 `./gradlew build` 仍成功
6. **测试**：核心 Service（Agent/Session/Mcp/Skills）每个都有单元测试

---

*设计方案版本: 1.0*
*基于: spec + 代码审查发现 + 用户决策（使用 ACP SDK + 嵌入式架构优先）*
