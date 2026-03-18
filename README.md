# Swarm Editor - 多智能体协调开发编辑器

一个支持ACP协议的多智能体协调开发编辑器，支持结对编程和蜂群模式。

## 核心特性

- **ACP协议兼容**: 完整支持JetBrains Agent Client Protocol
- **多智能体协调**: 支持多个AI智能体协同工作
- **结对编程**: Driver/Navigator模式的智能体协作
- **蜂群模式**: 大规模智能体并行任务处理
- **多团队协作**: 支持团队间的代码协作和评审

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Swarm Editor GUI                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Code Editor │  │ Agent Panel │  │ Swarm View  │  │ Team Panel │ │
│  │  (Monaco)   │  │   (Chat)    │  │ (Topo)      │  │ (Members)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │ JSON-RPC / WebSocket
┌────────────────────────────▼────────────────────────────────────────┐
│                      Swarm Core (Go Backend)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ ACP Protocol │  │ Agent Router │  │    Swarm Orchestrator     │ │
│  │    Layer     │  │   (Router)   │  │  ┌─────┐ ┌─────┐ ┌─────┐  │ │
│  └──────────────┘  └──────────────┘  │  │Agent│ │Agent│ │Agent│  │ │
│  ┌──────────────┐  ┌──────────────┐  │  │  1  │ │  2  │ │  N  │  │ │
│  │ Session Mgr  │  │  Tool Registry│ │  └─────┘ └─────┘ └─────┘  │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Team Manager │  │  File System │  │     MCP Integration       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                     External Services                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ LLM Providers│  │ MCP Servers  │  │    Version Control        │ │
│  │ (Claude/GPT) │  │ (Tools)      │  │    (Git)                  │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术选择 | 说明 |
|------|----------|------|
| 前端 GUI | Tauri 2.0 + React + TypeScript | 轻量跨平台，原生性能 |
| 代码编辑器 | Monaco Editor | VS Code 同款编辑器 |
| 后端核心 | Go 1.22+ | 高性能，用户已有经验 |
| 通信协议 | JSON-RPC 2.0 | ACP 协议标准 |
| 实时通信 | WebSocket + gRPC | 双向通信 + 高效RPC |
| LLM集成 | Claude API / OpenAI API | 支持多种LLM |
| 存储 | SQLite + BadgerDB | 结构化 + KV存储 |

## 目录结构

```
swarm-editor/
├── cmd/                    # 应用入口
│   ├── swarm-editor/       # 主程序入口
│   └── swarm-agent/        # 独立Agent进程
├── internal/               # 内部模块
│   ├── acp/                # ACP协议实现
│   │   ├── protocol.go     # 协议定义
│   │   ├── server.go       # ACP服务端
│   │   ├── client.go       # ACP客户端
│   │   ├── messages.go     # 消息类型
│   │   └── transport.go    # 传输层
│   ├── agent/              # 智能体系统
│   │   ├── agent.go        # 智能体接口
│   │   ├── registry.go     # 智能体注册表
│   │   ├── lifecycle.go    # 生命周期管理
│   │   └── router.go       # 消息路由
│   ├── swarm/              # 蜂群系统
│   │   ├── orchestrator.go # 蜂群编排器
│   │   ├── topology.go     # 拓扑结构
│   │   ├── task.go         # 任务管理
│   │   └── consensus.go    # 共识机制
│   ├── pair/               # 结对编程
│   │   ├── session.go      # 结对会话
│   │   ├── driver.go       # Driver角色
│   │   └── navigator.go    # Navigator角色
│   ├── team/               # 团队协作
│   │   ├── manager.go      # 团队管理
│   │   ├── workspace.go    # 工作空间
│   │   └── review.go       # 代码评审
│   ├── llm/                # LLM集成
│   │   ├── provider.go     # 提供者接口
│   │   ├── claude.go       # Claude实现
│   │   ├── openai.go       # OpenAI实现
│   │   └── tools.go        # 工具定义
│   ├── mcp/                # MCP集成
│   │   ├── client.go       # MCP客户端
│   │   └── server.go       # MCP服务端
│   └── config/             # 配置管理
│       └── config.go       # 配置定义
├── pkg/                    # 公共包
│   ├── rpc/                # RPC工具
│   ├── storage/            # 存储抽象
│   └── utils/              # 工具函数
├── ui/                     # 前端代码
│   ├── src/
│   │   ├── components/     # UI组件
│   │   ├── panels/         # 面板组件
│   │   ├── editor/         # 编辑器组件
│   │   ├── agents/         # 智能体UI
│   │   ├── swarm/          # 蜂群UI
│   │   └── store/          # 状态管理
│   ├── package.json
│   └── vite.config.ts
├── configs/                # 配置文件
│   └── default.yaml
├── go.mod
└── README.md
```

## 快速开始

### 环境要求

- Go 1.22+
- Node.js 18+
- Rust 1.70+ (用于Tauri)

#### Linux 系统依赖 (Tauri)

在 Fedora/RHEL 上安装：
```bash
sudo dnf install webkit2gtk4.1-devel javascriptcoregtk4.1-devel \
    openssl-devel curl wget libappindicator-gtk3-devel
```

在 Ubuntu/Debian 上安装：
```bash
sudo apt install libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
    build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev
```

### 构建

```bash
# 构建后端
go build -o bin/swarm-editor ./cmd/swarm-editor

# 构建前端
cd ui && npm install && npm run build

# 开发模式
cargo tauri dev
```

## 核心概念

### 1. Agent (智能体)

智能体是执行任务的基本单元，每个智能体：
- 支持ACP协议通信
- 可连接MCP服务器获取工具能力
- 具有独立的会话和上下文

### 2. Swarm (蜂群)

蜂群是多个智能体的协作模式：
- **拓扑结构**: 星型、网状、树状、环状
- **任务分解**: 自动将大任务分解为子任务
- **结果聚合**: 智能合并多个智能体的输出

### 3. Pair Programming (结对编程)

两个智能体的协作模式：
- **Driver**: 执行具体编码任务
- **Navigator**: 审查代码、提出建议
- 实时切换角色

### 4. Team (团队)

多团队协作支持：
- 团队间代码共享
- 跨团队代码评审
- 协作式问题解决

## 协议支持

### ACP协议方法

| 方法 | 方向 | 说明 |
|------|------|------|
| initialize | Client→Agent | 初始化连接 |
| authenticate | Client→Agent | 认证 |
| session/new | Client→Agent | 创建会话 |
| session/load | Client→Agent | 加载会话 |
| session/prompt | Client→Agent | 发送提示 |
| session/cancel | Client→Agent | 取消操作 |
| session/update | Agent→Client | 状态更新 |
| session/request_permission | Agent→Client | 请求权限 |

## 许可证

MIT License