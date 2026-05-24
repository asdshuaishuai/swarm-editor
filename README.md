# Swarm Editor - 多Agent协调编辑器

一个基于 ACP 协议的多Agent协调编辑器，支持Agent共识、涌现智能、动态调度和可靠协调。

## 核心定位

**Swarm Editor 是编辑器，不是工作流引擎。**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Swarm Editor 核心能力                         │
├─────────────────────────────────────────────────────────────────┤
│  编辑器核心                                                      │
│  ├── 代码编辑 (Monaco Editor + LSP)                              │
│  ├── Agent 对话面板                                              │
│  ├── 多 Agent 协调                                               │
│  └── 任务调度与执行                                               │
├─────────────────────────────────────────────────────────────────┤
│  协调能力                                                         │
│  ├── Agent Handoff (任务交接)                                    │
│  ├── 结果共识 (Queen Bee + PBFT)                                 │
│  ├── 涌现智能 (信息素路由 + 自组织协商)                            │
│  ├── 动态调度 (负载预测 + 饥饿防护)                               │
│  ├── 健康监控 (Supervisor + 审计日志)                             │
│  └── 自动扫描 (Agent/MCP/Skill 发现)                             │
├─────────────────────────────────────────────────────────────────┤
│  可靠性                                                           │
│  ├── 熔断器 (Circuit Breaker)                                    │
│  ├── 死信队列 (DLQ)                                              │
│  ├── 重试/超时策略                                                │
│  └── 工件管理 + 检查点恢复                                        │
└─────────────────────────────────────────────────────────────────┘
```

## 核心特性

### 协议与通信
- **ACP 协议原生**: Agent Client Protocol，支持 stdio/WebSocket/TCP
- **MCP 集成**: Model Context Protocol 工具发现和调用
- **A2A 协议**: Agent-to-Agent 跨实例通信
- **LSP 桥接**: 语言服务器协议，代码补全/跳转/重构

### Agent 协调
- **智能调度**: round_robin / least_loaded / priority / capability，动态优先级调整，负载预测
- **Agent Handoff**: 任务在Agent间平滑交接，后端驱动的接受/拒绝流程
- **结果共识**: Queen Bee 投票 + PBFT 拜占庭容错，故障节点检测
- **涌现智能**: 信息素路由 + 自组织协商 + 涌现信号检测

### 自动发现
- **Agent Scanner**: 自动发现系统已安装的 ACP Agent (Claude Code, Kimi Code, OpenCode, Cline, QwenCode, GeminiCLI)
- **MCP Scanner**: 从 Agent 配置中发现 MCP 服务器
- **Skill Scanner**: 扫描本地技能目录、Agent 能力、MCP 工具

### 可靠性
- **Circuit Breaker**: 熔断器防止级联故障
- **DLQ**: Dead Letter Queue 失败隔离
- **Guardrails**: Agent 输出验证
- **重试/超时策略**: 灵活的可靠性配置
- **检查点恢复**: 工作流执行中断后可从检查点恢复

### 可观测性
- **审计日志**: 完整操作追踪，支持按类型/Actor/资源过滤
- **Emergence Dashboard**: 信息素健康度、涌现信号、Agent 利用率可视化
- **Supervisor**: Agent 健康监控 + 调度运行器状态管理
- **调度统计**: 负载均衡效率、饥饿防护次数、平均等待时间

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
│  Claude Code CLI | Kimi Code | OpenCode | Cline | QwenCode | GeminiCLI  │
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
| 测试 | Vitest + React Testing Library + Go testing | 1808 个 UI 测试 + 320+ Go 测试 |

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
│   ├── WIKI.md                 # 项目百科
│   ├── DEVELOPMENT.md          # 开发指南
│   └── ROADMAP.md              # 发展路线
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
cd ui && npm run test  # UI 测试 (1808 个)

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
| 结果共识 | ✅ Queen Bee + PBFT | ❌ | ❌ | ❌ |
| 动态调度 | ✅ 负载预测+饥饿防护 | ❌ | ❌ | ❌ |
| Agent Handoff | ✅ | ❌ | ❌ | ❌ |
| ACP 协议 | ✅ 原生 | ❌ | ❌ | ❌ |
| MCP 支持 | ✅ | ✅ | ✅ | ✅ |
| 自动扫描 | ✅ Agent/MCP/Skill | ❌ | ❌ | ❌ |
| 审计日志 | ✅ | ❌ | ❌ | ❌ |
| Go 后端 | ✅ 高性能 | ❌ TS | ❌ TS | ❌ TS |
| 熔断器/DLQ | ✅ | ❌ | ❌ | ❌ |
| 检查点恢复 | ✅ | ❌ | ❌ | ❌ |

## 已完成功能 (Rb81e)

### 设计文档 7 大模块全覆盖

| 设计文档章节 | 模块 | 状态 |
|-------------|------|------|
| Section 1: 进程生命周期 | ProcessMetrics (PID/CPU/RSS) | ✅ |
| Section 2: 日志环缓冲 | LogRingBuffer (5000行/stderr采集) | ✅ |
| Section 3: Git 状态标签 | FileEvent.GitStatus + fsnotify 文件监听 | ✅ |
| Section 4: MCP 工具协议 | MCP 发现/启动/停止/工具调用 | ✅ |
| Section 5: ACP/A2A 双协议 | ACP stdio + A2A 对等传输 | ✅ |
| Section 6: HITL 特权拦截 | StateBlocked stdin 锁 + Block/Unblock | ✅ |
| Section 7: 代码变更双缓冲 | ShadowBuffer 暂存 + Diff 对比 + Commit/Reject | ✅ |

### 编辑器核心
- [x] Monaco Editor + LSP 桥接 (补全、跳转、悬停、重构、代码操作、代码透镜、语义高亮)
- [x] 文件树 + 多工作区 + 搜索/替换
- [x] Agent 对话面板 (ACP Session)
- [x] 终端集成 (PTY WebSocket)
- [x] CodeMirror 6 双编辑器支持
- [x] Find/Replace (Ctrl+F/Ctrl+H)

### Agent 指挥台
- [x] Queen Bee 选举 + 备份激活 + 禅让级联
- [x] 信息素路由动态角色分配 (coder/reviewer/tester/architect)
- [x] 中断恢复 + 检查点 + 4 种恢复策略
- [x] Agent 沙盘 SVG 拓扑交互 (节点点击/状态动画/边流动)
- [x] CLI 进程工坊 (进程状态实时更新/配置弹窗)
- [x] Queen Dispatcher (策略选择/目标下发/执行反馈)

### 协议监控
- [x] ACP/A2A/MCP 实时封包解析
- [x] 封包时间轴/列表视图切换
- [x] 封包搜索/过滤 (按类型/关键词)
- [x] 活动日志 (Skills 扫描 + Agent 启停 + MCP 服务状态)

### 协调能力
- [x] 动态调度 (负载预测 + 优先级衰减 + 饥饿防护)
- [x] PBFT 拜占庭共识 + 故障节点检测
- [x] 信息素健康度 + 涌现信号可视化
- [x] 审计日志 (事件追踪 + 统计 + 清除)
- [x] 调度运行器 (定时任务启停管理)
- [x] 工作流检查点/恢复/报告/缓存管理
- [x] Agent/MCP/Skill 自动扫描 (全局 + 项目级)
- [x] 团队管理 (Agent 分配/移除/删除)
- [x] 22 个后端广播事件实时推送

### 可观测性
- [x] 进程资源监控 (PID/CPU/RSS per agent)
- [x] Agent 日志环缓冲 (5000行 stderr/stdout 采集)
- [x] 代码变更影子缓冲 (stage/commit/reject + unified diff)
- [x] HITL stdin 锁 (BLOCKED 状态拒绝新 Prompt)
- [x] 文件监听 (fsnotify + 外部变更广播)

### 测试覆盖
- [x] 1839 个 UI 测试 (全部通过)
- [x] Go 后端 330+ 测试 (api 78.3%, swarm 86.2%, session 92.4%, testutil 72.4%, acp logbuffer 100%)
- [x] 连续 1800+ 次五关验证通过 (go build + staticcheck + go vet + tsc + vitest)

### 待改进
- [ ] 内联代码补全 (Tab 补全)
- [ ] Diff 视图 (Git 文件差异对比)
- [ ] 符号大纲 + Goto Line/Symbol
- [ ] 设置面板编辑器联动 (Compartment 动态更新)
- [ ] Tauri 文件对话框 (打开文件夹)
- [ ] Git Blame + Worktree 管理
- [ ] AST 增量 Diff (代码变更双缓冲增强)
- [ ] 自动 Lint/编译校验反馈循环

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
- Agent: add/update/delete/list, create_session/send_message/close_session, refresh_agents
- Swarm: create/delete/list/execute, submit_task/execute_task, cancel_task/assign_task, get_consensus/resolve_handoff
- Workflow: create/update/delete/execute/list, get_checkpoints/restore, get_report/resume, clear_node_cache/clear_all_caches
- Team: create/delete/list, add_agent/remove_agent
- MCP: add/remove/list servers, scan_mcp_servers
- Monitoring: get_supervisor_stats, get_emergence_data, list_audit_events/get_audit_stats/clear_audit_log
- Schedule: start_schedule_runner/stop_schedule_runner/get_schedule_runner_status
- Skills: scan_skills

## 前端服务层

| 服务 | 文件 | 用途 | 状态 |
|------|------|------|------|
| schedulingService | `services/scheduling.ts` | 动态调度算法 (负载预测/优先级/饥饿防护) | ✅ 活跃 |
| byzantineService | `services/byzantine.ts` | PBFT 拜占庭共识 (消息处理/视图切换/故障检测) | ✅ 活跃 |
| monitoringApi | `services/api.ts` | Supervisor 统计 + 涌现数据 + 审计日志 + 调度运行器 | ✅ 活跃 |
| swarmApi | `services/api.ts` | 蜂群管理 + 任务提交/执行/取消 + 共识/Handoff | ✅ 活跃 |
| workflowApi | `services/api.ts` | 工作流 CRUD + 检查点/恢复/报告/缓存 | ✅ 活跃 |
| lspApi | `services/lspApi.ts` | LSP 协议桥接 (补全/跳转/悬停/重构) | ✅ 活跃 |
| gitApi | `services/api.ts` | Git 操作 (提交/分支/Stash/Diff) | ✅ 活跃 |

## 文档

- [项目百科 (WIKI.md)](docs/WIKI.md) — 架构详解、API 参考、配置说明
- [开发指南 (DEVELOPMENT.md)](docs/DEVELOPMENT.md) — 编码规范、测试策略、构建部署
- [发展路线 (ROADMAP.md)](docs/ROADMAP.md) — 功能规划、优先级、时间线

## 许可证

MIT License
