# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swarm Editor 是一个支持 ACP (Agent Client Protocol) 协议的多智能体协调开发编辑器。项目本身不内置 LLM，而是作为 ACP 协调中心，通过 stdio/WebSocket 与外部 Agent（如 Claude Code CLI）通信。

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
