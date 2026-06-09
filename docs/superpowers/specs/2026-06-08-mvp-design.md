# Swarm Editor MVP 设计文档

> 日期: 2026-06-08 | 状态: 已确认

## 1. 概述

Swarm Editor MVP 是一款基于 Kotlin/JVM 的多 Agent 协调桌面客户端。聚焦可交互客户端核心能力，去掉蜂群调度、多 Agent 协调和编辑器功能。

### 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 构建 | Gradle (Kotlin DSL) + Version Catalog | 9.x |
| 后端 | 嵌入式 Service Layer（无独立进程） | - |
| 前端 | Compose Desktop | 1.8.1 |
| ACP | `com.agentclientprotocol:acp` | 0.13.1 |
| MCP | `io.modelcontextprotocol:kotlin-sdk-client` | 0.4.0 |
| Koog | `ai.koog:koog-agents` | 0.7.3 |
| Kotlin | JetBrains Kotlin | 2.3.10 |
| Ktor | Client（桌面端通信） | 3.2.2 |
| 序列化 | kotlinx.serialization | 1.10.0 |
| 协程 | kotlinx.coroutines | 1.10.2 |
| JDK | OpenJDK | 21+ |

### MVP 核心功能

1. **ACP 协议**：基于官方 SDK，连接外部 CLI Agent
2. **Agent 管理**：Claude Code + QwenCode，带抽象适配层，可扩展
3. **MCP 配置管理**：统一 MCP Server 配置、per-Agent 同步、工具浏览
4. **Skills 配置管理**：全局仓库 + 项目引用 + Agent 同步
5. **会话历史**：消息持久化、会话生命周期管理

### 不包含

- ❌ 蜂群调度与多 Agent 协调
- ❌ 编辑器能力（CodeMirror/Monaco）
- ❌ ShadowBuffer 与自动 lint 验证
- ❌ A2A Agent 间通信
- ❌ LSP 桥接
- ❌ 代码库索引与 @Files 语法

## 2. 整体架构

```
┌─────────────────────────────────────────────────┐
│              Compose Desktop 进程                 │
│  ┌───────────────┐  ┌─────────────────────────┐  │
│  │   UI Layer    │  │   ViewModel Layer        │  │
│  │  AgentPanel   │←→│  AgentViewModel          │  │
│  │  McpPanel     │  │  McpViewModel            │  │
│  │  SkillPanel   │  │  SkillViewModel          │  │
│  │  SessionPanel │  │  SessionViewModel        │  │
│  └───────────────┘  └────────┬────────────────┘  │
│                              │ 直接调用（无网络）   │
│  ┌───────────────────────────▼─────────────────┐  │
│  │           Service Layer (嵌入式后端)          │  │
│  │  AgentService  │ McpService │ SkillService   │  │
│  │  SessionService                               │  │
│  └───────────────────────────┬─────────────────┘  │
│                              │                    │
│  ┌───────────────────────────▼─────────────────┐  │
│  │           ACP Layer (官方 SDK 封装)           │  │
│  │  AcpConnectionManager                        │  │
│  │  AgentAdapter (抽象) → Claude / Qwen / ...   │  │
│  └───────────────────────────┬─────────────────┘  │
│                              │ stdio              │
│  ┌───────────────────────────▼─────────────────┐  │
│  │  外部 CLI Agent 进程 (claude acp / qwen acp) │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 关键决策

- ViewModel 直接调用 Service（无 HTTP、无 WebSocket）
- Service 层管理 Agent 生命周期、MCP/Skill 存储、会话持久化
- ACP 层封装官方 SDK，提供统一的连接管理接口
- AgentAdapter 抽象层：每个 Agent 类型实现自己的配置读写和命令

## 3. 数据流与存储策略

### 配置路径

| 配置 | 路径 | 格式 |
|------|------|------|
| Agent 统一配置 | `~/.swarm-editor/agents.json` | JSON |
| MCP 统一存储 | `~/.swarm-editor/mcp-servers.json` | JSON |
| Skills 统一索引 | `~/.swarm-editor/skills.json` | JSON |
| Skills 全局仓库 | `~/.swarm-editor/skills/{name}/SKILL.md` | Markdown |
| 会话数据 | `~/.swarm-editor/sessions/{id}.json` | JSON |
| 项目级 Skills | `{project}/.swarm-editor/skills.json` | JSON |

### 双向配置同步

**读取流程：**
1. AgentScanner 扫描 PATH → 发现 `claude`、`qwen` 可执行文件
2. 通过 AgentAdapter 读取原生配置
3. 转换为统一的 `AgentConfig` 数据模型
4. 持久化到 `~/.swarm-editor/agents.json`

**写入流程：**
1. 用户在 UI 修改配置
2. 转换为原生格式
3. 写回原生配置文件
4. 同时更新 `~/.swarm-editor/agents.json`

### Agent 原生配置路径

| Agent | 配置文件 | MCP 配置 | Skills 目录 |
|-------|---------|---------|------------|
| Claude Code | `~/.claude/settings.json` | `~/.claude.json` | `~/.claude/skills/` |
| QwenCode | `~/.qwen/settings.json` | `~/.qwen/settings.json`（内嵌） | `~/.qwen/skills/` |

### 会话历史

- 会话通过 ACP 协议创建，消息流通过 `session/prompt` 收发
- 每条消息（user/assistant/system）持久化到 `~/.swarm-editor/sessions/{id}.json`
- 会话状态：active → closed → archived

## 4. Skills 系统

### 三层模型

| 层 | 位置 | 作用 |
|---|------|------|
| **全局仓库** | `~/.swarm-editor/skills/` | 编辑器管理的所有 Skills，跨项目共享 |
| **项目引用** | `{project}/.swarm-editor/skills.json` | 当前项目启用哪些 Skills |
| **Agent 同步** | `~/.claude/skills/` 等 | 通过符号链接让各 Agent 能发现和使用 |

### 数据流

```
安装 Skills
扫描 / 用户创建 ──────────→ ~/.swarm-editor/skills/{name}/SKILL.md
                                │
项目开启                        │
──────────→  {project}/.swarm-editor/skills.json  (引用全局)
                                │
同步到 Agent                    │
──────────→  ~/.claude/skills/{name}/  (符号链接)
            ~/.qwen/skills/{name}/   (符号链接)
```

### Skills 来源

1. **文件系统扫描**：扫描各 Agent 的 skills 目录，发现已有 Skills
2. **MCP 工具**：从已配置的 MCP Server 中发现可用工具，注册为 Skill
3. **用户创建**：在编辑器中直接创建新 Skill（SKILL.md + 脚本）

## 5. Agent Adapter 抽象层

### 接口定义

```kotlin
interface AgentAdapter {
    val agentType: AgentType
    val displayName: String
    val executableNames: List<String>      // ["claude", "claude-code"]
    val acpCommand: List<String>           // ["claude", "acp"]

    suspend fun readNativeConfig(): AgentNativeConfig?
    suspend fun writeNativeConfig(config: AgentNativeConfig)

    suspend fun readMcpConfig(): Map<String, McpServerSpec>
    suspend fun writeMcpConfig(servers: Map<String, McpServerSpec>)

    fun skillsDirectory(): String          // "~/.claude/skills"

    suspend fun detect(): AgentDetectResult  // version, configPath, installed
}
```

### 实现

**ClaudeCodeAdapter：**
- 命令：`claude acp`
- 配置：`~/.claude/settings.json`
- MCP：`~/.claude.json` → `{ "mcpServers": { "name": { "type", "command", "args", "env" } } }`
- Skills：`~/.claude/skills/`

**QwenCodeAdapter：**
- 命令：`qwen --acp`
- 配置：`~/.qwen/settings.json`
- MCP：`~/.qwen/settings.json` → `{ "mcpServers": { "name": { "command", "args", "env", "httpUrl" } } }`（无 type 字段，HTTP 用 httpUrl）
- Skills：`~/.qwen/skills/`

### 扩展方式

新增 Agent 只需：
1. 创建 `XxxAdapter : AgentAdapter`
2. 实现 6 个方法
3. 注册到 `AgentAdapterFactory`

## 6. MCP 配置管理

### 统一存储格式

```json
{
  "servers": {
    "github": {
      "name": "github",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." },
      "enabledAgents": { "claude": true, "qwen": false }
    }
  }
}
```

### 同步到 Agent 原生格式

| Agent | 目标文件 | 格式差异 |
|-------|---------|---------|
| Claude | `~/.claude.json` | 标准 `type` + `command` + `args` + `env` |
| Qwen | `~/.qwen/settings.json` | 无 type 字段，HTTP 用 `httpUrl` |

## 7. UI 面板

### 四个核心面板

| 面板 | 功能 |
|------|------|
| **AgentPanel** | Agent 列表 + 状态指示灯 + 配置编辑 + 启停控制 |
| **McpPanel** | MCP Server 列表 + 添加/删除 + 工具浏览 + per-Agent 开关 |
| **SkillPanel** | Skills 列表 + 来源标签 + per-Agent 开关 + 安装到项目 |
| **SessionPanel** | 会话列表 + 消息时间线 + 新建会话 + 发送消息 |

### AgentPanel 布局

```
┌──────────────────────────────────────────────┐
│  Agent 管理                          [扫描]   │
├──────────────────────────────────────────────┤
│  🟢 Claude Code  v1.2.3    [配置] [断开]     │
│  🔴 QwenCode     未检测     [配置] [连接]     │
│  ⚪ Gemini CLI   未安装                      │
│  ⚪ Kimi Code    未安装                      │
│  ⚪ OpenCode     未安装                      │
├──────────────────────────────────────────────┤
│  配置编辑区 (选中 Agent 后显示)               │
│  ┌────────────────────────────────────────┐  │
│  │ Command: /usr/local/bin/claude         │  │
│  │ Args: [acp]                            │  │
│  │ Env: ANTHROPIC_API_KEY=***             │  │
│  │                          [保存] [取消]  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 8. 开发阶段

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase 1 | 项目骨架 + Gradle 构建系统 | ✅ 完成 |
| Phase 2 | ACP 协议层（官方 SDK 封装 + ConnectionManager） | 📋 待开始 |
| Phase 3 | Agent 管理（AgentAdapter 抽象 + Claude/Qwen 适配器 + Scanner + Registry） | 📋 待开始 |
| Phase 4 | MCP 配置管理（McpStore + AgentSync） | 📋 待开始 |
| Phase 5 | Skills 配置管理（SkillScanner + SkillStore + Agent 同步） | 📋 待开始 |
| Phase 6 | 会话历史（SessionStore + 消息持久化） | 📋 待开始 |
| Phase 7 | UI 面板（AgentPanel + McpPanel + SkillPanel + SessionPanel） | 📋 待开始 |
