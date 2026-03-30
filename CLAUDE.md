# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swarm Editor 是一个基于 ACP (Agent Client Protocol) 协议的**多Agent协调编辑器**。

### 核心定位 (2026-03-31 自进化修正)
- **不是**工作流引擎 (Temporal/LangGraph/n8n)
- **是**多Agent协调编辑器 (对标 Cursor/Claude Code/Windsurf)

### 独有优势
- 多 Agent 协调 - 竞品都是单 Agent 架构
- 涌现智能 - 信息素路由 + 自组织协商
- 共识机制 - Queen Bee 投票
- 三层记忆 - Agent级 + Swarm级 + Emergence级
- 可靠性 - 熔断器 + DLQ + 重试策略

### 竞品 GAP (待开发)
| 优先级 | GAP | 竞品方案 |
|--------|-----|----------|
| P1 | 代码库索引 | Cursor @Codebase, Windsurf 深度索引 |
| P2 | @Files 语法 | Cursor `@Files path` 引用文件 |
| P3 | 内联补全 | Cursor Tab 补全 |

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

# UI 前端
cd ui && npm run dev    # 开发服务器
cd ui && npm run test   # 运行 UI 测试
cd ui && npm run test:coverage  # UI 测试覆盖率
cd ui && npm run build  # 生产构建
```

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     React UI (Tauri/Vite)                        │
│  Monaco Editor | Agent Panel | Swarm Coordinator | Team Panel   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket (已重构，移除 Tauri 依赖)
┌──────────────────────────▼──────────────────────────────────────┐
│                     Go Backend                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ api/        │  │ swarm/      │  │ agent/                  │  │
│  │ websocket   │  │ scheduler   │  │ registry, lifecycle     │  │
│  │ workspace   │  │ coordinator │  │ discovery               │  │
│  │ team        │  │ supervisor  │  │                         │  │
│  │ emergence   │  │ consensus   │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ acp/        │  │ session/    │  │ a2a/, mcp/, lsp/, pair/ │  │
│  │ protocol    │  │ store       │  │                         │  │
│  │ transport   │  │             │  │                         │  │
│  │ connection  │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdio/ACP
┌──────────────────────────▼──────────────────────────────────────┐
│                 External ACP Agents                              │
│                 (Claude Code CLI, Custom Agents)                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心模块

### internal/acp - ACP 协议实现
- `protocol.go`: JSON-RPC 2.0 消息类型定义
- `transport.go`: Stdio, WebSocket, TCP 传输层实现
- `connection.go`: AgentConnection 管理，会话创建和 Prompt 发送
- Agent 通过 stdio 与编辑器通信，协议格式为 JSON-RPC 2.0

### internal/agent - 智能体系统
- `agent.go`: Agent 结构体，状态管理，委托给 ACP 连接执行
- `registry.go`: Agent 注册表
- `lifecycle.go`: Agent 生命周期管理
- `discovery.go`: 自动发现和连接外部 ACP Agent

### internal/swarm - 蜂群协调
- `scheduler.go`: 智能任务调度，支持多种负载均衡策略（round_robin, least_loaded, priority, capability），动态重平衡
- `coordinator.go`: 多 Agent 任务协调，任务分解，结果收集
- `supervisor.go`: Agent 健康监控，卡住检测，心跳追踪
- `consensus.go`: 结果共识机制
- `task.go`: 任务定义和队列

### internal/api - HTTP/WebSocket API
- `websocket_server.go`: WebSocket 服务，命令处理
- `workspace.go`: 工作区管理，文件锁定，光标同步
- `team.go`: 团队管理，角色权限
- `emergence.go`: 涌现仪表板数据

### internal/session - 会话持久化
- JSON 文件存储，消息历史

### ui/ - React 前端
- `src/panels/`: 主要面板组件
- `src/services/`: WebSocket 客户端和 API 调用
- `src/stores/`: Zustand 状态管理

## 配置

Agent 配置文件位于 `~/.swarm-editor/agents.json`，定义外部 Agent 的命令、参数、环境变量、角色和优先级。

## 测试约定

- Go 测试使用 `_test.go` 后缀
- UI 测试使用 Vitest + React Testing Library
- 测试中使用 `vi.useFakeTimers()` 时，用 `vi.advanceTimersByTimeAsync()` 代替 `waitFor`

## 自进化历史

### Round 4781 (2026-03-31)
- **方向修正**: 从"工作流引擎"回归"多Agent协调编辑器"
- **竞品对标**: Cursor / Claude Code / Windsurf
- **代码清理**: 移除 internal/llm/, 过度设计代码
- **新增文档**: SELF_EVOLUTION.md, FEATURE_CLASSIFICATION.md
- **质量验证**: 18 Go packages PASS, 878 UI tests PASS, staticcheck CLEAN

### Round 562 (2026-03-28)
- Tauri 编译错误修复
- 未使用变量移除
- TeamPanel/SettingsPanel 测试覆盖率 100%

---

*自进化永不停歇 - PUA Pro Mode*
