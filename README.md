# Swarm Editor — 多 Agent 协调编辑器

Swarm Editor 是一款**多 Agent 协调桌面编辑器**，其核心差异在于**多 Agent 调度与共识**（调度/涌现/共识），而非传统的工作流引擎（Temporal / LangGraph / n8n）。

编辑器作为 **ACP 协调中心**，通过配置文件接入外部 CLI Agent（如 Claude Code、Kimi Code、OpenCode 等），利用蜂群智能调度多个 Agent 协同完成复杂开发任务。它不是 IDE 而是 Agent 工作台，也是 Agent 编排层。

> **开发者提示**：如果你是在本仓库写代码的 AI Agent，建议先读 `AGENTS.md`（开发命令、目录边界、常见坑）。

---

## 目录

- [核心定位](#核心定位)
- [技术架构](#技术架构)
- [核心子系统](#核心子系统)
- [功能全景](#功能全景)
- [快速开始](#快速开始)
- [开发命令速查](#开发命令速查)
- [配置说明](#配置说明)
- [项目状态与路线图](#项目状态与路线图)
- [文档索引](#文档索引)

---

## 核心定位

### 不是什么

- **不是** 工作流引擎。不拖放节点、不定义 DAG、不编排预定义步骤序列。
- **不是** 单 Agent 聊天界面。不把用户请求丢给一个 Agent 就结束。

### 是什么

- **是** 一个能同时驱动多个外部 Agent 的编辑器，Agent 之间可以协商、投票、分工。
- **是** 一套基于**信息素路由**和**自组织协商**的涌现智能系统。
- **是** 一个带 **Queen Bee 共识机制**的多 Agent 决策层。
- **是** 一个具备 **三层记忆**（Agent 级 / Swarm 级 / Emergence 级）的上下文感知系统。
- **是** 一个工程化程度较高的桌面应用：熔断、重试、DLQ、敏感命令拦截、自动 lint 验证、Race 检测。

### 与竞品的差异

| 能力 | Cursor | Claude Code | Windsurf | **Swarm Editor** |
|------|--------|-------------|----------|------------------|
| 代码编辑 | ✅ Monaco | ✅ | ✅ Monaco | ✅ **CodeMirror 6** |
| Agent 对话 | ✅ Chat | ✅ | ✅ Cascade | ✅ AgentPanel |
| 终端集成 | ✅ | ✅ | ✅ | ✅ xterm.js |
| MCP 支持 | ✅ | ✅ | ✅ | ✅ |
| LSP 支持 | ✅ | ✅ | ✅ | ✅ 32+ 命令 |
| 多 Agent 协调 | ⚠️ Background | ⚠️ Multi-turn | ❌ | ✅ **独有** |
| 共识机制 | ❌ | ❌ | ❌ | ✅ **独有** |
| 涌现智能 | ❌ | ❌ | ❌ | ✅ **独有** |
| 代码库索引 | ✅ @Codebase | ✅ | ✅ | ✅ `@Codebase` |
| `@Files` 语法 | ✅ | ✅ | ✅ | ✅ 已集成 |
| Diff 应用 | ✅ Apply | ✅ | ✅ | ✅ Workspace |
| 自动 lint 验证 | ❌ | ❌ | ❌ | ✅ **独有** |
| 敏感命令拦截 | ❌ | ❌ | ❌ | ✅ **独有** |
| A2A 代码补丁 | ❌ | ❌ | ❌ | ✅ **独有** |
| 内联补全 | ✅ Tab | ✅ | ✅ | 🚧 Phase 5 开发中 |
| Background Agent | ✅ 2025 Q4 | ✅ | ❌ | 🚧 Phase 7 规划中 |

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tauri v2 桌面壳 (Rust)                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    React 18 前端 (Vite + TypeScript)                   │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │  │
│  │  │ CodeMirror │  │ 42 Panels  │  │ 16 Zustand │  │ WebSocket      │  │  │
│  │  │ Editor     │  │ +116 Comps │  │ Stores     │  │ Client         │  │  │
│  │  │            │  │            │  │            │  │ (JSON-RPC 2.0) │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐  │
│  │              Go 后端 (16 packages, 3 binaries, 163 命令)               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ api/         │  │ swarm/       │  │ agent/                      │  │  │
│  │  │ WebSocket    │  │ Scheduler    │  │ Registry, Lifecycle,        │  │  │
│  │  │ 163 routes   │  │ Coordinator  │  │ Discovery, Scanner,         │  │  │
│  │  │ ShadowBuffer │  │ Consensus    │  │ SkillScanner                │  │  │
│  │  │ Verifier     │  │ Supervisor   │  │                             │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ acp/         │  │ a2a/         │  │ lsp/                        │  │  │
│  │  │ JSON-RPC 2.0 │  │ Agent-to-    │  │ Bridge                      │  │  │
│  │  │ LogThrottler │  │ Agent Proto  │  │ (32+ commands)              │  │  │
│  │  │ SensitiveDet │  │ PatchChannel │  │                             │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ mcp/         │  │ session/     │  │ terminal/, context/,        │  │  │
│  │  │ Discovery    │  │ JSON Store   │  │ team/, audit/, pair/        │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               ▼                     ▼                     ▼
        ┌──────────┐          ┌──────────┐          ┌──────────┐
        │ Claude   │          │ Kimi     │          │ Gemini   │
        │ Code CLI │          │ Code CLI │          │ CLI      │
        └──────────┘          └──────────┘          └──────────┘
        External ACP Agents (6+ compatible, ~/.swarm-editor/agents.json)
```

### 两条 UI ↔ 后端链路

1. **Tauri 桌面链路（推荐）**
   - React UI → Tauri Command → Rust 层 → Go 后端
   - UI 与 Go 后端之间走 WebSocket（JSON-RPC 2.0）

2. **独立 WebSocket Server 链路**
   - 纯 WebSocket JSON-RPC 2.0，默认 `:8080`
   - 入口：`cmd/ws-server/main.go`
   - 适用于无桌面环境测试、CI、远程部署

---

## 核心子系统

### 1. ACP — Agent Client Protocol

**协议**: JSON-RPC 2.0 over stdio

编辑器通过 ACP 与外部 CLI Agent 通信。每个 Agent 都是独立进程，编辑器管理其生命周期（启动/监控/重启/熔断）。

**核心流程**:
1. `ConnectionManager.Connect(ctx, agentID)` → 启动 CLI 子进程 → stdio 连接
2. `conn.CreateSession(ctx, mode)` → 创建 ACP 会话
3. `conn.SendPrompt(ctx, sessionID, prompt)` → 发送消息
4. `client.OnUpdate` 回调 → 流式内容累积 → 日志节流（30Hz）→ 敏感命令拦截
5. `conn.CloseSession(ctx, sessionID)` → 关闭会话，JSON 持久化

**ACP 兼容 Agent**（6+）: Claude Code (`claude acp`), Kimi Code (`kimi acp`), OpenCode (`opencode acp`), Cline (`cline --acp`), QwenCode (`qwen --acp`), Gemini CLI (`gemini --acp`)

**代码位置**: `internal/acp/`

**关键组件**:
- `connection.go` — AgentConnection 管理，日志节流集成，OnUpdate 拦截器（带哨兵标志防泄漏）
- `log_throttler.go` — 30Hz 批处理，10k 条目上限，溢出丢弃计数
- `sensitive_detector.go` — 19 条默认正则规则 + 自定义扩展，RWMutex 并发安全

### 2. Swarm — 蜂群智能调度

多 Agent 协调的核心层，带策略的群体智能。

- **Scheduler** — 4 种负载均衡策略 (`round_robin`, `least_loaded`, `priority`, `capability`)，任务优先级队列，动态重平衡
- **Coordinator** — 主 Agent 选举，任务分解与 Worker 分配
- **Consensus** — Queen Bee 投票机制，可配置共识阈值
- **Supervisor** — 健康检查、心跳超时、自动隔离

**代码位置**: `internal/swarm/`

### 3. ShadowBuffer — 代码变更暂存

内存中的 Agent 代码变更管理（Stage → Verify → Commit/Reject）。

**流程**: Agent 提交补丁 → Stage 到 ShadowBuffer → 写入磁盘 → 自动 lint 验证（go vet / tsc / pylint） → 最多 3 次重试 → 失败升级 HITL

**代码位置**: `internal/api/shadowbuffer.go`, `internal/api/verifier.go`

### 4. A2A — Agent 间通信

Agent 间点对点代码补丁传输协议。

- `patch_channel.go` — `MessageTypeCodePatch` / `Ack`，通过 Router.Enqueue 触发注册 handler
- `coordinator.go` — Agent 卡片发现与消息路由

**代码位置**: `internal/a2a/`

### 5. MCP — Model Context Protocol

编辑器作为 MCP **Client**，发现和管理外部 MCP Server。

- 自动发现（全局 `~/.claude/mcp.json` + 项目 `.swarm-editor/mcp.json`）
- 工具浏览与调用，与 Agent 能力系统联动

**代码位置**: `internal/mcp/`

### 6. LSP Bridge

语言服务器能力桥接到 CodeMirror 6，32+ 命令，多语言自动扫描。

**代码位置**: `internal/lsp/` — `client.go`, `manager.go`, `scanner.go`

### 7. Context / 代码库索引

- **Indexer**: 递归扫描，符号提取（Go/TS/JS/Python/Rust），文件依赖图
- **@Files 语法**: `@Files path/to/file.go`，glob 模式，键盘导航自动补全

**代码位置**: `internal/context/`, `ui/src/utils/fileReference.ts`

### 8. 可靠性工程

- **熔断器**: Agent 连续失败时自动熔断
- **重试/超时**: 指数退避
- **DLQ**: 死信队列，人工审计与重放
- **敏感命令拦截**: 19 条正则规则，post-hoc 审计
- **路径安全**: `safePath()` 防目录遍历，Windows 路径标准化
- **Race 检测**: `make test-race` 全量通过

---

## 功能全景

### 已完全实现

| 领域 | 功能 |
|------|------|
| **编辑器** | CodeMirror 6、多标签编辑、Diff 视图、文件树 Explorer、符号大纲 |
| **Git** | 17 个 Git 命令集成 |
| **终端** | xterm.js PTY 终端，多 Tab |
| **Agent** | ACP 协议、6+ Agent 自动扫描、配置面板、技能扫描 |
| **MCP** | Server 发现、工具浏览、工具调用 |
| **Swarm** | 调度器（4 策略）、协调器、共识（Queen Bee）、监控器 |
| **LSP** | 32+ 命令、多语言、自动扫描 |
| **代码变更** | ShadowBuffer 暂存、自动 lint 验证、3 次重试 + HITL 升级 |
| **安全** | 敏感命令拦截（19 规则）、路径遍历防护 |
| **A2A** | Agent 间代码补丁传输、消息路由 |
| **上下文** | 代码库索引、`@Codebase`、`@Files`、glob |
| **会话** | Session 持久化、历史回溯 |
| **团队** | Team 管理、角色、权限 |
| **面板** | 42 面板 + 116 共享组件（三列 MainLayout） |
| **日志** | 30Hz 节流推送、10k 缓冲上限 |

### 进行中 / 规划中

| Phase | 目标 | 状态 |
|-------|------|------|
| **Phase 5** | 内联智能（Tab 补全、Ghost Text） | 🚧 进行中 |
| **Phase 6** | 多文件编辑（批量修改、变更预览） | 📋 规划中 |
| **Phase 7** | Background Agent（异步任务队列） | 📋 规划中 |
| **Phase 8** | 上下文增强（语义索引/Embedding） | 📋 规划中 |
| **Phase 9** | 协作与部署（多用户实时协作） | 📋 规划中 |

---

## 快速开始

### 依赖

- **Go 1.25.0**（硬性要求）
- **Node.js**（UI 构建与测试）
- **Rust**（仅 Tauri 桌面构建需要；纯 Go 后端开发/测试可不装）

### 推荐：桌面端开发（Tauri）

```bash
# 1) 构建 Go 后端 sidecar
make build

# 2) 安装前端依赖
cd ui && npm install

# 3) 启动桌面开发
npx tauri dev
```

> `npm run dev` 只是 Vite HTTP 服务，供 Tauri `devUrl` 内部使用，**不要直接用于开发验证**。

### 可选：独立 WebSocket Server

```bash
go run ./cmd/ws-server    # 默认 :8080
```

### 配置外部 Agent

在 `~/.swarm-editor/agents.json` 中配置 Agent：

```json
{
  "agents": {
    "claude-code": {
      "id": "claude-code",
      "name": "Claude Code",
      "enabled": true,
      "command": "/usr/local/bin/claude",
      "args": ["acp"],
      "env": { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" },
      "swarmConfig": {
        "canBeCoordinator": true,
        "canBeWorker": true,
        "preferredRoles": ["coder", "architect"],
        "maxConcurrent": 3,
        "priority": 10
      }
    }
  }
}
```

配置完成后，在 **Agent Scanner 面板**（Agents / MCP / Skills 三个 Tab）中查看已发现的 Agent。

---

## 开发命令速查

```bash
# Go 后端
make build              # 构建 bin/swarm-editor, bin/swarm-agent
make test               # 全部 Go 测试
make test-race          # 带 race 检测
make coverage           # 覆盖率报告
make vet                # go vet
make lint               # staticcheck
make ci                 # 完整 CI 流水线

# UI 前端
cd ui && npm install
cd ui && npx tauri dev  # 桌面开发
cd ui && npm run test   # vitest (6376 tests)
```

---

## 项目状态与路线图

> 最后更新: 2026-05-26 | 当前版本: R6365

| 指标 | 数值 |
|------|------|
| Go 源文件 | 133 |
| Go 测试文件 | 169 |
| Go packages | 23 |
| UI 源文件 | 129 |
| UI 测试文件 | 127 |
| UI 测试用例 | 6,376 |
| API 命令路由 | 163 |
| 前端面板组件 | 42 |
| 前端共享组件 | 116 |
| 总代码行数 | ~289k (Go 167k + UI 121k) |

详细路线图见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](AGENTS.md) | **开发者速查** — 构建命令、目录边界、运营陷阱 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 系统架构图、核心组件说明、数据流 |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code 指引（架构、设计决策、自进化历史） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 编码规范、文件组织标准 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 完整路线图（Phase 1-9） |
| [`docs/SELF_EVOLUTION.md`](docs/SELF_EVOLUTION.md) | 自进化报告、竞品 GAP 分析 |

---

## 许可证

MIT
