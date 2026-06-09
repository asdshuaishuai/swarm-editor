# Spec vs 实现 逐条对比报告

> 对比对象：`docs/superpowers/specs/2026-06-08-mvp-design.md` vs 当前代码库（2026-06-09）

---

## 总体结论

**设计文档的状态标注已经严重过时。** 文档中 Phase 2-7 全部标记为"📋 待开始"，但实际代码已经完成了大部分骨架（约 45%）。然而，**spec 中定义的核心业务逻辑（流式通信、配置同步、嵌入式架构）并未实现**。

这是一个"骨架跑在旧架构上"的状态。

---

## 逐章对比

### 第 1 章：概述

| Spec 条款 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| 技术栈：Gradle 9.x | ⚠️ 8.x | `gradle/wrapper/gradle-wrapper.properties` 实际为 8.x |
| 技术栈：嵌入式 Service Layer（无独立进程） | ❌ **偏离** | 当前仍是独立 Ktor 进程 + HTTP REST。Main.kt 启动 `embeddedServer(CIO)` |
| 技术栈：Ktor Client（桌面端通信） | ✅ 有但不合 spec | desktopApp 有 Ktor Client，但 spec 要求"无网络"，Client 应该只用于外部 API |
| 核心功能 1：ACP 协议 | 🟡 骨架有 | AcpConnection/AcpConnectionManager 存在，但流式输出未实现 |
| 核心功能 2：Agent 管理 | 🟡 骨架有 | AgentRegistry + 5 个 Adapter + AgentService 存在，但 Provider 预设未接入 |
| 核心功能 3：MCP 配置管理 | 🟡 骨架有 | McpStore + McpService + 路由存在，但**工具调用未实现**、**同步到 Agent 未实现** |
| 核心功能 4：Skills 配置管理 | 🟡 骨架有 | SkillStore + SkillScanner + SkillService + 路由存在，但**符号链接同步未实现** |
| 核心功能 5：会话历史 | 🟡 骨架有 | SessionStore + SessionService + 路由存在，消息持久化工作正常 |
| 不包含：蜂群调度 | ✅ 未实现 | 确认无此功能 |
| 不包含：编辑器能力 | ✅ 未实现 | 确认无此功能 |
| 不包含：A2A/LSP/索引 | ✅ 未实现 | 确认无此功能 |

**关键偏差：spec 明确"后端 = 嵌入式 Service Layer（无独立进程）"，但当前仍是双进程 HTTP 架构。**

---

### 第 2 章：整体架构

#### 架构图对比

**Spec 要求的架构：**
```
Compose Desktop 进程
├── UI Layer ←→ ViewModel Layer
└── Service Layer (嵌入式后端) ← 直接调用（无网络）
    └── ACP Layer ← stdio → 外部 CLI Agent
```

**当前实际架构：**
```
Backend 进程 (JVM)          DesktopApp 进程 (JVM)
├── Ktor Server :8080  ←──────┼── ApiClient (HTTP)
│   └── Service Layer         │   └── ViewModel
│       └── ACP Layer ──stdio─┼──→ 外部 CLI Agent
```

| Spec 条款 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| "ViewModel 直接调用 Service（无 HTTP、无 WebSocket）" | ❌ **完全偏离** | ViewModel → ApiClient → HTTP → Ktor Route → Service |
| "Service 层管理 Agent 生命周期" | 🟡 部分 | AgentService 有 connect/disconnect/scan，但状态管理靠轮询 |
| "ACP 层封装官方 SDK" | 🟡 部分 | 未使用官方 `com.agentclientprotocol:acp` SDK，而是手写 JSON-RPC 2.0 协议 |
| "AgentAdapter 抽象层" | ✅ 基本对齐 | 5 个适配器 + AgentAdapter 接口，与 spec 一致 |

**重大偏差 1：未使用官方 ACP SDK**
- Spec 要求：`com.agentclientprotocol:acp:0.13.1`
- 实际：backend `build.gradle.kts` 确实声明了 `implementation(libs.acp)`，但**代码中未引用**
- 实际实现：手写 `AcpConnection.kt`（307 行），直接 ProcessBuilder + stdin/stdout + kotlinx.serialization
- 风险：如果 ACP 协议升级，手写实现需要手动同步；SDK 可能已提供连接管理、消息类型等基础设施

**重大偏差 2：架构完全相反**
- Spec 要求：单进程嵌入式
- 实际：双进程 HTTP

---

### 第 3 章：数据流与存储策略

#### 配置路径

| Spec 路径 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| `~/.swarm-editor/agents.json` | ✅ 实现 | AgentRegistry 使用 |
| `~/.swarm-editor/mcp-servers.json` | ✅ 实现 | McpStore 使用 |
| `~/.swarm-editor/skills.json` | ✅ 实现 | SkillStore 使用 |
| `~/.swarm-editor/skills/{name}/SKILL.md` | 🟡 部分 | SkillScanner 扫描全局路径，但**全局仓库路径只扫描各 Agent 目录，未用 `~/.swarm-editor/skills/`** |
| `~/.swarm-editor/sessions/{id}.json` | ✅ 实现 | SessionStore 使用 |
| `{project}/.swarm-editor/skills.json` | ❌ **缺失** | SkillScanner 只有 `scanGlobal()`，无项目级扫描 |

#### 双向配置同步

| Spec 流程 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| **读取流程**：扫描 PATH → Adapter 读原生配置 → 转 AgentConfig → 保存 | 🟡 部分 | AgentRegistry.scan() 有 detect()，但**未调用 readNativeConfig() 合并到 AgentConfig** |
| **写入流程**：UI 修改 → 转原生格式 → 写回原生配置 → 更新 agents.json | 🟡 部分 | `PUT /api/agents/{id}/config/{key}` 只写原生配置字段，**未同步更新 agents.json** |

**关键缺失：双向同步不完整**
- 读取时：scan 只检测版本和命令，没有读取原生配置中的 env/args 等字段来丰富 AgentConfig
- 写入时：writeNativeConfigField 只写 Agent 原生文件，agents.json 中对应的配置未更新
- 结果：两个数据源（agents.json vs ~/.claude/settings.json）可能不一致

#### Agent 原生配置路径

| Spec 定义 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| Claude: `~/.claude/settings.json` + `~/.claude.json` | ✅ 实现 | ClaudeCodeAdapter 正确 |
| Qwen: `~/.qwen/settings.json`（内嵌 MCP） | ✅ 实现 | QwenCodeAdapter 正确，MCP 内嵌在 settings.json |

---

### 第 4 章：Skills 系统

#### 三层模型

| 层 | Spec 定义 | 实现状态 | 偏差说明 |
|---|-----------|---------|---------|
| **全局仓库** | `~/.swarm-editor/skills/` | ❌ **偏离** | SkillScanner 扫描 `~/.claude/skills/`、`~/.qwen/skills/` 等，**未扫描 `~/.swarm-editor/skills/`** |
| **项目引用** | `{project}/.swarm-editor/skills.json` | ❌ **缺失** | 无项目级 Skills 管理 |
| **Agent 同步** | 符号链接到 `~/.claude/skills/` | ❌ **缺失** | 当前无符号链接逻辑；SkillService.toggleAgent 只改 JSON 文件 |

#### 数据流

**Spec 要求的数据流：**
```
扫描/创建 → ~/.swarm-editor/skills/{name}/SKILL.md
                ↓
项目开启 → {project}/.swarm-editor/skills.json
                ↓
同步到 Agent → 符号链接 → ~/.claude/skills/{name}/
```

**当前实际数据流：**
```
扫描 → ~/.claude/skills/ 等 Agent 目录 → SkillStore (内存) → ~/.swarm-editor/skills.json
                                           ↓
                                    toggleAgent (只改 JSON，无同步)
```

**关键缺失：**
1. Swarm Editor 自己的全局仓库未建立
2. 无项目级引用机制
3. **无符号链接同步** — Skills 只在 Swarm Editor 内部可见，Agent 运行时看不到

#### Skills 来源

| Spec 来源 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| 文件系统扫描 | ✅ 实现 | SkillScanner.scanGlobal() |
| MCP 工具 | ❌ **缺失** | 无从 MCP Server 注册为 Skill 的逻辑 |
| 用户创建 | ❌ **缺失** | UI 无创建 Skill 的功能 |

---

### 第 5 章：Agent Adapter 抽象层

#### 接口定义对比

**Spec 定义的接口：**
```kotlin
interface AgentAdapter {
    suspend fun readNativeConfig(): AgentNativeConfig?
    suspend fun writeNativeConfig(config: AgentNativeConfig)
    suspend fun readMcpConfig(): Map<String, McpServerSpec>
    suspend fun writeMcpConfig(servers: Map<String, McpServerSpec>)
    fun skillsDirectory(): String
    suspend fun detect(): AgentDetectResult
}
```

**实际实现的接口：**
```kotlin
interface AgentAdapter {
    suspend fun readNativeConfig(): String?              // 返回原始字符串，非结构化
    suspend fun readNativeConfigFields(): Map<String, String>  // 新增，spec 未定义
    suspend fun writeNativeConfigField(key: String, value: String)  // 字段级写入，spec 要求整体写入
    suspend fun readMcpConfig(): Map<String, McpServerConfig>
    suspend fun writeMcpConfig(servers: Map<String, McpServerConfig>)
    val skillsDirectory: String                          // property，spec 要求方法
    suspend fun detect(): String?                        // 返回版本字符串，spec 要求 AgentDetectResult
}

| Spec 接口 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| `readNativeConfig(): AgentNativeConfig?` | 🟡 偏离 | 实际返回 `String?`（原始 JSON/TOML），非结构化对象 |
| `writeNativeConfig(config: AgentNativeConfig)` | 🟡 偏离 | 实际是 `writeNativeConfigField(key, value)` 字段级写入 |
| `readMcpConfig(): Map<String, McpServerSpec>` | ✅ 基本对齐 | 返回 `Map<String, McpServerConfig>`，命名差异 |
| `writeMcpConfig(servers)` | ✅ 对齐 | 签名一致 |
| `skillsDirectory(): String` | ✅ 对齐 | 实现为 `val skillsDirectory: String` property |
| `detect(): AgentDetectResult` | 🟡 偏离 | 返回 `String?`（版本），非 `AgentDetectResult` 对象 |

**接口差异的影响：**
- `AgentNativeConfig` 类型未定义（common 模块无此类型）
- `AgentDetectResult` 类型未定义
- 字段级写入 vs 整体写入：当前设计更灵活（UI 改一个字段不用传整个对象），但与 spec 不符

#### 扩展方式

| Spec 要求 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| 新增 Agent = 创建 Adapter + 实现 6 个方法 + 注册到 Factory | 🟡 部分 | 实际是创建 Adapter + 注册到 AgentRegistry.init()，无 Factory 模式 |

---

### 第 6 章：MCP 配置管理

#### 统一存储格式

| Spec 要求 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| JSON 格式：`{ "servers": { "name": { ... } } }` | ✅ 对齐 | McpStore 使用 McpFile/McpServerFile 序列化，格式一致 |
| `enabledAgents: { "claude": true, "qwen": false }` | ✅ 对齐 | McpServerConfig.enabledAgents 字段存在 |

#### 同步到 Agent 原生格式

| Spec 要求 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| Claude → `~/.claude.json` | 🟡 有接口无调用 | ClaudeCodeAdapter.writeMcpConfig() 已实现，但**Service 层未在合适的时机调用** |
| Qwen → `~/.qwen/settings.json`（无 type，HTTP 用 httpUrl） | 🟡 有接口无调用 | QwenCodeAdapter 已实现，但 Service 层未调用 |
| 格式差异处理 | ✅ 对齐 | 各 Adapter 内部处理格式差异 |

**关键缺失：同步触发点**
- Spec 要求：MCP 修改后自动同步到 Agent 原生配置
- 实际：McpService.upsert/delete 只改 `~/.swarm-editor/mcp-servers.json`，**未调用 AgentAdapter.writeMcpConfig()**
- 结果：Agent 运行时使用自己的配置，看不到 Swarm Editor 中配的 MCP

---

### 第 7 章：UI 面板

#### 四个核心面板

| Spec 面板 | 实现状态 | 偏差说明 |
|-----------|---------|---------|
| **AgentPanel** | 🟡 部分 | AgentBar 有列表+状态灯，但**配置编辑在 SettingsModal 中，非独立 AgentPanel** |
| **McpPanel** | 🟡 部分 | RightPanel 中有 MCP tab，但**无工具浏览**、**无 per-Agent 开关 UI** |
| **SkillPanel** | 🟡 部分 | RightPanel 中有 Skills tab，但**无来源标签**、**无安装到项目** |
| **SessionPanel** | 🟡 部分 | SessionPanel + ChatArea 有会话列表+消息，但**无消息时间线** |

#### AgentPanel 布局对比

**Spec 要求的布局：**
```
Agent 管理                          [扫描]
──────────────────────────────────────────
🟢 Claude Code  v1.2.3    [配置] [断开]
🔴 QwenCode     未检测     [配置] [连接]
──────────────────────────────────────────
配置编辑区 (选中 Agent 后显示)
```

**当前实际布局：**
```
左侧 AgentBar (58px 窄栏):
┌────┐
│ S  │  ← Logo
│ 🟣 │  ← Claude (emoji)
│ 🔵 │  ← Qwen
│ 🟢 │  ← Gemini
│ 🟡 │  ← Kimi
│ 🟠 │  ← OpenCode
└────┘

SettingsModal (弹出层):
┌──────────────────────────┐
│ Agent │ MCP │ Skills      │
├──────────────────────────┤
│ 配置字段 (key-value)      │
│ MCP Server 列表           │
│ Skills 列表               │
└──────────────────────────┘
```

**UI 结构偏差：**
- Spec 要求：每个面板独立（AgentPanel、McpPanel、SkillPanel、SessionPanel）
- 实际：采用三栏布局（AgentBar | SessionPanel+ChatArea | RightPanel with tabs），配置塞在 SettingsModal 弹层
- Spec 要求：AgentPanel 内置配置编辑
- 实际：配置编辑在 SettingsModal 的 Tab 中，与 MCP/Skills 混在一个弹层

---

### 第 8 章：开发阶段

| Spec Phase | Spec 目标 | 文档状态 | 实际代码状态 | 评估 |
|-----------|----------|---------|-------------|------|
| Phase 1 | 项目骨架 + Gradle 构建系统 | ✅ 完成 | ✅ 完成 | 一致 |
| Phase 2 | ACP 协议层（官方 SDK 封装 + ConnectionManager） | 📋 待开始 | 🟡 **骨架已有** | 文档**严重过时** |
| Phase 3 | Agent 管理（Adapter + Claude/Qwen + Scanner + Registry） | 📋 待开始 | 🟡 **骨架已有** | 文档**严重过时** |
| Phase 4 | MCP 配置管理（McpStore + AgentSync） | 📋 待开始 | 🟡 **Store 有，Sync 无** | 文档**部分过时** |
| Phase 5 | Skills 配置管理（SkillScanner + SkillStore + Agent 同步） | 📋 待开始 | 🟡 **Scanner/Store 有，同步无** | 文档**部分过时** |
| Phase 6 | 会话历史（SessionStore + 消息持久化） | 📋 待开始 | ✅ **基本实现** | 文档**严重过时** |
| Phase 7 | UI 面板（4 个 Panel） | 📋 待开始 | 🟡 **骨架已有** | 文档**严重过时** |

**结论：设计文档的 Phase 标注完全落后于实际代码进度。实际代码已完成 Phase 2-7 的骨架，但 Phase 4/5 中的"Sync"部分缺失。**

---

## 关键偏差汇总（按严重程度排序）

### 🔴 致命偏差（无此不算 MVP）

| # | 偏差 | Spec 章节 | 影响 |
|---|------|----------|------|
| 1 | **架构完全相反**：双进程 HTTP vs 嵌入式单进程 | 第 2 章 | 与 spec 根本冲突，无法交付 |
| 2 | **未使用官方 ACP SDK**：手写 JSON-RPC vs `com.agentclientprotocol:acp` | 第 2 章 | 协议兼容性风险，重复造轮子 |
| 3 | **MCP/Skills 未同步到 Agent**：修改只存 Swarm Editor JSON，Agent 看不到 | 第 3/4/6 章 | MCP/Skills 功能无效 |
| 4 | **无项目级 Skills**：只有全局扫描，无 `{project}/.swarm-editor/skills.json` | 第 4 章 | Skills 系统不完整 |

### 🟡 重大偏差（影响体验，但可 workaround）

| # | 偏差 | Spec 章节 | 影响 |
|---|------|----------|------|
| 5 | **无流式消息输出**：阻塞式 sendPrompt vs 实时流式 | 第 3 章（隐含） | 核心交互体验差 |
| 6 | **Agent 配置双向同步不完整**：写原生配置不更新 agents.json | 第 3 章 | 数据源不一致 |
| 7 | **Skills 全局仓库路径错误**：扫描 Agent 目录 vs `~/.swarm-editor/skills/` | 第 4 章 | Skills 管理逻辑混乱 |
| 8 | **UI 面板结构不符**：三栏+弹层 vs 独立四面板 | 第 7 章 | 交互流程不同 |

### 🟢 轻微偏差（可接受或可后续调整）

| # | 偏差 | Spec 章节 | 影响 |
|---|------|----------|------|
| 9 | Gradle 版本 8.x vs 9.x | 第 1 章 | 无实际影响 |
| 10 | AgentAdapter 接口签名差异：字段级写入 vs 整体写入 | 第 5 章 | 实现更灵活，但接口不兼容 |
| 11 | detect() 返回 String? vs AgentDetectResult | 第 5 章 | 信息丢失（无 configPath） |
| 12 | 无 AgentAdapterFactory，直接注册到 Registry | 第 5 章 | 扩展方式不同 |

---

## 建议行动

### 立即修正（阻塞级）

1. **更新设计文档状态标注** — Phase 2-7 应标记为"🟡 骨架完成，待填充业务逻辑"
2. **决策：是否坚持使用官方 ACP SDK？**
   - 选项 A：迁移到官方 SDK（减少维护负担，但需重构 AcpConnection）
   - 选项 B：继续使用手写实现（已工作，但需自行维护协议兼容性）
3. **决策：嵌入式架构迁移优先级**
   - 选项 A：先完成 Phase 2-7 业务逻辑，再迁移架构（风险：在错误架构上堆代码）
   - 选项 B：先迁移架构，再填充业务逻辑（推荐，避免重复工作）

### 高优先级

4. 实现 MCP/Skills → Agent 配置同步（符号链接或 writeMcpConfig 触发）
5. 实现项目级 Skills 管理（`{project}/.swarm-editor/skills.json`）
6. 修正 Skills 全局仓库路径为 `~/.swarm-editor/skills/`

### 中优先级

7. 实现流式消息输出（ACP session/update 通知驱动）
8. 修正 Agent 配置双向同步（writeNativeConfig 后更新 agents.json）
9. 根据 spec 调整 UI 面板结构（或更新 spec 接受当前设计）

---

---

## 用户决策（2026-06-09）

基于上述分析，用户做出以下决策：

1. **使用官方 ACP SDK（选项 A）** — 废弃手写 JSON-RPC 实现，迁移到 `com.agentclientprotocol:acp:0.13.1`
2. **先迁移架构，再填充业务逻辑（选项 A）** — 优先完成嵌入式架构迁移，再在正确架构上堆功能
3. **UI 重构暂缓** — 用户正在设计新 UI，当前 UI 改动全部冻结，计划只包含后端和 ViewModel 层修改

---

*对比日期: 2026-06-09*
*对比范围: spec 全文 263 行 vs 代码库 50 个源文件*
