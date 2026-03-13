# Swarm Editor 待解决问题列表

## 更新日期: 2026-03-13

---

## 🔴 高优先级

### 1. AgentConfigPanel.tsx 测试覆盖率不足 (85.71%)

**问题描述:**
- `handleTestConnection` 异步函数未被测试覆盖
- 代理列表渲染逻辑未测试（`sampleAgentConfigs` 始终为空数组）
- 组件内部状态管理难以从外部测试

**未覆盖行:** 49, 79-83

**建议方案:**
```typescript
// 方案1: 通过 props 传递初始代理数据
interface AgentConfigPanelProps {
  initialAgents?: AgentConfig[]
}

// 方案2: 从 store 或 API 获取代理列表
const { agents, loadAgents } = useAgentStore()
```

**影响范围:**
- 代理配置功能可能存在未发现的bug
- 用户无法测试代理连接状态

---

## 🟡 中优先级

### 2. SwarmCoordinatorPanel.tsx 部分功能未测试 (93.02%)

**问题描述:**
- 运行中任务的进度条更新逻辑未测试
- 已分配代理的显示逻辑未测试
- 任务结果渲染未测试

**未覆盖行:** 39, 374, 443

**具体代码位置:**
- 第39行: 任务进度更新 `progress: Math.min(t.progress + 0.1, 1)`
- 第374行: 分配代理显示 `{task.assignedTo.slice(0, 3).map(...)}`
- 第443行: 任务结果显示 `{Object.entries(task.results).map(...)}`

**建议方案:**
- 添加测试用例模拟运行中任务状态
- Mock 具有分配代理的任务数据
- Mock 具有结果数据的任务

---

### 3. appStore.ts 错误处理未测试 (93.75%)

**问题描述:**
- `initialize` 函数的错误处理分支未被测试
- 连接失败时的状态更新未验证

**未覆盖行:** 83-84

**相关代码:**
```typescript
} catch (error) {
  console.error('Failed to initialize:', error)
  set({
    connected: false,
    connecting: false,
    connectionError: error instanceof Error ? error.message : 'Failed to connect'
  })
}
```

**建议方案:**
- 添加测试用例模拟初始化失败场景
- 验证错误状态是否正确设置

---

## 🟢 低优先级

### 4. 分支覆盖率偏低

**问题组件:**
| 组件 | 分支覆盖率 |
|------|-----------|
| SwarmCoordinatorPanel.tsx | 68.42% |
| appStore.ts | 71.42% |
| AgentConfigPanel.tsx | 81.57% |
| SwarmPanel.tsx | 90% |
| TeamPanel.tsx | 85.71% |

**说明:**
分支覆盖率偏低通常表示条件判断的某些分支未被测试覆盖，可能存在边缘情况未处理。

---

## 📋 功能完善建议

### 5. 代理连接测试功能

**当前状态:** `handleTestConnection` 仅输出日志，无实际功能

```typescript
const handleTestConnection = async (agentId: string) => {
  // Test connection to agent
  console.log('Testing connection to:', agentId)
}
```

**建议实现:**
1. 实现 ACP 协议的连接测试
2. 更新代理状态（idle → testing → connected/error）
3. 显示连接结果给用户
4. 添加超时处理

---

### 6. 群组（Swarm）持久化

**当前状态:** 群组数据仅存在于内存中，刷新后丢失

**建议实现:**
1. 添加本地存储支持（localStorage / IndexedDB）
2. 或通过后端 API 持久化

---

### 7. 任务执行功能

**当前状态:** 任务状态为 "pending" 后无法启动执行

**建议实现:**
1. 实现 Start 按钮功能
2. 实现任务分发逻辑
3. 实现结果收集和显示

---

## 🛠️ 技术债务

### 8. UI 测试警告

**警告信息:**
```
esbuild option was specified by "vite:react-babel" plugin.
This option is deprecated, please use `oxc` instead.
```

**建议:** 更新 Vite 配置，使用 oxc 替代 esbuild

---

### 9. TypeScript 类型完善

**建议:**
- 为 `CoordinationTask` 添加更严格的类型定义
- 考虑使用 `zod` 或 `io-ts` 进行运行时类型验证

---

## 📊 统计信息

| 类别 | 数量 |
|------|------|
| 高优先级问题 | 1 |
| 中优先级问题 | 2 |
| 低优先级问题 | 4 |
| 技术债务 | 2 |
| **总计** | **9** |

---

## 下一步行动

1. [ ] 解决 AgentConfigPanel 测试问题
2. [ ] 完善 SwarmCoordinatorPanel 测试
3. [ ] 添加 appStore 错误处理测试
4. [ ] 实现代理连接测试功能
5. [ ] 实现群组持久化
6. [ ] 实现任务执行功能
