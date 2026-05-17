# Agent 深度集成 Phase 2 — 实施计划

> **自动化执行:** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施。步骤使用 checkbox (`- [ ]`) 追踪进度。

**目标:** 完成所有 Agent 管理面板中占位/仅控制台输出的交互，将模拟数据替换为真实 WebSocket 事件。

**架构:** 扩展现有 Zustand store 和 WebSocket 订阅模式。每个面板通过 `api.*` 调用和 `ws.subscribe()` 获取实时更新。后端 Agent 生命周期通过 ACP 连接管理器实现真正的进程启动。

**技术栈:** React, TypeScript, Zustand, WebSocket, Go backend ACP

---

## 当前状态 (R5928)

**已完成:**
- AgentCollaborationPanel: 真实会话 + 消息 API
- AgentConnectionPanel: 真实 Agent 列表 + WebSocket `agent_stats`
- AgentSessionPanel: 真实会话 API
- MainLayout: 三栏布局（AgentCluster + CodeObserver）
- 8 个 ACP Agent 配置完成

**待解决的差距:**
1. AgentDispatchPanel 聊天 → 仅 console.log
2. SwarmCoordinatorPanel → 模拟进度更新
3. SupervisorPanel → 占位按钮
4. TeamPanel → 占位按钮
5. 后端 `start_agent`/`stop_agent` → 仅修改状态，无进程管理
6. 10+ 新组件缺少测试覆盖

---

## 任务 1: AgentDispatchPanel 聊天接入真实后端

**文件:**
- 修改: `ui/src/panels/AgentDispatchPanel.tsx`
- 创建: `ui/src/panels/AgentDispatchPanel.test.tsx`

- [ ] **步骤 1: 读取当前实现**

读取 `ui/src/panels/AgentDispatchPanel.tsx`，找到当前仅 console.log 的消息处理函数。

- [ ] **步骤 2: 替换为真实 API 调用**

```typescript
const handleSendMessage = useCallback(async (content: string) => {
  if (!selectedAgentId) {
    toast.error('请先选择一个 Agent')
    return
  }

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date(),
  }
  setMessages(prev => [...prev, userMessage])
  setIsLoading(true)

  try {
    if (!sessionRef.current) {
      const session = await api.agent.createSession(selectedAgentId, 'default')
      sessionRef.current = session.id
    }

    const result = await api.agent.sendMessage(sessionRef.current, content)
    const agentMessage: ChatMessage = {
      id: `agent-${Date.now()}`,
      role: 'agent',
      agentId: selectedAgentId,
      content: result.content || '任务已发送',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, agentMessage])
  } catch (err) {
    toast.error(`发送失败: ${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    setIsLoading(false)
  }
}, [selectedAgentId])
```

- [ ] **步骤 3: 添加卸载时清理**

```typescript
useEffect(() => {
  return () => {
    if (sessionRef.current) {
      api.agent.closeSession(sessionRef.current).catch(() => {})
    }
  }
}, [])
```

- [ ] **步骤 4: 创建测试文件并运行**

```bash
cd /home/kelthas/code/swarm-editor/ui && npx vitest run src/panels/AgentDispatchPanel.test.tsx
```

- [ ] **步骤 5: 提交**

```bash
git add ui/src/panels/AgentDispatchPanel.tsx ui/src/panels/AgentDispatchPanel.test.tsx
git commit -m "feat(agent-dispatch): 聊天接入真实后端 API"
```

---

## 任务 2: SwarmCoordinatorPanel 用 WebSocket 替换模拟进度

**文件:**
- 修改: `ui/src/panels/SwarmCoordinatorPanel.tsx`

- [ ] **步骤 1: 读取当前实现**

找到模拟进度的 `setInterval` 代码。

- [ ] **步骤 2: 添加 WebSocket 订阅**

```typescript
import { getWebSocketClient } from '../services/websocket'

// 在 useEffect 中:
const ws = getWebSocketClient()
const unsubTask = ws.subscribe('swarm_task_update', (data: unknown) => {
  const update = data as { taskId: string; status: string; progress?: number }
  setTasks(prev => prev.map(t =>
    t.id === update.taskId
      ? { ...t, status: update.status as Task['status'], progress: update.progress ?? t.progress }
      : t
  ))
})
```

- [ ] **步骤 3: 移除模拟 setInterval**

删除原来的 `setInterval` 随机更新逻辑。

- [ ] **步骤 4: 运行测试**

```bash
cd /home/kelthas/code/swarm-editor/ui && npx vitest run src/panels/SwarmCoordinatorPanel.test.tsx
```

- [ ] **步骤 5: 提交**

```bash
git add ui/src/panels/SwarmCoordinatorPanel.tsx
git commit -m "feat(swarm-coordinator): 用 WebSocket 事件替换模拟进度"
```

---

## 任务 3: SupervisorPanel 占位按钮接入

**文件:**
- 修改: `ui/src/panels/SupervisorPanel.tsx`

- [ ] **步骤 1: 找到 "暂停全部" 和 "刷新" 按钮**

- [ ] **步骤 2: 实现刷新功能**

```typescript
const handleRefresh = useCallback(async () => {
  setLoading(true)
  try {
    const [agentList, stats] = await Promise.all([
      api.agent.getAgents(),
      api.monitoring.getSupervisorStats(),
    ])
    setAgents(agentList)
    setStats(stats)
  } catch {
    toast.error('刷新失败')
  } finally {
    setLoading(false)
  }
}, [])
```

- [ ] **步骤 3: 实现暂停全部功能**

```typescript
const handlePauseAll = useCallback(async () => {
  const activeAgents = agents.filter(a => a.state === 'active' || a.state === 'executing')
  if (activeAgents.length === 0) {
    toast.info('没有活跃的 Agent')
    return
  }
  setLoading(true)
  try {
    await Promise.all(activeAgents.map(a => api.agent.stopAgent(a.id)))
    toast.success(`已暂停 ${activeAgents.length} 个 Agent`)
    await handleRefresh()
  } catch {
    toast.error('暂停失败')
  } finally {
    setLoading(false)
  }
}, [agents, handleRefresh])
```

- [ ] **步骤 4: 绑定按钮事件并测试**

- [ ] **步骤 5: 提交**

```bash
git add ui/src/panels/SupervisorPanel.tsx
git commit -m "feat(supervisor): 接入刷新和暂停全部按钮"
```

---

## 任务 4: TeamPanel 占位按钮接入

**文件:**
- 修改: `ui/src/panels/TeamPanel.tsx`

- [ ] **步骤 1: 实现分配 Agent 功能**

```typescript
const [showAssignModal, setShowAssignModal] = useState(false)

const handleAssignAgent = useCallback(async (agentId: string) => {
  if (!selectedTeam) return
  try {
    await api.team.addAgentToTeam(selectedTeam.id, agentId)
    toast.success('Agent 已分配到团队')
    await fetchTeams()
    setShowAssignModal(false)
  } catch {
    toast.error('分配失败')
  }
}, [selectedTeam, fetchTeams])
```

- [ ] **步骤 2: 绑定按钮并测试**

- [ ] **步骤 3: 提交**

```bash
git add ui/src/panels/TeamPanel.tsx
git commit -m "feat(team): 接入分配 Agent 按钮"
```

---

## 任务 5: 修复后端 Agent 生命周期

**文件:**
- 修改: `internal/api/handler_agent.go`

- [ ] **步骤 1: 读取当前 start_agent / stop_agent 实现**

- [ ] **步骤 2: 实现真正的进程启动**

`handleStartAgent` 应通过 ACP 连接管理器启动 Agent 进程，而非仅设置状态。

- [ ] **步骤 3: 实现干净的停止**

`handleStopAgent` 应通过连接管理器断开，使用 `StateIdle` 而非 `StateError`。

- [ ] **步骤 4: 运行 Go 测试**

```bash
cd /home/kelthas/code/swarm-editor && go test -v -run TestHandleStartAgent ./internal/api/...
```

- [ ] **步骤 5: 提交**

```bash
git add internal/api/handler_agent.go
git commit -m "fix(agent): 通过 ACP 连接管理器实现正确的生命周期"
```

---

## 任务 6-8: 新组件测试覆盖

并行创建以下测试文件：

| 任务 | 测试文件 |
|------|----------|
| 6 | `ui/src/panels/AgentCollaborationPanel.test.tsx` |
| 7 | `ui/src/components/AgentConnectionPanel.test.tsx` |
| 8 | `ui/src/components/AgentSessionPanel.test.tsx` |

每个测试覆盖：渲染、API 调用、WebSocket 订阅、用户交互。

---

## 任务 9: 自定义指令面板

**文件:**
- 创建: `ui/src/panels/CustomInstructionsPanel.tsx`
- 创建: `ui/src/panels/CustomInstructionsPanel.test.tsx`

提供 textarea 编辑器，调用 `api.agent.getCustomInstructions()` 和 `api.agent.saveCustomInstructions()`。

---

## 任务 10: 五关审计

1. `go build ./...` ✅
2. `staticcheck ./...` ✅
3. `go vet ./...` ✅
4. `npx tsc --noEmit` ✅
5. `npx vitest run` ✅ (893+ 测试通过)

---

## 执行顺序

```
并行阶段 1: 任务 1 + 2 + 3 + 4（接入占位按钮）
    ↓
阶段 2: 任务 5（后端生命周期）
    ↓
并行阶段 3: 任务 6 + 7 + 8（测试覆盖）
    ↓
阶段 4: 任务 9（新面板）
    ↓
阶段 5: 任务 10（五关审计）
```

---

**两种执行方式:**

1. **子代理驱动（推荐）** — 每个任务分派独立子代理，任务间审查，快速迭代
2. **内联执行** — 在当前会话中批量执行，设置检查点

选择哪种方式？
