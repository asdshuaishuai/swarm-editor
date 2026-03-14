# Swarm Editor 待解决问题列表

## 更新日期: 2026-03-14

---

## 当前状态

- **UI 总覆盖率**: 98.4% (从 96.66% 提升)
- **UI 分支覆盖率**: 91.21%
- **UI 测试数量**: 309 个 (从 303 个增加)
- **Go 测试**: 11 个包全部通过 (竞态检测)

---

## 🔴 高优先级

### 1. SwarmCoordinatorPanel.tsx 进度更新未完全测试 (97.67%)

**问题描述:**
- 运行中任务的进度条更新逻辑未完全测试
- 需要任务状态为 "running" 且 progress < 1 才能触发

**未覆盖行:** 39

**具体代码位置:**
- 第39行: 任务进度更新 `progress: Math.min(t.progress + 0.1, 1)`

**说明:**
已添加 TaskCard 和 TaskDetails 组件的直接测试，覆盖了：
- 运行中任务的进度条显示
- 已分配代理的显示
- 任务结果的渲染

但 useEffect 中的进度更新逻辑需要任务实际处于运行状态。

---

## 🟡 中优先级

### 2. appStore.ts 错误处理不可达 (95.12%)

**问题描述:**
- `initialize` 函数的错误处理分支未被测试
- 当前实现没有实际的后端连接可能失败

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

**说明:**
catch 分支在当前实现中不可达，因为 try 块中没有可能抛出异常的代码。建议在实现后端连接后再补充测试。

---

## 🟢 低优先级

### 3. 分支覆盖率优化

**问题组件:**
| 组件 | 分支覆盖率 |
|------|-----------|
| SwarmPanel.tsx | 90% |
| TeamPanel.tsx | 85.71% |
| appStore.ts | 78.57% |

**说明:**
分支覆盖率偏低通常表示条件判断的某些分支未被测试覆盖，可能存在边缘情况未处理。

---

## 📋 功能完善建议

### 4. 代理连接测试功能

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

### 5. 群组（Swarm）持久化

**当前状态:** 群组数据仅存在于内存中，刷新后丢失

**建议实现:**
1. 添加本地存储支持（localStorage / IndexedDB）
2. 或通过后端 API 持久化

---

### 6. 任务执行功能

**当前状态:** 任务状态为 "pending" 后无法启动执行

**建议实现:**
1. 实现 Start 按钮功能
2. 实现任务分发逻辑
3. 实现结果收集和显示

---

## 🛠️ 技术债务

### 7. UI 测试警告

**警告信息:**
```
esbuild option was specified by "vite:react-babel" plugin.
This option is deprecated, please use `oxc` instead.
```

**建议:** 更新 Vite 配置，使用 oxc 替代 esbuild

---

### 8. TypeScript 类型完善

**建议:**
- 为 `CoordinationTask` 添加更严格的类型定义
- 考虑使用 `zod` 或 `io-ts` 进行运行时类型验证

---

## 📊 统计信息

| 类别 | 数量 |
|------|------|
| 高优先级问题 | 1 |
| 中优先级问题 | 1 |
| 低优先级问题 | 1 |
| 功能完善建议 | 3 |
| 技术债务 | 2 |
| **总计** | **8** |

---

## ✅ 已完成

### AgentConfigPanel.tsx 测试覆盖率 (原 85.71% → 100%)
- 添加 `initialAgents` prop 支持初始数据
- 实现实际的代理添加/编辑/删除功能
- 添加完整的测试覆盖

---

## 下一步行动

1. [x] 解决 AgentConfigPanel 测试问题 ✅
2. [ ] 完善 SwarmCoordinatorPanel 进度更新测试
3. [ ] 添加 appStore 错误处理测试 (等待后端实现)
4. [ ] 实现代理连接测试功能
5. [ ] 实现群组持久化
6. [ ] 实现任务执行功能
