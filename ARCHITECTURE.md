# Swarm Editor - 架构设计文档

## 概述

Swarm Editor 是一个支持 ACP 协议的多智能体协调开发编辑器。编辑器本身作为 ACP 协调中心，通过配置文件接入外部 Agent，并实现蜂群智能调度来协调多个 Agent 完成复杂任务。

## 核心架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Swarm Editor (ACP Coordinator)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │  Agent Config  │  │  Connection    │  │    Swarm Coordinator       │ │
│  │  Manager       │  │  Manager       │  │  ┌──────────────────────┐  │ │
│  │                │  │                │  │  │ Task Scheduler       │  │ │
│  │  agents.json   │  │  ┌──────────┐  │  │  │ ┌─────┐ ┌─────┐      │  │ │
│  │  - agent id    │──▶  │ Agent 1  │  │  │  │ │Task │ │Task │      │  │ │
│  │  - command     │  │  │ (ACP)    │  │  │  │ │  1  │ │  2  │      │  │ │
│  │  - roles       │  │  └──────────┘  │  │  │ └─────┘ └─────┘      │  │ │
│  │  - priority    │  │  ┌──────────┐  │  │  └──────────────────────┘  │ │
│  └────────────────┘  │  │ Agent 2  │  │  │  ┌──────────────────────┐  │ │
│                      │  │ (ACP)    │  │  │  │ Consensus Engine     │  │ │
│                      │  └──────────┘  │  │  │ ┌─────┐ ┌─────┐      │  │ │
│                      │  ┌──────────┐  │  │  │ │Vote │ │Vote │      │  │ │
│                      │  │ Agent N  │  │  │  │ │ 1   │ │ 2   │      │  │ │
│                      │  │ (ACP)    │  │  │  │ └─────┘ └─────┘      │  │ │
│                      │  └──────────┘  │  │  └──────────────────────┘  │ │
│                      └────────────────┘  └────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                            Frontend (React + Tauri)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Monaco      │  │ Agent       │  │ Swarm       │  │ Task            │ │
│  │ Editor      │  │ Config      │  │ Coordinator │  │ Monitor         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌──────────┐    ┌──────────┐    ┌──────────┐
             │ Claude   │    │ GPT      │    │ Custom   │
             │ Code     │    │ Agent    │    │ Agent    │
             └──────────┘    └──────────┘    └──────────┘
             External ACP Agents (Configured via agents.json)
```

## 核心组件

### 1. ACP 配置管理 (`internal/acp/config.go`)
- `AgentConfig`: 定义单个 ACP Agent 的配置
- `Config`: 全局配置管理
- 支持从 `~/.swarm-editor/agents.json` 加载配置
- 配置内容包括: ID、命令路径、参数、环境变量、角色、优先级等

### 2. ACP 连接管理 (`internal/acp/connection.go`)
- `ConnectionManager`: 管理所有 Agent 连接
- `AgentConnection`: 单个 Agent 连接，包含进程管理
- 自动启动 Agent 子进程
- 通过 stdio 实现 ACP 通信
- 支持会话管理和状态追踪

### 3. 蜂群智能调度器 (`internal/swarm/scheduler.go`)
- `Scheduler`: 智能任务调度器
- 支持多种负载均衡策略:
  - `round_robin`: 轮询分配
  - `least_loaded`: 最少负载优先
  - `priority`: 按优先级分配
  - `capability`: 按能力匹配分配
- 任务优先级队列
- 自动任务分解
- 结果聚合

### 4. 多 Agent 协调器 (`internal/swarm/coordinator.go`)
- `Coordinator`: 多 Agent 任务协调
- 主 Agent 选举机制
- 任务分解与分配
- 结果共识机制
- 进度监控

## 数据流

### 任务提交流程

```
1. 用户在前端提交任务
       │
       ▼
2. Coordinator 接收任务
       │
       ├──▶ 检查是否需要分解
       │         │
       │         ├──▶ 是: 请求 Coordinator Agent 分解
       │         │              │
       │         │              ▼
       │         │         创建子任务
       │         │              │
       │         └──────────────┘
       │
       ▼
3. Scheduler 分配任务给 Worker Agents
       │
       ├──▶ 选择最佳 Worker (负载均衡)
       │
       ▼
4. 通过 ACP 协议发送 Prompt 到 Agent
       │
       ▼
5. 收集各 Agent 结果
       │
       ├──▶ 如果启用共识: 运行共识机制
       │              │
       │              ▼
       │         聚合结果
       │
       ▼
6. 返回最终结果给用户
```

## 配置示例

### agents.json

```json
{
  "defaultMcpSettings": {
    "useCustomMcp": true,
    "useEditorMcp": false
  },
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
    },
    "code-reviewer": {
      "id": "code-reviewer",
      "name": "Code Reviewer",
      "enabled": true,
      "command": "/usr/local/bin/reviewer-agent",
      "args": ["--acp"],
      "swarmConfig": {
        "canBeCoordinator": false,
        "canBeWorker": true,
        "preferredRoles": ["reviewer"],
        "maxConcurrent": 5,
        "priority": 8
      },
      "tags": ["review", "quality"]
    }
  },
  "defaultSwarmConfig": {
    "defaultTopology": "star",
    "defaultStrategy": "parallel",
    "consensusThreshold": 0.6,
    "taskTimeout": 300,
    "maxRetries": 3
  }
}
```

## API 端点

### WebSocket API (编辑器 <-> 前端)

| 端点 | 说明 |
|------|------|
| `POST /api/tasks` | 提交新任务 |
| `GET /api/tasks` | 获取任务列表 |
| `GET /api/tasks/:id` | 获取任务详情 |
| `POST /api/tasks/:id/cancel` | 取消任务 |
| `GET /api/agents` | 获取 Agent 列表 |
| `POST /api/agents/:id/connect` | 连接 Agent |
| `POST /api/agents/:id/disconnect` | 断开 Agent |
| `GET /api/swarm/stats` | 获取蜂群统计 |

## 前端组件

### 1. AgentConfigPanel (`ui/src/panels/AgentConfigPanel.tsx`)
- ACP Agent 配置管理界面
- 添加/编辑/删除 Agent
- 测试 Agent 连接
- 配置 Swarm 参数

### 2. SwarmCoordinatorPanel (`ui/src/panels/SwarmCoordinatorPanel.tsx`)
- 蜂群协调控制面板
- 任务提交和监控
- 实时进度显示
- 结果查看

### 3. EditorPanel (`ui/src/panels/EditorPanel.tsx`)
- Monaco 编辑器集成
- 文件树导航
- 与 Agent 协作编辑

## 扩展点

### 添加新的 Agent

1. 在 `agents.json` 中添加配置
2. 实现 ACP 协议接口
3. 编辑器自动发现并连接

### 自定义任务分解策略

实现 `TaskDecomposer` 接口:

```go
type TaskDecomposer interface {
    Decompose(ctx context.Context, task *Task) ([]*Task, error)
}
```

### 自定义共识机制

实现 `ConsensusEngine` 接口:

```go
type ConsensusEngine interface {
    Evaluate(results map[string]*TaskResult) (*ConsensusResult, error)
}
```

## 运行

```bash
# 构建后端
cd /home/kelthas/code/swarm-editor
go build -o bin/swarm-editor ./cmd/swarm-editor

# 构建前端
cd ui
npm install
npm run build

# 运行
./bin/swarm-editor
```

## 下一步

1. **集成 Tauri**: 将 Go 后端与 Tauri 桌面应用集成
2. **实现真实 LLM Provider**: 接入 Claude/OpenAI API
3. **添加文件系统工具**: 实现文件读写、搜索等工具
4. **增强共识机制**: 添加更复杂的共识算法
5. **添加日志和监控**: 完善可观测性