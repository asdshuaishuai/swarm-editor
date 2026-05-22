# Human Control Tower 设计文档

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现"人机协同"理念的核心 UI —— 统筹控制台，让人不深入代码细节即可做方向决策。

**Architecture:** 独立路由页面 `/control`，复用现有后端 API（Swarm/Supervisor/A2A/Consensus），新增 `get_dashboard_summary` 聚合 API。HumanControlPanel 内含 4 个 Tab：统筹控制台、执行证据、目标定义、决策面板。

**Tech Stack:** Go 后端聚合 API + React 前端路由页面 + Zustand 状态管理

---

## 1. 布局与路由

**位置:** 独立路由页面 `/control`，与 `/editor`、`/swarm`、`/team` 并列。

**导航入口:**
- 标题栏中间 "Swarm Editor" 点击弹出页面选择器（或 ActivityBar 图标）
- Command Palette 输入 "Control Tower" 跳转

**页面结构:** 全高面板，顶部 Tab 栏切换 4 个视图：
```
┌──────────────────────────────────────────────────────────────┐
│ [Dashboard] [Evidence] [Goals] [Decisions]     ← Tab 栏     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  当前 Tab 内容                                                │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Tab 1: Dashboard（统筹控制台）

**数据源:** 新增 `get_dashboard_summary` 聚合 API

**API 响应结构:**
```json
{
  "tasks": { "running": 3, "pending": 1, "completed": 12, "failed": 1 },
  "agents": { "online": 4, "offline": 1, "error": 0 },
  "risks": { "level": "low|medium|high", "alerts": [...] },
  "a2a": { "recentCount": 47, "lastHourCount": 12 },
  "consensus": { "pendingVotes": 0, "rejectedToday": 0 },
  "recentCompleted": [
    { "taskId": "...", "prompt": "...", "status": "completed", "duration": "45s" }
  ]
}
```

**UI 布局:**
- 顶部：4 张状态卡片（活跃任务 / Agent 健康 / 风险警报 / A2A 活动）
- 中部：决策摘要列表（需要人介入的项：共识未通过、Agent 卡住、Handoff 待确认）
  - 每项：风险标签 + 一句话摘要 + 操作按钮
- 底部：最近 5 条完成任务

**风险等级自动计算:**
- 高：共识未通过 + Agent 错误 > 50% + 任务超时
- 中：Agent 错误 > 0 + Handoff 待确认
- 低：一切正常

**后端实现:** `internal/api/handler_dashboard.go` 新建文件，`get_dashboard_summary` 处理函数聚合调用：
- `swarm.GetAllTasks()` → 任务统计
- `supervisor.GetStats()` → Agent 健康
- `consensus.GetActiveTasks()` → 共识状态
- `a2aRouter.MessageLog().Recent(50)` → A2A 活动

---

## 3. Tab 2: Evidence（执行证据）

**数据源:** 现有 `get_swarm_tasks` + `a2a_message_log` + `git_diff`

**UI:** 按任务分组的证据卡片列表

**每张 EvidenceCard 包含:**
- 任务名称 + Agent 名称 + 时间戳
- 变更摘要（新增/修改/删除文件数，从 task result metadata 提取）
- 执行输出摘要（task result content 前 200 字符）
- 风险标记（文件变更 > 10 个 = 高风险，> 3 个 = 中风险）
- 操作按钮：查看 Diff / 在编辑器中打开

**后端增强:** `execute_task` 完成后，在 task metadata 中自动记录：
- `changedFiles`: 变更文件列表
- `duration`: 执行耗时
- `outputPreview`: 输出前 200 字符

---

## 4. Tab 3: Goals（目标定义）

**功能:** 结构化任务下发入口

**UI 表单:**
- 目标描述文本框（必填，即 prompt）
- 约束条件标签输入（可选，如"不改测试文件"）
- 验收标准列表（可选，如"所有测试通过"）
- 优先级选择（low/medium/high/critical）
- 风险偏好（低/中/高）
- 最大变更文件数（可选数字输入）

**后端:** 增强 `submit_task` 请求，新增字段：
```go
type SubmitTaskRequest struct {
    SwarmID        string   `json:"swarmId"`
    Prompt         string   `json:"prompt"`
    Priority       string   `json:"priority"`
    Constraints    []string `json:"constraints,omitempty"`
    Acceptance     []string `json:"acceptance,omitempty"`
    RiskTolerance  string   `json:"riskTolerance,omitempty"`
    MaxFiles       int      `json:"maxFiles,omitempty"`
}
```

新字段存入 task metadata，不在核心调度逻辑中强制校验（YAGNI），仅作为人设定的参考。

---

## 5. Tab 4: Decisions（决策面板）

**数据源:** `get_consensus` + `a2a_message_log` (HelpRequest) + `get_swarm_tasks` (stuck tasks)

**UI:** 只显示需要人介入的决策项列表：
- 共识未通过 → 投票详情 + "强制通过/重新执行"按钮
- Agent 请求帮助 → 请求内容 + "批准/拒绝"
- 任务超时 → 超时任务 + "取消/重试"
- Handoff 待确认 → 源/目标 Agent + "接受/拒绝"

**每个决策项显示:**
- 风险徽章（红/黄/绿）
- 一句话描述
- 发生时间
- 推荐操作
- 操作按钮

---

## 6. 文件清单

### 后端
- **Create:** `internal/api/handler_dashboard.go` — `get_dashboard_summary` 聚合 API
- **Modify:** `internal/api/handler.go` — 添加路由 `get_dashboard_summary`
- **Modify:** `internal/api/handler_swarm.go` — `handleSubmitTask` 扩展新字段
- **Modify:** `internal/swarm/task.go` — Task metadata 添加 constraints/acceptance 字段

### 前端
- **Create:** `ui/src/panels/HumanControlPanel.tsx` — 主面板（4 Tab）
- **Create:** `ui/src/components/EvidenceCard.tsx` — 证据卡片组件
- **Create:** `ui/src/components/GoalForm.tsx` — 目标定义表单组件
- **Create:** `ui/src/components/DecisionItem.tsx` — 决策项组件
- **Create:** `ui/src/stores/dashboardStore.ts` — Dashboard 聚合数据状态
- **Modify:** `ui/src/App.tsx` — 添加 `/control` 路由
- **Modify:** `ui/src/services/api.ts` — 添加 dashboardApi + 新接口类型

---

## 7. 验证

1. `go build ./...` + `staticcheck ./...` + `go vet ./...` — 后端三关
2. `cd ui && npx tsc --noEmit && npm run test` — 前端两关
3. 访问 `/control` 看到 Dashboard Tab，显示任务统计和风险等级
4. Evidence Tab 显示最近任务的执行证据卡片
5. Goals Tab 填写表单后提交，创建带约束/验收标准的 Swarm Task
6. Decisions Tab 在有共识投票/帮助请求时显示决策项
