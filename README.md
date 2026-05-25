# Swarm Editor — 多 Agent 协调编辑器

Swarm Editor 是一款**多 Agent 协调桌面编辑器**，不对标任何工具，其核心差异与常规agent工作流或工具的区别在于**多 Agent 调度与共识**（调度/涌现/共识），而非传统的工作流引擎（Temporal / LangGraph / n8n）。

编辑器作为 **ACP 协调中心**，通过配置文件接入外部 CLI Agent（如 Claude Code、Kimi Code、OpenCode 等），利用蜂群智能调度多个 Agent 协同完成复杂开发任务。它不是IDE而是Agent工作台，也是 Agent 编排层。

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

- **不是** 工作流引擎。我们不拖放节点、不定义 DAG、不编排预定义步骤序列。
- **不是** 单 Agent 聊天界面。我们不把用户请求丢给一个 Agent 就结束。

### 是什么

- **是** 一个能同时驱动多个外部 Agent 的编辑器，Agent 之间可以协商、投票、分工。
- **是** 一套基于**信息素路由**和**自组织协商**的涌现智能系统。
- **是** 一个带 **Queen Bee 共识机制**的多 Agent 决策层。
- **是** 一个具备 **三层记忆**（Agent 级 / Swarm 级 / Emergence 级）的上下文感知系统。
- **是** 一个工程化程度较高的桌面应用：熔断、重试、DLQ（死信队列）、Race 检测、覆盖率门禁。

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
│  │  │ CodeMirror │  │ 42+ Panels │  │ Zustand    │  │ WebSocket      │  │  │
│  │  │ Editor     │  │ (Agent/    │  │ Stores     │  │ Client         │  │  │
│  │  │            │  │  Swarm/    │  │            │  │ (JSON-RPC 2.0) │  │  │
│  │  │            │  │  Terminal) │  │            │  │                │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐  │
│  │              Go 后端 (3 个二进制入口)                                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ api/         │  │ swarm/       │  │ agent/                      │  │  │
│  │  │ WebSocket    │  │ Scheduler    │  │ Registry, Lifecycle,        │  │  │
│  │  │ Handlers     │  │ Coordinator  │  │ Discovery, Scanner          │  │  │
│  │  │ (20+ 路由)   │  │ Consensus    │  │                             │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ acp/         │  │ mcp/         │  │ lsp/                        │  │  │
│  │  │ JSON-RPC 2.0 │  │ Server       │  │ Bridge                      │  │  │
│  │  │ over stdio   │  │ Discovery    │  │ (Client/Manager/Scanner)    │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ session/     │  │ terminal/    │  │ context/                    │  │  │
│  │  │ JSON 持久化  │  │ PTY (creack/ │  │ Codebase Indexer,           │  │  │
│  │  │              │  │  pty)        │  │ @Files, Symbols             │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ team/        │  │ audit/       │  │ a2a/, pair/                 │  │  │
│  │  │ Roles,       │  │ Audit Logs   │  │ Agent-to-Agent,             │  │  │
│  │  │ Permissions  │  │              │  │ Pair Programming            │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       ┌──────────┐          ┌──────────┐          ┌──────────┐
       │ Claude   │          │ Kimi     │          │ Custom   │
       │ Code CLI │          │ Code CLI │          │ Agent    │
       └──────────┘          └──────────┘          └──────────┘
       External ACP Agents (Configured via ~/.swarm-editor/agents.json)
```

### 两条 UI ↔ 后端链路

本项目同时存在两条通信路径，排查问题时请先确认当前运行的是哪条：

1. **Tauri 桌面链路（推荐开发方式）**
   - JS/React UI → Tauri Command → Rust 层
   - Rust 层启动 Go 后端二进制（开发态默认 `bin/swarm-editor`）
   - Rust ↔ Go 的调用通过 ACP（详见 `ui/src-tauri/src/swarm/bridge.rs` 顶部注释）
   - UI 与 Go 后端之间也走 WebSocket（已重构，移除 Tauri 原生依赖）

2. **独立 WebSocket Server 链路**
   - 纯 WebSocket JSON-RPC 2.0，默认 `:8080`
   - 入口：`cmd/ws-server/main.go`
   - 可用于无桌面环境测试、CI、远程部署

---

## 核心子系统

### 1. ACP — Agent Client Protocol

**协议**: JSON-RPC 2.0 over stdio

编辑器通过 ACP 与外部 CLI Agent 通信。每个 Agent 都是一个独立进程，编辑器管理其生命周期（启动/监控/重启/熔断）。

**核心流程**:
1. `ConnectionManager.Connect(ctx, agentID)` → 启动 CLI 子进程 → stdio 连接
2. `conn.CreateSession(ctx, mode)` → 创建 ACP 会话（SessionID）
3. `conn.SendPrompt(ctx, sessionID, prompt)` → 发送消息（支持 text/image/tool_use blocks）
4. `client.OnUpdate` 回调将流式内容累积到 session
5. `conn.CloseSession(ctx, sessionID)` → 关闭会话，内容持久化到 JSON

**已支持自动扫描的 Agent CLI**（10 个）：
Claude Code、Kimi Code、OpenCode、Cline、Qwen Code、Gemini CLI、Crush CLI、Droid CLI 等。

**代码位置**: `internal/acp/` — `config.go`, `connection.go`, `protocol.go`, `client.go`

### 2. Swarm — 蜂群智能调度

多 Agent 协调的核心层，不是简单的任务分发，而是带策略的群体智能。

**Scheduler** (`internal/swarm/scheduler.go`):
- 4 种负载均衡策略：`round_robin`、`least_loaded`、`priority`、`capability`
- 任务优先级队列 + 自动任务分解
- 结果聚合与失败重分配

**Coordinator** (`internal/swarm/coordinator.go`):
- 主 Agent 选举机制（Coordinator Agent）
- 任务分解与 Worker Agent 分配
- 进度监控与状态同步

**Consensus Engine** (`internal/swarm/consensus.go`):
- Queen Bee 投票机制：多个 Agent 对同一任务给出结果，通过投票达成共识
- 可配置共识阈值与冲突解决策略

**Supervisor / Monitor** (`internal/swarm/supervisor.go`, `monitor.go`):
- Agent 健康检查、心跳超时、自动隔离
- 任务执行监控面板数据供给

**代码位置**: `internal/swarm/` — 调度器、协调器、共识、监控、监督器、任务队列等

### 3. MCP — Model Context Protocol

编辑器作为 MCP **Client**，发现和管理外部 MCP Server，将 Server 提供的工具暴露给 Agent 使用。

**能力**:
- MCP Server 自动发现（文件系统扫描 + 配置读取）
- 工具浏览与调用（UI 面板支持查看工具列表、参数、执行）
- 与 Agent 能力系统的联动（Skill 扫描时合并 MCP 工具）

**代码位置**: `internal/mcp/` — `client.go`, `discovery.go`, `tool.go`

### 4. LSP Bridge

将语言服务器（LSP）能力桥接到 CodeMirror 6，支持多语言。

**规模**: 32+ 个 LSP 命令支持（`textDocument/completion`, `textDocument/definition`, `textDocument/hover`, `workspace/symbol` 等）

**组件**:
- `internal/lsp/client.go` — LSP 客户端
- `internal/lsp/manager.go` — 多服务器管理（按语言/工作区）
- `internal/lsp/scanner.go` — 自动扫描系统 PATH 中的语言服务器

### 5. Session 管理

ACP 会话的消息历史持久化。

- 存储格式：JSON 文件
- 按 SessionID 组织，支持会话列表、加载、导出
- 与 Agent 对话面板联动，支持多轮上下文回溯

**代码位置**: `internal/session/`

### 6. Terminal / PTY

基于 `creack/pty` 的伪终端集成，前端使用 `xterm.js`。

- 真实 Shell 会话（bash/zsh/fish）
- 与 Agent 共享工作目录
- 支持多 Tab、命令历史、环境变量继承

**代码位置**: `internal/terminal/`, `ui/src/panels/TerminalPanel.tsx`

### 7. Context / 代码库索引

为 Agent 提供项目级上下文理解能力。

**Indexer** (`internal/context/indexer.go`):
- 递归扫描项目目录，排除 `node_modules/vendor/.git`
- 提取符号定义（函数、类、接口），支持 Go/TS/JS/Python/Rust
- 构建文件依赖图

**`@Files` 语法** (`ui/src/utils/fileReference.ts`):
- 在 AgentPanel 输入框中支持 `@Files path/to/file.go`
- 自动解析路径、读取内容、注入到 Prompt 上下文
- 支持 glob 模式（如 `@Files src/**/*.ts`）
- 文件选择器组件带键盘导航与自动补全

### 8. 可靠性工程

- **熔断器** (`internal/swarm/circuit_breaker.go`): Agent 连续失败时自动熔断，防止级联故障
- **重试/超时**: 指数退避重试，可配置超时策略
- **DLQ** (Dead Letter Queue): 最终失败的任务进入死信队列，支持人工审计与重放
- **Race 检测**: `make test-race` 通过才允许合并

---

## 功能全景

### 已完全实现（Phase 1-4）

| 领域 | 功能 |
|------|------|
| **编辑器** | CodeMirror 6、多标签编辑、Diff 视图、文件树 Explorer |
| **Git** | 17 个 Git 命令集成（status/diff/log/commit/branch 等） |
| **终端** | xterm.js PTY 终端，多 Tab |
| **Agent** | ACP 协议、Agent 注册表、10 个 CLI 自动扫描、配置面板 |
| **MCP** | Server 发现、工具浏览、工具调用 |
| **Swarm** | 调度器（4 策略）、协调器、共识（Queen Bee）、监控器 |
| **LSP** | 32+ 命令、多语言、自动扫描语言服务器 |
| **上下文** | 代码库索引、`@Codebase`、`@Files` 语法、glob 支持 |
| **会话** | Session 创建/发送/关闭、JSON 持久化、历史回溯 |
| **团队** | Team 管理、角色、权限 |
| **审计** | 审计日志 |
| **面板** | 42+ React 面板组件（Agent/Swarm/MCP/Terminal/Settings 等） |

### 进行中 / 规划中

| Phase | 目标 | 状态 |
|-------|------|------|
| **Phase 5** | 内联智能（Tab 补全、Ghost Text、多行补全） | 🚧 进行中 |
| **Phase 6** | 多文件编辑（批量修改、变更预览、Accept/Reject） | 📋 规划中 |
| **Phase 7** | Background Agent（异步任务队列、后台执行） | 📋 规划中 |
| **Phase 8** | 上下文增强（语义索引/Embedding、依赖图、知识图谱） | 📋 规划中 |
| **Phase 9** | 协作与部署（多用户实时协作、权限、CI/CD） | 📋 规划中 |

---

## 快速开始

### 依赖

- **Go 1.25.0**（硬性要求，见 `go.mod`）
- **Node.js**（UI 构建与测试）
- **Rust**（仅 Tauri 桌面构建需要；纯 Go 后端开发/测试可不装）
- Linux 下构建 Tauri 可能需要 `webkit2gtk-4.1` 等系统依赖（`build.sh` 会提示安装命令）

### 推荐：桌面端开发（Tauri）

```bash
# 1) 先构建 Go 后端 sidecar（二进制会被 Tauri 侧调用）
make build

# 2) 安装前端依赖
 cd ui
npm install

# 3) 启动桌面开发（先跑 Vite dev server，再启动 Tauri 窗口）
npx tauri dev
```

> ⚠️ **注意**：`cd ui && npm run dev` 只是 Vite HTTP 服务，主要用于 Tauri 的 `beforeDevCommand`，**不要把它当成完整的桌面端开发验证方式**。Tauri 开发模式读取 `ui/src-tauri/tauri.conf.json`：
> - `devUrl`: `http://localhost:1420`
> - `beforeDevCommand`: `npm run dev`

### 可选：仅启动独立 WebSocket Server

```bash
# 入口: cmd/ws-server/main.go
go run ./cmd/ws-server
# 默认监听 :8080（WebSocketConfig 默认值见 internal/api/websocket_server.go）
```

### 配置外部 Agent

首次启动前，在 `~/.swarm-editor/agents.json` 中配置你的 Agent：

```json
{
  "agents": {
    "claude-code": {
      "id": "claude-code",
      "name": "Claude Code",
      "enabled": true,
      "command": "/usr/local/bin/claude-code",
      "args": ["acp"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      },
      "swarmConfig": {
        "canBeCoordinator": true,
        "canBeWorker": true,
        "preferredRoles": ["coder", "architect"],
        "maxConcurrent": 3,
        "priority": 10
      },
      "tags": ["primary", "coding"]
    }
  }
}
```

配置完成后，在编辑器的 **Agent Scanner 面板**（3 个 Tab：Agents / MCP / Skills）中可看到已发现的 Agent 和 MCP Server。

---

## 开发命令速查

### Go 后端

```bash
make build              # 构建 bin/swarm-editor, bin/swarm-agent
make build-editor       # 仅构建 bin/swarm-editor
make build-agent        # 仅构建 bin/swarm-agent

make test               # 运行全部 Go 测试 (./internal/... ./pkg/...)
make test-race          # 带 race 检测器运行测试
make coverage           # 生成 coverage.out + 摘要
make coverage-html      # 生成 HTML 覆盖率报告
make vet                # go vet
make lint               # staticcheck
make fmt                # gofmt -s -w

make ci                 # fmt → vet → lint → test-race → coverage → ui-test → build
```

### UI 前端

```bash
cd ui && npm install

# 桌面开发（推荐）
cd ui && npx tauri dev

# 仅前端构建
cd ui && npm run build       # tsc && vite build

# 测试
cd ui && npm run test        # vitest run
cd ui && npm run test:coverage
```

---

## 项目状态与路线图

> 最后更新: 2026-05-17 | 当前版本: R5933 | 连续通过: 715 轮 CI

- **测试覆盖**: Go 后端 155+ 测试文件，UI 前端 126 测试文件 / 1028+ 用例
- **代码规模**: 17 个后端核心包，42+ 前端面板组件，3 个二进制入口
- **当前阶段**: Phase 5「内联智能」（Tab 补全、Ghost Text）

详细路线图见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](AGENTS.md) | **开发者速查** — 构建命令、目录边界、运营陷阱 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 系统架构图、核心组件说明、数据流、配置示例 |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code 专属指引（项目定位、常用命令、架构速览） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 编码规范、阶段路线图、文件组织标准 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 完整路线图（Phase 1-9）、竞品对标进度 |
| [`docs/SELF_EVOLUTION.md`](docs/SELF_EVOLUTION.md) | 自进化报告、竞品 GAP 分析、已实现功能清单 |
| [`docs/WIKI.md`](docs/WIKI.md) | 项目 Wiki — 核心模块详解、ACP 流程、MCP 说明 |
| [`docs/P10-ARCHITECTURE-REVIEW.md`](docs/P10-ARCHITECTURE-REVIEW.md) | Agent CLI 配置调研、7 个主流 CLI 的格式解析 |
| [`docs/competitor-analysis.md`](docs/competitor-analysis.md) | Dify / n8n / LangGraph / Temporal / CrewAI 深度分析 |

---

## 许可证

MIT
