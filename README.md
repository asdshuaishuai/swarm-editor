# Swarm Editor - 多Agent协调编辑器

一个基于 ACP 协议的多Agent协调编辑器，支持Agent共识、涌现智能和可靠调度。

## 核心定位

**Swarm Editor 是编辑器，不是工作流引擎。**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Swarm Editor 核心能力                         │
├─────────────────────────────────────────────────────────────────┤
│  编辑器核心                                                      │
│  ├── 代码编辑 (Monaco Editor)                                    │
│  ├── Agent 对话面板                                              │
│  ├── 多 Agent 协调                                               │
│  └── 任务调度与执行                                               │
├─────────────────────────────────────────────────────────────────┤
│  协调能力                                                         │
│  ├── Agent Handoff (任务交接)                                    │
│  ├── 结果共识 (Queen Bee 投票)                                   │
│  ├── 涌现智能 (信息素路由)                                        │
│  └── 健康监控 (Supervisor)                                       │
├─────────────────────────────────────────────────────────────────┤
│  可靠性                                                           │
│  ├── 熔断器 (Circuit Breaker)                                    │
│  ├── 死信队列 (DLQ)                                              │
│  ├── 重试/超时策略                                                │
│  └── 工件管理                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 核心特性

### 协议与通信
- **ACP 协议原生**: Agent Client Protocol，支持 stdio/WebSocket/TCP
- **MCP 集成**: Model Context Protocol 工具发现和调用
- **A2A 协议**: Agent-to-Agent 跨实例通信

### Agent 协调
- **智能调度**: round_robin / least_loaded / priority / capability
- **Agent Handoff**: 任务在Agent间平滑交接
- **结果共识**: Queen Bee 投票机制，多数一致性保证
- **涌现智能**: 信息素路由 + 自组织协商

### 可靠性
- **Circuit Breaker**: 熔断器防止级联故障
- **DLQ**: Dead Letter Queue 失败隔离
- **Guardrails**: Agent 输出验证
- **重试/超时策略**: 灵活的可靠性配置

### 可观测性
- **审计日志**: 完整操作追踪
- **Emergence Dashboard**: 涌现行为可视化
- **Supervisor**: Agent 健康监控

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     React UI (Vite + TypeScript)                         │
│  Monaco Editor | Agent Panel | Swarm Coordinator | Workflow Editor      │
│  Visual Orchestrator | Emergence Dashboard | Consensus Visualization    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ WebSocket (JSON-RPC 2.0)
┌────────────────────────────────▼────────────────────────────────────────┐
│                        Go Backend (18 packages)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────────┐  │
│  │ api/        │  │ swarm/      │  │ agent/                          │  │
│  │ websocket   │  │ scheduler   │  │ registry, discovery, scanner    │  │
│  │ workspace   │  │ coordinator │  │ memory, router, handshake       │  │
│  │ emergence   │  │ supervisor  │  │                                 │  │
│  └─────────────┘  │ consensus   │  └─────────────────────────────────┘  │
│  ┌─────────────┐  │ orchestrator│  ┌─────────────────────────────────┐  │
│  │ acp/        │  │ (51 files)  │  │ mcp/ | lsp/ | audit/ | pair/    │  │
│  │ protocol    │  └─────────────┘  │ session/ | team/ | a2a/         │  │
│  │ transport   │  ┌─────────────┐  └─────────────────────────────────┘  │
│  │ connection  │  │ config/     │                                       │
│  │ server      │  │ storage/    │                                       │
│  └─────────────┘  └─────────────┘                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ stdio/WebSocket/TCP (ACP)
┌────────────────────────────────▼────────────────────────────────────────┐
│                     External ACP Agents                                  │
│  Claude Code CLI | Kimi Code | OpenCode | Crush CLI | Custom Agents     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术选择 | 说明 |
|------|----------|------|
| 前端 | React 18 + TypeScript + Vite 8 | 现代 React 开发栈 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 代码编辑器 | Monaco Editor | VS Code 同款编辑器 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 后端核心 | Go 1.22+ | 高性能，单二进制部署 |
| 通信协议 | JSON-RPC 2.0 over WebSocket | 双向实时通信 |
| Agent 协议 | ACP (stdio/WebSocket/TCP) | 标准化 Agent 通信 |
| 工具协议 | MCP (Model Context Protocol) | 工具集成标准 |
| 测试 | Vitest + React Testing Library | 878 个 UI 测试 |

## 目录结构

```
swarm-editor/
├── cmd/                        # 应用入口
│   ├── swarm-editor/           # 主程序入口
│   └── swarm-agent/            # 独立 Agent 进程
├── internal/                   # 内部模块
│   ├── acp/                    # ACP 协议 (stdio/WebSocket/TCP)
│   ├── agent/                  # Agent 系统 (注册/发现/路由/记忆)
│   ├── swarm/                  # 核心调度模块
│   │   ├── task.go             # 任务定义
│   │   ├── scheduler.go        # 智能调度
│   │   ├── coordinator.go      # Agent 协调
│   │   ├── handoff.go          # Agent 交接
│   │   ├── consensus.go        # 结果共识 ⭐
│   │   ├── swarm_intelligence.go # 涌现智能 ⭐
│   │   ├── circuit_breaker.go  # 熔断器 ⭐
│   │   ├── dead_letter_queue.go # 死信队列 ⭐
│   │   ├── supervisor.go       # 健康监控
│   │   ├── retry_policy.go     # 重试策略
│   │   ├── timeout_policy.go   # 超时策略
│   │   ├── artifacts.go        # 工件管理
│   │   └── variables.go        # 变量系统
│   │   # 以下为实验性功能 (见 FEATURE_CLASSIFICATION.md)
│   │   ├── orchestration*.go   # 工作流编排 [实验性]
│   │   ├── *_node.go           # 节点类型 [实验性]
│   │   └── checkpoint*.go      # 检查点 [实验性]
│   ├── a2a/                    # Agent-to-Agent 协议
│   ├── mcp/                    # MCP 客户端
│   ├── lsp/                    # LSP 集成
│   ├── api/                    # HTTP/WebSocket API
│   ├── audit/                  # 审计日志
│   ├── session/                # 会话存储
│   ├── pair/                   # 结对编程
│   ├── team/                   # 团队管理
│   └── config/                 # 配置管理
├── pkg/                        # 公共包
├── ui/                         # 前端代码
│   └── src/
│       ├── components/         # UI 组件
│       ├── panels/             # 面板组件
│       └── services/           # API 客户端
├── docs/                       # 文档
└── CLAUDE.md                   # Claude Code 指引
```

⭐ = 核心差异化特性

## 快速开始

### 环境要求

- Go 1.22+
- Node.js 18+

### 构建

```bash
# 构建后端
go build -o bin/swarm-editor ./cmd/swarm-editor
go build -o bin/swarm-agent ./cmd/swarm-agent

# 运行测试
make test              # Go 测试
make test-race         # 带 race 检测
cd ui && npm run test  # UI 测试 (878 个)

# 开发模式 - 后端
./bin/swarm-editor

# 开发模式 - 前端
cd ui && npm run dev
```

## 核心概念

### 1. Agent (智能体)

智能体是执行任务的基本单元：
- 通过 ACP 协议通信 (stdio/WebSocket/TCP)
- 可连接 MCP 服务器获取工具能力
- 具有独立的会话、记忆和上下文
- 由外部 Agent CLI (Claude Code 等) 提供 LLM 能力

### 2. Swarm (蜂群)

蜂群是多智能体协作系统：
- **涌现智能**: 信息素路由，自组织协商
- **共识机制**: Queen Bee 投票，多数一致性
- **任务调度**: round_robin / least_loaded / priority / capability
- **健康监控**: Supervisor 心跳追踪，卡住检测
- **可靠性**: 熔断器 + 死信队列 + 重试策略

### 3. 结对编程

人-Agent 或 Agent-Agent 协作模式：
- **Driver**: 执行具体编码任务
- **Navigator**: 审查代码、提出建议
- 实时角色切换

## 差异化优势

| 特性 | Swarm Editor | Cursor | Claude Code | Windsurf |
|------|--------------|--------|-------------|----------|
| 多 Agent 协调 | ✅ 原生 | ❌ 单 Agent | ❌ 单 Agent | ❌ 单 Agent |
| 涌现智能 | ✅ 独创 | ❌ | ❌ | ❌ |
| 结果共识 | ✅ Queen Bee | ❌ | ❌ | ❌ |
| Agent Handoff | ✅ | ❌ | ❌ | ❌ |
| ACP 协议 | ✅ 原生 | ❌ | ❌ | ❌ |
| MCP 支持 | ✅ | ✅ | ✅ | ✅ |
| Go 后端 | ✅ 高性能 | ❌ TS | ❌ TS | ❌ TS |
| 熔断器/DLQ | ✅ | ❌ | ❌ | ❌ |

## 待改进项

### 编辑器核心
- [ ] Monaco Editor 深度集成 (代码补全、跳转)
- [ ] 文件树增强 (多工作区、搜索)
- [ ] Agent 对话面板优化

### 协调能力
- [ ] 更智能的任务分解
- [ ] Agent 能力匹配优化
- [ ] 共识算法调优

## 协议支持

### ACP 协议方法

| 方法 | 方向 | 说明 |
|------|------|------|
| initialize | Client→Agent | 初始化连接 |
| session/new | Client→Agent | 创建会话 |
| session/load | Client→Agent | 加载会话 |
| session/prompt | Client→Agent | 发送提示 |
| session/cancel | Client→Agent | 取消操作 |
| session/update | Agent→Client | 状态更新 |
| session/request_permission | Agent→Client | 请求权限 |

### WebSocket 命令

完整的 WebSocket API 支持以下命令：
- Agent: add/update/delete/list
- Swarm: create/delete/list/execute
- Workflow: create/update/delete/execute/list
- Team: create/join/leave/list
- MCP: add/remove/list servers
- Automation: create/delete/list
- Artifact/Variable: CRUD 操作

## 许可证

MIT License
