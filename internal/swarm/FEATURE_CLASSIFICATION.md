# Swarm Editor 功能分类

## 核心功能 (Core) - 活跃开发

这些是 Swarm Editor 作为"多Agent协调编辑器"的核心能力。

### 后端模块

| 模块 | 文件 | 说明 |
|------|------|------|
| **Agent调度** | task.go, scheduler.go, coordinator.go | 任务定义、智能调度、Agent协调 |
| **Agent交接** | handoff.go | Agent间任务传递 |
| **结果共识** | consensus.go | Queen Bee 投票机制 |
| **涌现智能** | swarm_intelligence.go | 信息素路由、自组织协商 |
| **可靠性** | circuit_breaker.go, dead_letter_queue.go | 熔断器、死信队列 |
| **策略** | retry_policy.go, timeout_policy.go | 重试/超时策略 |
| **辅助** | artifacts.go, variables.go | 工件管理、变量系统 |
| **监控** | supervisor.go | Agent健康监控 |

### 前端组件（核心）

| 组件 | 文件 | 说明 |
|------|------|------|
| **Agent 对话** | AgentPanel.tsx | Agent 对话面板 |
| **蜂群调度** | SwarmPanel.tsx | 蜂群调度面板 |
| **协调器** | SwarmCoordinatorPanel.tsx | 协调器面板 |
| **蜂群可视化** | SwarmVisualization.tsx | 蜂群可视化 |
| **网络拓扑** | AgentNetworkGraph.tsx | Agent 网络拓扑图 |
| **共识可视化** | ConsensusVisualization.tsx | 共识过程可视化 |
| **涌现仪表板** | EmergenceDashboard.tsx | 涌现行为仪表板 |
| **监控面板** | SupervisorPanel.tsx | 监控面板 |
| **团队面板** | TeamPanel.tsx | 团队面板 |
| **Agent 调度** | AgentDispatchPanel.tsx | Agent 调度面板 |

## 实验性功能 (Experimental) - 暂不推荐

这些功能属于"工作流引擎"范畴，超出编辑器核心定位，暂时不使用。

### 后端模块

| 模块 | 文件 | 说明 |
|------|------|------|
| **工作流编排** | orchestration.go, orchestrator.go | 6种执行模式、节点编排 |
| **节点类型** | *_node.go (10+文件) | Code/HTTP/Condition/Switch/Merge等节点 |
| **检查点** | checkpoint.go, interrupt.go | 工作流持久化、中断恢复 |
| **自动化** | automations.go, signal.go | 事件驱动规则 |
| **高级特性** | result_cache.go, fallback.go, loop_detector.go | 缓存、回退链、循环检测 |

### 前端组件（实验性）

| 组件 | 文件 | 说明 |
|------|------|------|
| **可视化编排** | VisualOrchestrator.tsx | 工作流可视化编排器 |
| **工作流编辑** | WorkflowEditor.tsx | 工作流编辑器 |
| **工作流面板** | WorkflowPanel.tsx | 工作流管理面板 |

### 为什么标记为实验性

Swarm Editor 的定位是 **"多Agent协调编辑器"**，而非 **"工作流编排引擎"**。

- **编辑器核心**: Agent对话、代码编辑、任务调度、结果共识
- **工作流引擎**: 节点编排、检查点、事件触发、复杂控制流 ← 过度设计

实验性功能代码保留，但暂不作为主推特性。

---

*分类日期: 2026-03-30*
*更新日期: 2026-03-31*
*原因: P10架构审查发现范围蔓延，用户确认核心功能边界*
