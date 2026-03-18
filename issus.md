# Swarm Editor 待解决问题列表

## 更新日期: 2026-03-18

---

## 当前状态

- **UI 总覆盖率**: 96.06%
- **UI 分支覆盖率**: 89.24%
- **UI 测试数量**: 574 个
- **Go 测试**: 11 个包全部通过 (竞态检测)
- **TypeScript 编译**: 通过
- **构建**: 通过 (~600ms)
- **Vite 版本**: 8.0.0 ✅
- **NPM 漏洞**: 0 个 (已修复)
- **ESLint**: 通过 (无警告)

---

## 🟢 技术债务

### 1. TypeScript 类型完善

**建议:**
- 为 `CoordinationTask` 添加更严格的类型定义
- 考虑使用 `zod` 或 `io-ts` 进行运行时类型验证

---

### 2. ~~未使用的导出 (knip 报告)~~ ✅ 已清理

**已完成的清理:**
- ~~`src/hooks/index.ts`~~ - 已删除 (未使用的文件)
- ~~`@tauri-apps/plugin-shell`~~ - 已从 package.json 移除 (未使用的依赖)
- 修复了 `services/index.test.ts` 中未使用的导入

---

## 📝 未覆盖代码分析

### services/index.ts (77.57%)
**说明:** Tauri invoke 路径只能在 Tauri 环境中测试，需要端到端测试覆盖。

### useTheme.ts (90.47% 分支)
**说明:** SSR 边缘情况 (行 15, 25) 在测试环境中无法触发。

---

## 🔧 Go 集成级代码 (需端到端测试)

以下函数涉及进程管理和 ACP 协议通信，无法通过单元测试覆盖：

| 函数 | 文件 | 原因 |
|------|------|------|
| `initializeAgent` | acp/connection.go:219 | 需要实际 ACP 客户端握手 |
| `handleNotification` | acp/server.go:292 | 空函数，为未来通知预留 |
| `executeTask` | swarm/scheduler.go:454 | 需要实际代理连接 |
| `executeOnAgent` | swarm/scheduler.go:553 | 需要实际 ACP 会话 |
| `executeOnWorker` | swarm/coordinator.go:453 | 需要实际代理连接 |
| `decomposeWithCoordinator` | swarm/scheduler.go:631 | 需要 LLM 调用 |

**建议**: 这些函数应在集成测试或端到端测试中覆盖。

---

## 📋 功能完善建议

### 1. 实际后端连接

**待实现:**
1. ⬜ 实现 ACP 协议的实际连接测试
2. ⬜ 添加超时处理
3. ⬜ 显示错误详情给用户

---

## 📊 统计信息

| 类别 | 数量 |
|------|------|
| 高优先级问题 | 0 |
| 中优先级问题 | 0 |
| 低优先级问题 | 0 |
| 功能完善建议 | 1 |
| 技术债务 | 1 |
| **UI 测试** | **574** |
| **Go 测试** | **871** |
| **UI 覆盖率** | **96.06%** |
| **Go 覆盖率** | **88.7%** |
| **总计** | **2** |

---

## ✅ 已完成 (2026-03-18)

### 测试覆盖率提升
- appStore.ts: 96.03% → 100% 语句覆盖
- tauri.ts: 30.76% → 100% 覆盖
- 整体 UI 覆盖率: 94.45% → 96.06%
- 测试数量: 552 → 574

### 新增测试文件
- `tauri.test.ts` - Tauri API 测试 (14 个测试)
- 新增 appStore 初始化错误处理测试
- 新增 loadAgents 成功路径测试

### 代码清理
- 删除未使用的 `hooks/index.ts`
- 移除未使用的依赖 `@tauri-apps/plugin-shell`
- 修复 `services/index.test.ts` 中未使用的导入

### 修复
- AgentPanel.test.tsx stopAgent 测试状态修复

---

## 下一步行动

1. [x] 解决 AgentConfigPanel 测试问题 ✅
2. [x] 解决 SwarmPanel TypeScript 编译错误 ✅
3. [x] 完善 SwarmCoordinatorPanel 进度更新测试 ✅
4. [x] 实现代理连接测试功能 ✅
5. [x] 实现群组持久化 ✅
6. [x] 实现任务执行功能 ✅
7. [x] 升级到 Vite 8 ✅
8. [x] 提升 tauri.ts 测试覆盖率 ✅
9. [x] 提升 appStore.ts 测试覆盖率 ✅
10. [x] 清理未使用的代码和依赖 ✅
11. [ ] 实现实际的后端连接和 ACP 协议