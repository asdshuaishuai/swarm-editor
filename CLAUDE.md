# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swarm Editor 是一个基于 ACP (Agent Client Protocol) 协议的**多Agent协调编辑器**，Go 后端 + React/Tauri v2 桌面前端。

### 核心定位 (2026-03-31 自进化修正)
- **不是**工作流引擎 (Temporal/LangGraph/n8n)
- **是**多Agent协调编辑器 (对标 Cursor/Claude Code/Windsurf)

### 独有优势
- 多 Agent 协调 — 竞品都是单 Agent 架构
- 涌现智能 — 信息素路由 + 自组织协商
- 共识机制 — Queen Bee 投票
- 三层记忆 — Agent级 + Swarm级 + Emergence级
- 可靠性 — 熔断器 + DLQ + 重试策略 + 敏感命令拦截

### 竞品 GAP
| 优先级 | GAP | 竞品方案 | 状态 |
|--------|-----|----------|------|
| P1 | 代码库索引 | Cursor @Codebase | ✅ 已实现 |
| P2 | @Files 语法 | Cursor `@Files path` | ✅ 已实现 |
| P2 | LSP 桥接 | Cursor/Windsurf 内置 | ✅ 已实现 |
| P0 | 自动 lint 反馈 | 设计文档 S7 | ✅ 已实现 |
| P0 | 敏感命令拦截 | HITL gateway | ✅ 已实现 |
| P2 | A2A 代码补丁 | Agent 间协作 | ✅ 已实现 |
| P1 | Tauri 文件对话框 | 原生文件选择 | ✅ 已实现 |
| P3 | 内联补全 | Cursor Tab 补全 | 🚧 开发中 |
| P3 | Monaco 集成补全 | Cursor/Windsurf | 待开发 |

详细文档: `docs/SELF_EVOLUTION.md`, `internal/swarm/FEATURE_CLASSIFICATION.md`

## 常用命令

```bash
# Go 后端构建和测试
make build              # 构建所有二进制文件 (bin/swarm-editor, bin/swarm-agent)
make test               # 运行测试
make test-race          # 带 race 检测的测试
make coverage           # 生成覆盖率报告
make coverage-html      # 生成 HTML 覆盖率报告

# 单独构建
go build -o bin/swarm-editor ./cmd/swarm-editor
go build -o bin/swarm-agent ./cmd/swarm-agent

# 运行单个测试
go test -v -run TestName ./internal/swarm/...

# UI 前端 (Tauri 桌面客户端)
cd ui && npx tauri dev          # 开发运行 (Tauri 桌面窗口 + Go 后端 + Vite 热重载)
cd ui && npx tauri build        # 构建桌面安装包 (.app/.exe/.deb)
cd ui && npm run test           # 运行 UI 测试
cd ui && npm run test:coverage  # UI 测试覆盖率
# 注意: npm run dev 仅是 Vite HTTP 服务，仅供 Tauri devUrl 内部使用，不要直接用于开发验证
```

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     React UI (Tauri v2 / Vite)                   │
│  Monaco Editor | Agent Panel | Swarm Coordinator | Team Panel   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket (JSON-RPC 2.0)
┌──────────────────────────▼──────────────────────────────────────┐
│                     Go Backend (16 packages)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ api/        │  │ swarm/      │  │ agent/                  │  │
│  │ websocket   │  │ scheduler   │  │ registry, lifecycle     │  │
│  │ workspace   │  │ coordinator │  │ discovery, scanner      │  │
│  │ shadowbuf   │  │ consensus   │  │ skill_scanner           │  │
│  │ verifier    │  │ supervisor  │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ acp/        │  │ session/    │  │ a2a/, mcp/, lsp/, pair/ │  │
│  │ protocol    │  │ store       │  │ a2a: patch_channel      │  │
│  │ transport   │  │             │  │ lsp: bridge/scanner     │  │
│  │ connection  │  │             │  │ mcp: discovery/tools    │  │
│  │ throttler   │  │             │  │                         │  │
│  │ detector    │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdio/ACP
┌──────────────────────────▼──────────────────────────────────────┐
│                 External ACP Agents (6+ ACP-compatible)          │
│  Claude Code | Kimi Code | OpenCode | Cline | QwenCode | Gemini │
└─────────────────────────────────────────────────────────────────┘
```

## 核心模块

### internal/acp — ACP 协议实现
- `protocol.go`: JSON-RPC 2.0 消息类型定义
- `transport.go`: Stdio, WebSocket, TCP 传输层实现
- `connection.go`: AgentConnection 管理，会话创建和 Prompt 发送，日志节流
- `log_throttler.go`: 30Hz (~33ms) 日志批处理，10k 条目上限，溢出丢弃计数
- `sensitive_detector.go`: 19 条默认正则规则分类敏感命令（rm/sudo/curl|sh 等），RWMutex 并发安全
- Agent 通过 stdio 与编辑器通信，协议格式为 JSON-RPC 2.0

### internal/lsp — LSP 协议桥接
- `scanner.go`: 检测系统已安装的 LSP 服务器（gopls, rust-analyzer, pyright 等）
- `client.go`: LSP 客户端，支持 32+ 命令
- `manager.go`: 多语言 LSP 管理器，按文件扩展名路由到对应 LSP 服务器

### internal/agent — 智能体系统
- `agent.go`: Agent 结构体，状态管理，委托给 ACP 连接执行
- `registry.go`: Agent 注册表
- `lifecycle.go`: Agent 生命周期管理
- `discovery.go`: 自动发现和连接外部 ACP Agent
- `scanner.go`: Agent CLI 自动扫描（PATH + 常见安装路径）
- `skill_scanner.go`: 技能扫描（文件系统 + MCP 工具 + Agent 能力）

### internal/swarm — 蜂群协调
- `scheduler.go`: 智能任务调度，4 种负载均衡策略，动态重平衡
- `coordinator.go`: 多 Agent 任务协调，任务分解，结果收集
- `supervisor.go`: Agent 健康监控，卡住检测，心跳追踪
- `consensus.go`: Queen Bee 结果共识机制
- `task.go`: 任务定义和队列

### internal/api — WebSocket API
- `websocket_server.go`: WebSocket 服务，163 个命令路由
- `handler_agent.go`: Agent 管理 + ShadowBuffer 提交 + 自动验证 + 敏感命令拦截
- `handler_a2a.go`: A2A 协议路由 + 代码补丁发送
- `shadowbuffer.go`: 内存中补丁暂存（Stage/Commit/Reject）+ 验证状态追踪
- `verifier.go`: 文件类型路由 linter（go vet / tsc / pylint），最大 3 次重试 + HITL 升级
- `workspace.go`: 工作区管理，文件锁定，光标同步
- `emergence.go`: 涌现仪表板数据

### internal/a2a — Agent 间协议
- `protocol.go`: A2A 消息类型和路由
- `coordinator.go`: Agent 卡片发现和消息路由
- `patch_channel.go`: 代码补丁点对点传输（MessageTypeCodePatch/Ack）

### internal/session — 会话持久化
- JSON 文件存储，消息历史

### ui/ — React 前端
- `src/panels/`: 42 个面板组件（Agent/Swarm/MCP/Terminal/Diff/Symbol 等）
- `src/components/`: 116 个共享组件（layouts/MainLayout 三列设计等）
- `src/stores/`: 16 个 Zustand store（monitoring/agent/workspace 等）
- `src/hooks/`: 35 个自定义 hooks（useEditorWindowEvents/useCommandPaletteEvents 等）
- `src/services/`: 12 个 API 服务层（WebSocket client + lspApi + monitoringApi）
- `src/utils/`: 26 个工具函数（monacoLSP/fileReference/等）

## 配置

Agent 配置文件位于 `~/.swarm-editor/agents.json`，定义外部 Agent 的命令、参数、环境变量、角色和优先级。

当前已配置 6 个 ACP 兼容 Agent：Claude Code、Kimi Code、OpenCode、Cline、QwenCode、Gemini CLI。

MCP Server 发现路径：
- 全局: `~/.claude/mcp.json`, `~/.config/claude-code/mcp.json`, `~/.config/cursor/mcp.json`, `~/.swarm-editor/mcp.json`
- 项目: `.swarm-editor/mcp.json`, `.mcp.json`, `.claude/mcp.json`

## 测试约定

- Go 测试使用 `_test.go` 后缀（169 个测试文件，133 个源文件）
- UI 测试使用 Vitest + React Testing Library（127 个测试文件，6376 个用例）
- 测试中使用 `vi.useFakeTimers()` 时，用 `vi.advanceTimersByTimeAsync()` 代替 `waitFor`
- ShadowBuffer stage ID 使用 `agentID-path-timestamp-monotonicCounter` 格式防止碰撞
- SensitiveDetector 并发安全：读用 `RLock`，写用 `Lock`
- LogThrottler 上限 `MaxPendingEntries=10000`，超出丢弃并计入 `Dropped()`

## 关键设计决策

- **ShadowBuffer**: 内存中暂存 Agent 代码变更，提交时先写磁盘再自动 lint 验证
- **Verifier**: 文件类型路由（.go→go vet, .ts→tsc, .py→pylint），最多 3 次重试，失败升级 HITL
- **SensitiveDetector**: 19 条正则规则 + 自定义扩展，post-hoc 审计（非预拦截）
- **A2A Patch Channel**: 使用 `Enqueue`（非 `Send`）触发已注册 handler，单一数据源
- **路径安全**: 所有文件操作通过 `safePath()` 防止目录遍历
- **Windows 兼容**: Tauri 文件对话框路径使用 `replace(/\\/g, '/')` 标准化

## 自进化历史

### Round 6365 (2026-05-26) — P0-1 Auto Lint + Audit Fixes
- **自动 lint 反馈循环**: verifier.go 文件类型路由 linter + shadowbuffer 验证状态
- **A2A 代码补丁通道**: patch_channel.go 点对点补丁传输
- **敏感命令拦截**: sensitive_detector.go 19 条规则
- **日志节流**: log_throttler.go 30Hz 批处理
- **19 点审查修复**: path traversal, Windows 路径, OnUpdate 泄漏, A2A 双重暂存
- **质量验证**: 6365 UI tests PASS, Go test -race PASS, staticcheck CLEAN

### Round 5912 (2026-04-03) — LSP Provider 提取
- **LSP 桥接**: 32+ 命令，monacoLSP.ts 从 EditorPanel 提取
- **EditorPanel**: 5,181 → 2,491 行 (-52%)

### Round 4781 (2026-03-31) — 方向修正
- **从"工作流引擎"回归"多Agent协调编辑器"**
- 竞品对标: Cursor / Claude Code / Windsurf

### Round 562 (2026-03-28) — 基础设施
- Tauri 编译错误修复，TeamPanel/SettingsPanel 测试覆盖

---

*自进化永不停歇*
