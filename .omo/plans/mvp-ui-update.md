# Swarm Editor MVP UI 深度实现计划

> **目标**: 在现有后端实现计划（Task 1-8）基础上，追加全面的 UI 实现任务，使 Compose Desktop 客户端完全匹配 HTML 设计稿。
>
> **范围**: 全量 Mockup UI（5 个主视图 + 全局组件 + 增强功能）+ 同步扩展后端 DTO/Service
>
> **前置条件**: Task 1-8（后端 Service 层 + 基础 ViewModel）已完成

---

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| API 模式 | HTTP REST (ApiClient) | 与现有代码一致，不引入架构变更 |
| 导航系统 | Compose 自定义状态管理 (MainViewModel) | 简单直接，不需要 Compose Navigation 依赖 |
| Swarm 可视化 | Canvas 动画图 | 匹配 Mockup 设计，Compose Canvas 原生支持 |
| 文件浏览器 | 项目文件树 + Git 变更 | 匹配 Mockup，使用 java.io.File + git CLI |
| 活动日志 | 从 sessions/*.json 提取 | 复用已有持久化数据，无需新后端 |
| CSS 保真度 | 启发式（非像素级） | 使用 Theme.kt 已有颜色系统 |
| 动画复杂度 | Compose AnimatedVisibility | 不引入额外动画库 |
| 实时更新 | 手动刷新（无 WebSocket） | MVP 阶段简化 |

---

## 文件结构（新增文件）

### desktopApp — 新增 View

| 文件 | 职责 |
|------|------|
| `ui/navigation/RailNavigation.kt` | 左侧 5 个视图切换图标栏 |
| `ui/navigation/EnhancedTopBar.kt` | Logo + 项目切换器 + Swarm 状态 + CmdK 触发器 |
| `ui/agents/AgentOrchestrationView.kt` | Agent 编排台主视图 |
| `ui/agents/SwarmVisualization.kt` | Canvas 绘制的 Swarm 可视化图 |
| `ui/agents/AgentCard.kt` | Agent 信息卡片（状态/统计/配置） |
| `ui/plugins/PluginCenterView.kt` | 插件中心主视图（列表态 + 详情态） |
| `ui/plugins/McpDetailView.kt` | MCP Server 详情页 |
| `ui/plugins/SkillDetailView.kt` | Skill 详情页 |
| `ui/plugins/PluginTile.kt` | 插件卡片组件 |
| `ui/files/FileExplorerView.kt` | 文件浏览器主视图 |
| `ui/files/FileTreeView.kt` | 可折叠文件树组件 |
| `ui/activity/ActivityLogView.kt` | 活动日志主视图 |
| `ui/activity/ArchiveTree.kt` | 年/月/日三级可折叠归档树 |
| `ui/activity/EventTimeline.kt` | 事件时间线组件 |
| `ui/common/CommandPalette.kt` | Cmd+K 命令面板 |
| `ui/common/ToastHost.kt` | Toast 通知系统 |
| `ui/chat/ToolCard.kt` | 可折叠工具调用卡片 |
| `ui/chat/CodeCard.kt` | 代码变更卡片（diff 高亮） |
| `ui/chat/ThinkingIndicator.kt` | 三点闪烁思考动画 |
| `ui/chat/MentionDropdown.kt` | @agent 指派下拉框 |
| `ui/dialog/AgentConfigDialog.kt` | Agent 快速配置弹窗 |

### desktopApp — 新增 ViewModel

| 文件 | 职责 |
|------|------|
| `viewmodel/MainViewModel.kt` | 全局视图状态（currentView）+ CmdK 状态 + Toast 队列 |

### backend — 新增 Service

| 文件 | 职责 |
|------|------|
| `service/GitService.kt` | Git 状态查询（branch, staged, modified, diff） |
| `service/ProjectService.kt` | 项目文件树遍历 |

### backend — 修改文件

| 文件 | 变更 |
|------|------|
| `route/AgentRoutes.kt` | 扩展返回 Agent 统计信息 |
| `route/McpRoutes.kt` | 扩展返回 MCP tools 详情 |
| `route/GitRoutes.kt` | 新增 Git 状态 API |
| `route/ProjectRoutes.kt` | 新增项目文件树 API |
| `Main.kt` | 注册新路由 |

---

## 护栏

- ❌ 不引入新的第三方依赖（图表库、树组件库等）
- ❌ 不修改现有 Task 1-8 已完成的文件
- ❌ 不改动 ACP/MCP 协议层
- ❌ 不引入数据库（保持 JSON 文件存储）
- ✅ 使用 Theme.kt 已有颜色系统（GeekColorScheme）
- ✅ 复用 Components.kt 已有组件（StatusDot, AgentIcon, SessionCard 等）
- ✅ 所有新 UI 代码放在 desktopApp 模块
- ✅ 桌面端固定布局，不做响应式

---

## 执行策略

### 并行执行波次

```
Wave 1 (基础架构 — 后端 DTO 扩展 + 全局组件):
├── Task 9:  后端 DTO 扩展 + GitService + ProjectService [unspecified-high]
├── Task 10: MainViewModel + 视图切换系统 [quick]
├── Task 11: 左侧 Rail 导航 + 顶部栏重构 [visual-engineering]
├── Task 12: Toast 通知系统 [quick]
└── Task 13: 命令面板 (CmdK) [unspecified-high]

Wave 2 (核心视图 — 最高价值):
├── Task 14: Agent 编排台视图 + Swarm 可视化 (depends: 9, 10) [visual-engineering]
├── Task 15: 插件中心视图 (depends: 9, 10) [visual-engineering]
├── Task 16: Chat 增强 — ToolCard + CodeCard + Thinking (depends: 10) [visual-engineering]
└── Task 17: 右侧面板增强 — 变更管理 + Inspector + Log (depends: 10) [visual-engineering]

Wave 3 (次级视图 + 收尾):
├── Task 18: 文件浏览器视图 (depends: 9, 10) [visual-engineering]
├── Task 19: 活动日志视图 (depends: 9, 10) [visual-engineering]
├── Task 20: 设置模态框扩展 + Agent 配置弹窗 (depends: 10) [visual-engineering]
└── Task 21: 会话列表增强 + Mention 下拉 (depends: 10) [visual-engineering]

Wave FINAL (验证):
├── Task F1: 计划合规审计 (oracle)
├── Task F2: 代码质量审查 (unspecified-high)
├── Task F3: 实际 QA 验证 (unspecified-high)
└── Task F4: 范围忠实度检查 (deep)
→ 呈现结果 → 获取用户确认
```

### 依赖矩阵

| Task | 依赖 | 阻塞 |
|------|------|------|
| 9 | 无 | 14, 15, 18, 19 |
| 10 | 无 | 11-21 (所有 UI Task) |
| 11 | 10 | 无 |
| 12 | 10 | 无 |
| 13 | 10 | 无 |
| 14 | 9, 10 | 无 |
| 15 | 9, 10 | 无 |
| 16 | 10 | 无 |
| 17 | 10 | 无 |
| 18 | 9, 10 | 无 |
| 19 | 9, 10 | 无 |
| 20 | 10 | 无 |
| 21 | 10 | 无 |

### Agent 分配摘要

- **Wave 1**: 5 个任务 — T9 `unspecified-high`, T10 `quick`, T11 `visual-engineering`, T12 `quick`, T13 `unspecified-high`
- **Wave 2**: 4 个任务 — T14-T17 全部 `visual-engineering`
- **Wave 3**: 4 个任务 — T18-T21 全部 `visual-engineering`
- **FINAL**: 4 个任务 — F1 `oracle`, F2-F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 9. 后端 DTO 扩展 + GitService + ProjectService

  **What to do**:
  - 扩展 `AgentDto` 增加字段: `description: String`, `stats: AgentStatsDto(tasks: Int, successRate: Float, avgLatency: String)`
  - 扩展 `McpServerDto` 增加字段: `tools: List<McpToolDto>`, `env: Map<String, String>`, `downloads: String`, `rating: Float`, `ratingCount: Int`, `published: String`, `updated: String`, `repository: String`, `categories: List<String>`, `agents: List<String>`
  - 新增 `McpToolDto(name: String, description: String, params: List<McpToolParamDto>)`
  - 新增 `GitStatusDto(branch: String, ahead: Int, behind: Int, staged: Int, modified: Int, untracked: Int)`
  - 新增 `FileNodeDto(name: String, path: String, isDirectory: Boolean, children: List<FileNodeDto>?, changeStatus: String?)`
  - 创建 `GitService.kt`: 调用 `git status`, `git branch`, `git diff --stat` 命令，解析输出返回 `GitStatusDto`
  - 创建 `ProjectService.kt`: 遍历项目目录（排除 .git, build, node_modules），返回 `FileNodeDto` 树
  - 新增 `GitRoutes.kt`: `GET /api/git/status`
  - 新增 `ProjectRoutes.kt`: `GET /api/project/tree`
  - 修改 `Main.kt` 注册新路由

  **Must NOT do**:
  - 不修改现有 API 端点的响应格式（只追加字段）
  - 不引入新的第三方依赖

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 后端 Service + Routes 创建，涉及多文件协调
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: 此任务是创建 GitService 类，不是执行 git 操作

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 10, 11, 12, 13)
  - **Blocks**: Tasks 14, 15, 18, 19
  - **Blocked By**: 无

  **References**:

  **Pattern References**:
  - `backend/src/main/kotlin/com/swarmeditor/backend/service/AgentService.kt` — Service 层模式（StateFlow + suspend 函数）
  - `backend/src/main/kotlin/com/swarmeditor/backend/route/AgentRoutes.kt` — 路由定义模式

  **API/Type References**:
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/api/ApiClient.kt` — 现有 DTO 定义（AgentDto, McpServerDto 等），需要扩展字段
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1010-1064 行 — JavaScript 数据对象结构（agents/mcpServers/fileChanges）

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Git 状态 API 返回正确数据
    Tool: Bash (curl)
    Preconditions: 项目目录是 git 仓库
    Steps:
      1. 启动后端: ./gradlew :backend:run
      2. curl http://localhost:8080/api/git/status
      3. 验证返回 JSON 包含 branch, staged, modified, untracked 字段
    Expected Result: HTTP 200, JSON 包含所有必需字段
    Evidence: .omo/evidence/task-9-git-status.json

  Scenario: 项目文件树 API 返回目录结构
    Tool: Bash (curl)
    Preconditions: 后端运行中
    Steps:
      1. curl http://localhost:8080/api/project/tree
      2. 验证返回 JSON 是嵌套的 FileNodeDto 树
      3. 验证不包含 .git, build, node_modules 目录
    Expected Result: HTTP 200, 树结构正确，排除列表生效
    Evidence: .omo/evidence/task-9-project-tree.json
  ```

  **Commit**: YES
  - Message: `feat(backend): expand DTOs and add GitService/ProjectService`
  - Files: `backend/src/main/kotlin/com/swarmeditor/backend/`

- [x] 10. MainViewModel + 视图切换系统

  **What to do**:
  - 创建 `MainViewModel.kt`:
    - `currentView: StateFlow<String>` — 管理 'chat'/'agents'/'plugins'/'files'/'activity' 五个视图
    - `switchView(view: String)` — 切换视图
    - `showCmdK: StateFlow<Boolean>` — 命令面板显示状态
    - `toggleCmdK()` — 切换命令面板
    - `toasts: StateFlow<List<ToastData>>` — Toast 队列
    - `showToast(message: String, type: ToastType)` — 添加 Toast
    - `dismissToast(id: String)` — 移除 Toast
    - `showAgentConfig: StateFlow<String?>` — Agent 配置弹窗（null=关闭，非null=agentId）
  - 创建 `ToastData(id: String, message: String, type: ToastType, createdAt: Long)` data class
  - 创建 `ToastType` enum: INFO, SUCCESS, ERROR
  - 修改 `App.kt` 使用 `MainViewModel` 管理全局状态

  **Must NOT do**:
  - 不使用 Compose Navigation 库
  - 不修改现有 ViewModel 的接口

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件 ViewModel 创建，逻辑简单
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 9, 11, 12, 13)
  - **Blocks**: Tasks 11-21 (所有 UI Task)
  - **Blocked By**: 无

  **References**:

  **Pattern References**:
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/AgentViewModel.kt` — ViewModel 模式（StateFlow + suspend）
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1066-1072 行 — JavaScript 全局状态变量

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 视图切换正常工作
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 启动: ./gradlew :desktopApp:run
      2. 验证默认视图是 'chat'
      3. 点击 Rail 的 Agent 图标
      4. 验证 currentView 变为 'agents'
    Expected Result: 视图切换无异常
    Evidence: .omo/evidence/task-10-view-switch.txt
  ```

  **Commit**: YES
  - Message: `feat(desktop): MainViewModel for view navigation state`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/viewmodel/MainViewModel.kt`

- [x] 11. 左侧 Rail 导航 + 顶部栏重构

  **What to do**:
  - 创建 `RailNavigation.kt`:
    - 5 个图标按钮: 会话(chat) / Agent编排(agents) / 插件(plugins) / 文件(files) / 活动(activity)
    - 激活态: 左侧 2px 紫色竖条 + 紫色背景 + 发光阴影
    - badge 数字显示（会话 badge 显示未读数）
    - 底部 Git 按钮 + 终端按钮（占位）
  - 创建 `EnhancedTopBar.kt`:
    - Logo 区: 彩虹 conic-gradient 环 + "Swarm Editor" + "MVP" 徽章
    - 项目切换器: `swarm-editor · main` 分支显示
    - Swarm 状态: Agent 头像堆叠 + 在线计数
    - CmdK 触发器: 搜索框样式 + `⌘K` 快捷键标签
    - 通知按钮 + 设置按钮 + 用户头像
  - 修改 `App.kt` 使用新组件替换现有 Header

  **Must NOT do**:
  - 不删除现有的 AgentBar 组件（可能被其他地方引用）
  - Logo 使用 Compose Canvas 绘制，不引入 SVG 库

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 纯 UI 组件，涉及视觉还原
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 9, 10, 12, 13)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/agent/AgentBar.kt` — 现有 Agent 图标栏
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/theme/Theme.kt` — 颜色定义（Ac, Bg, Tx 等）

  **API/Type References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 580-612 行 — Topbar HTML 结构
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 616-625 行 — Rail HTML 结构

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Rail 导航切换视图
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 启动: ./gradlew :desktopApp:run
      2. 点击 Rail 的插件图标
      3. 验证主内容区切换到插件中心
      4. 点击 Rail 的会话图标
      5. 验证主内容区切换回聊天
    Expected Result: 视图切换流畅，激活态指示正确
    Evidence: .omo/evidence/task-11-rail-nav.png

  Scenario: 顶部栏显示所有元素
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 启动: ./gradlew :desktopApp:run
      2. 截图顶部栏区域
      3. 验证包含: Logo, 项目名, Agent 头像, 搜索框, 通知, 设置, 用户头像
    Expected Result: 所有元素可见，布局与 Mockup 一致
    Evidence: .omo/evidence/task-11-topbar.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Rail navigation and enhanced topbar`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/navigation/`

- [x] 12. Toast 通知系统

  **What to do**:
  - 创建 `ToastHost.kt`:
    - `ToastHost` Composable: 固定在右下角（bottom: 40px, right: 24px）
    - `ToastItem` Composable: 圆角卡片 + icon + 文本 + 滑入/滑出动画
    - 支持 3 种类型: SUCCESS (绿色 ✓) / INFO (蓝色 ⓘ) / ERROR (红色 ✗)
    - 自动消失: 2.6 秒后滑出
    - 最多同时显示 3 个 Toast
    - 动画: `AnimatedVisibility` + `slideInHorizontally` / `slideOutHorizontally`
  - 在 `App.kt` 中集成 `ToastHost`，绑定 `MainViewModel.toasts`
  - 在现有操作中添加 Toast 触发: Agent 连接成功/失败、MCP 添加/删除等

  **Must NOT do**:
  - 不引入第三方 Toast 库
  - Toast 不需要操作按钮（仅信息展示）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件组件，逻辑简单
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 9, 10, 11, 13)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1555-1561 行 — Toast JavaScript 实现

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Toast 成功通知显示
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 触发一个成功操作（如 Agent 连接）
      2. 验证右下角出现绿色 Toast
      3. 等待 3 秒
      4. 验证 Toast 消失
    Expected Result: Toast 滑入显示，2.6s 后滑出消失
    Evidence: .omo/evidence/task-12-toast-success.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Toast notification system`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/common/ToastHost.kt`

- [x] 13. 命令面板 (Cmd+K)

  **What to do**:
  - 创建 `CommandPalette.kt`:
    - 全屏半透明遮罩 + 居中 580px 宽弹窗
    - 搜索输入框 + ESC 标签
    - 命令列表分组: 命令 / Agent 配置 / 视图
    - 键盘导航: 上下箭头选择，Enter 执行
    - 搜索过滤: 实时过滤命令名称
  - 命令列表数据:
    - 命令组: 新建会话 (⌘N) / 打开设置 (⌘,)
    - Agent 配置组: 每个 Agent 的配置入口
    - 视图组: 会话/Agent编排/插件/文件/活动日志
  - 全局快捷键: `⌘K` / `Ctrl+K` 打开，`Escape` 关闭
  - 在 `App.kt` 中集成，绑定 `MainViewModel.showCmdK`

  **Must NOT do**:
  - 不引入命令面板第三方库
  - 不支持模糊搜索（仅前缀/包含匹配）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及键盘事件处理 + 焦点管理 + 动画
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 9, 10, 11, 12)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 995-1005 行 — CmdK HTML 结构
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1514-1536 行 — CmdK JavaScript 实现

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Cmd+K 打开命令面板
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 按下 Ctrl+K
      2. 验证命令面板出现
      3. 输入 "agent"
      4. 验证列表过滤到 Agent 相关命令
      5. 按 Escape
      6. 验证命令面板关闭
    Expected Result: 快捷键触发，搜索过滤正常，ESC 关闭
    Evidence: .omo/evidence/task-13-cmdk.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Command palette (Cmd+K)`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/common/CommandPalette.kt`

- [x] 14. Agent 编排台视图 + Swarm 可视化

  **What to do**:
  - 创建 `AgentOrchestrationView.kt`:
    - 顶部栏: 标题 "Agent 编排台" + 副标题（Agent 数/在线数）+ "添加 Agent" 按钮
    - Swarm 可视化区（见下方）
    - "在线 Agents" 分组 + Agent 卡片列表
    - "待安装" 分组 + 未安装 Agent 卡片（含安装提示和按钮）
  - 创建 `SwarmVisualization.kt`:
    - Canvas 绘制: 中心旋转图标（conic-gradient 效果，12s 旋转一圈）
    - 5 个卫星节点: 圆形 + Agent 颜色 + 字母 + 发光阴影
    - 虚线连线: 从中心到各节点
    - 节点交互: 点击节点打开 Agent 配置弹窗
    - 在线/离线状态: opacity 区分
  - 创建 `AgentCard.kt`:
    - 渐变顶部条（Agent 颜色）
    - Logo + 名称 + 命令 + 版本 + 状态 Chip（已连接/未连接/未安装）
    - 描述文本
    - 统计网格: 任务数 / 成功率 / 平均延迟
    - 配置按钮

  **Must NOT do**:
  - 不引入图表/图形库（使用 Compose Canvas 原生绘制）
  - 不实现真实的 Agent 安装流程（仅 UI 占位）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 复杂视觉组件，Canvas 绘制 + 动画
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 15, 16, 17)
  - **Blocks**: 无
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 796-884 行 — Agent 编排台 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 808-822 行 — Swarm 可视化 SVG
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 826-864 行 — Agent 卡片 HTML

  **API/Type References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1010-1016 行 — agents 数据结构

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Agent 编排台显示 Swarm 可视化
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 点击 Rail 的 Agent 图标
      2. 验证显示 Swarm 可视化图
      3. 验证中心节点旋转
      4. 验证 5 个卫星节点可见
      5. 验证连线可见
    Expected Result: 可视化动画正常，节点颜色正确
    Evidence: .omo/evidence/task-14-swarm-viz.png

  Scenario: Agent 卡片显示状态和统计
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，至少 1 个 Agent 已连接
    Steps:
      1. 在 Agent 编排台查看 Claude Code 卡片
      2. 验证显示: 名称、版本、状态(已连接)、描述、统计(任务/成功率/延迟)
      3. 点击配置按钮
      4. 验证 Agent 配置弹窗打开
    Expected Result: 卡片信息完整，配置弹窗正常
    Evidence: .omo/evidence/task-14-agent-card.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Agent orchestration view with Swarm visualization`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/agents/`

- [x] 15. 插件中心视图

  **What to do**:
  - 创建 `PluginCenterView.kt`:
    - 两态切换: 列表态 ↔ 详情态
    - 列表态:
      - Hero 区: 标题 + 描述 + 统计（已安装数/工具数/运行中数/今日调用）
      - 分类头部: 标题 + 计数 badge + 过滤 chips（全部/已启用/最近更新）
      - 卡片网格: `LazyVerticalGrid`，minWidth 360px
    - MCP/Skills 子标签切换
    - 搜索过滤
  - 创建 `PluginTile.kt`:
    - 顶部彩色条（Agent 颜色）
    - 54px 方形图标 + 名称 + tag (MCP/本地/MCP发现)
    - 发布者 + 版本 + 描述（2 行截断）
    - 底部: 下载量 + 评分 + tools 数 + 状态 Chip
    - 点击进入详情态
  - 创建 `McpDetailView.kt`:
    - 顶部大图区: 84px 图标 + 名称 + 状态 + 发布者 + 评分 + 简介
    - 操作按钮: 重启服务 / 复制配置 / 卸载
    - Tabs: Details / Tools / Configuration / Changelog
    - 侧边信息面板: 标识符/版本/协议/许可证/分类/授权Agent/资源链接
    - Tools Tab: 工具表格（名称 + 描述 + 参数 + req badge）
    - Config Tab: 启动命令 + 环境变量表格
  - 创建 `SkillDetailView.kt`:
    - 类似 MCP 详情，但 Tabs 为: Overview / Structure / Agents / Usage
    - Structure Tab: 树状目录显示（使用缩进 + 图标）
    - Agents Tab: 关联 Agent 卡片 + 调用统计

  **Must NOT do**:
  - 不实现真实的 MCP Server 安装/卸载流程
  - 不实现 Skill 编辑器（仅展示）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 复杂多态 UI，列表+详情+多 Tab
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 14, 16, 17)
  - **Blocks**: 无
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 887-913 行 — 插件中心 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1219-1265 行 — MCP 详情渲染
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1267-1310 行 — Skill 详情渲染
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/mcp/McpPanel.kt` — 现有 MCP 面板模式

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 插件中心显示 MCP Server 列表
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，mcp-servers.json 有数据
    Steps:
      1. 点击 Rail 的插件图标
      2. 验证显示 Hero 区 + MCP Server 卡片网格
      3. 点击 "MCP" 子标签
      4. 验证只显示 MCP Server
      5. 点击一个 MCP Server 卡片
      6. 验证进入详情页，显示 Tools/Config/Changelog tabs
    Expected Result: 列表→详情切换流畅，数据正确显示
    Evidence: .omo/evidence/task-15-plugin-center.png

  Scenario: MCP 详情页显示工具列表
    Tool: interactive_bash (tmux)
    Preconditions: 已进入 MCP Server 详情页
    Steps:
      1. 点击 "Tools" tab
      2. 验证显示工具表格
      3. 验证每个工具有名称、描述、参数列表
      4. 验证必需参数有 "req" 标记
    Expected Result: 工具表格完整，参数标记正确
    Evidence: .omo/evidence/task-15-mcp-tools.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Plugin center view with MCP/Skill detail pages`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/plugins/`

- [x] 16. Chat 增强 — ToolCard + CodeCard + ThinkingIndicator

  **What to do**:
  - 创建 `ToolCard.kt`:
    - 可折叠卡片: 圆角边框 + 渐变背景
    - 头部: 工具图标 + 标题 + 耗时 + 折叠箭头
    - 展开体: 等宽字体命令输出
    - 结果行: 绿色 ok-pill + 耗时
    - 默认第一张展开，其他折叠
    - 点击头部切换展开/折叠
  - 创建 `CodeCard.kt`:
    - 文件头: 文件图标 + 扩展名标签 + 文件名 + diff 统计（+N/-N）+ 操作按钮（复制）
    - Diff 行: 行号列 + 内容列，diff-add 绿色背景 / diff-del 红色背景
    - 语法高亮: 关键字紫色、函数名蓝色、字符串绿色
  - 创建 `ThinkingIndicator.kt`:
    - 三点闪烁动画: `@keyframes blink` 效果
    - 5px 圆点，紫色背景，依次延迟 0.2s
    - 显示 "正在审查" 等文字
  - 修改 `ChatArea.kt`:
    - 消息列表支持渲染 ToolCard / CodeCard / ThinkingIndicator
    - UiMessage 扩展: 增加 `toolCards: List<ToolCardData>`, `codeCards: List<CodeCardData>`, `isThinking: Boolean`
    - Agent 消息增加: 角色标签 (AGENT/REVIEWING) + 彩色 tag + 时间戳

  **Must NOT do**:
  - 不实现真实的代码语法高亮解析器（使用简单正则匹配）
  - 不支持嵌套 ToolCard

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 复杂消息渲染组件，涉及动画和交互
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 14, 15, 17)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 690-753 行 — Tool Card HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 708-735 行 — Code Card HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 756-768 行 — Thinking 动画
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/ChatArea.kt` — 现有聊天区

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: ToolCard 展开/折叠
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，聊天区有包含 ToolCard 的消息
    Steps:
      1. 查看 Agent 消息中的 ToolCard
      2. 验证默认第一张展开，显示命令输出
      3. 点击第一张头部
      4. 验证折叠，显示箭头方向变化
      5. 点击第二张头部
      6. 验证展开
    Expected Result: 展开/折叠切换正常，只有一张展开
    Evidence: .omo/evidence/task-16-toolcard.png

  Scenario: CodeCard 显示 diff
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，聊天区有包含 CodeCard 的消息
    Steps:
      1. 查看 Agent 消息中的 CodeCard
      2. 验证显示文件名 + diff 统计
      3. 验证新增行绿色背景，删除行红色背景
      4. 验证行号正确
    Expected Result: diff 渲染正确，颜色区分清晰
    Evidence: .omo/evidence/task-16-codecard.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Chat enhancements - ToolCard, CodeCard, ThinkingIndicator`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/chat/`

- [x] 17. 右侧面板增强 — 变更管理 + Inspector + Log

  **What to do**:
  - 重写 `RightPanel.kt`:
    - 3 个 Tabs: 变更 / 检查 / 日志（替换现有的 MCP/Skills/Diff）
    - 变更 Tab:
      - "全部接受" 按钮
      - 文件变更列表: 扩展名标签 + 文件名 + diff 统计 + 接受/拒绝按钮
      - 选中文件展开 diff 预览
      - 会话统计网格: Token / 工具调用 / 耗时 / 成本
    - 检查 Tab:
      - 选中文件的详细信息: 图标 + 文件名 + 路径
    - 日志 Tab:
      - 过滤 chips: 全部 / MCP / 文件
      - 事件时间线: 彩色圆点 + 时间 + Actor + 动作

  **Must NOT do**:
  - "接受/拒绝" 仅做 UI 状态变更，不做真实的 git 操作
  - 不实现文件内容预览（仅显示 diff 摘要）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 多 Tab 面板重构，涉及状态管理和交互
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 14, 15, 16)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 952-959 行 — Ctx 面板 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1364-1377 行 — Ctx 面板渲染逻辑
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/RightPanel.kt` — 现有右侧面板

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 变更文件接受/拒绝
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，右侧面板显示变更 tab
    Steps:
      1. 查看变更文件列表
      2. 点击第一个文件的 ✓ 按钮
      3. 验证按钮变为已接受状态
      4. 点击第二个文件的 ✗ 按钮
      5. 验证文件项降低透明度
      6. 点击 "全部接受"
      7. 验证所有文件标记为已接受
    Expected Result: 接受/拒绝状态切换正常
    Evidence: .omo/evidence/task-17-changes.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Right panel enhancements - change management, inspector, log`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/RightPanel.kt`

- [x] 18. 文件浏览器视图

  **What to do**:
  - 创建 `FileExplorerView.kt`:
    - 顶部栏: 项目名 + 路径 + 文件数 + 过滤 chips（全部/仅变更）
    - 统计卡片: 总文件数 / 已修改 / 新增
    - 文件树 + 主内容区布局
  - 创建 `FileTreeView.kt`:
    - 可折叠目录树: 📂 目录节点 + 📄 文件节点
    - 文件颜色: `.kt` 黄色, `.json` 黄色, `.md` 白色
    - 变更标记: modified 黄色, new 绿色
    - 点击目录折叠/展开
    - 点击文件选中（高亮）
    - 通过 `ProjectService` API 获取文件树数据
    - Git 变更状态通过 `GitService` API 获取

  **Must NOT do**:
  - 不实现文件内容编辑器
  - 不实现拖放操作
  - 不支持右键菜单
  - 文件树不做虚拟化（MVP 限制目录深度或文件数量）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 树形组件 + 文件系统交互
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 19, 20, 21)
  - **Blocks**: 无
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 915-930 行 — 文件视图 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1379-1383 行 — 文件树渲染逻辑

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 文件树显示项目目录结构
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 点击 Rail 的文件图标
      2. 验证显示项目文件树
      3. 验证 .git, build, node_modules 目录被排除
      4. 点击一个目录节点
      5. 验证展开/折叠切换
      6. 验证变更文件有颜色标记
    Expected Result: 文件树正确显示，排除列表生效，变更标记可见
    Evidence: .omo/evidence/task-18-file-tree.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): File explorer view with project file tree`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/files/`

- [x] 19. 活动日志视图

  **What to do**:
  - 创建 `ActivityLogView.kt`:
    - 顶部栏: 标题 + 副标题 + 过滤 chips（全部/MCP/文件/命令）
    - 左侧: 归档树（通过侧边栏渲染）
    - 右侧: 会话详情 + 事件时间线
  - 创建 `ArchiveTree.kt`:
    - 三级可折叠树: 年 → 月 → 日 → 会话项
    - 每级显示: 折叠箭头 + 图标 + 标签 + 计数 badge
    - "今天" 标记: 紫色 badge
    - 点击会话项选中，联动右侧时间线
    - 数据来源: 从 `SessionService` 获取所有 session，按日期分组
  - 创建 `EventTimeline.kt`:
    - 时间线条目: 彩色圆点 + 竖向连线 + 时间戳 + Actor + 动作 + 详情
    - 事件类型 tag: mcp(绿色) / file(紫色) / cmd(蓝色)
    - 会话统计: 持续时间 / 事件数 / Token / Agent
  - 创建 `ActivityService.kt`（后端）:
    - 从 `sessions/*.json` 中提取消息和事件
    - 按日期分组返回归档数据

  **Must NOT do**:
  - 不实现实时事件流（仅历史数据）
  - 不支持事件导出（仅 UI 占位）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 复杂树形 + 时间线组件
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18, 20, 21)
  - **Blocks**: 无
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 932-949 行 — 活动日志视图 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1314-1362 行 — 归档树 + 时间线渲染逻辑
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1051-1064 行 — archiveData 数据结构

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 归档树按日期分组显示会话
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，sessions 目录有历史会话
    Steps:
      1. 点击 Rail 的活动日志图标
      2. 验证左侧显示归档树
      3. 验证年/月/日三级结构
      4. 点击一个日期节点展开
      5. 验证显示该日期下的会话列表
      6. 点击一个会话
      7. 验证右侧显示事件时间线
    Expected Result: 归档树层级正确，会话选择联动时间线
    Evidence: .omo/evidence/task-19-archive-tree.png

  Scenario: 事件时间线显示会话详情
    Tool: interactive_bash (tmux)
    Preconditions: 已选中一个会话
    Steps:
      1. 查看时间线条目
      2. 验证每个条目有: 时间戳、Actor、动作、详情
      3. 验证事件类型 tag 颜色正确
      4. 验证会话统计（持续时间/事件数/Token）显示
    Expected Result: 时间线数据完整，颜色区分正确
    Evidence: .omo/evidence/task-19-timeline.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Activity log view with archive tree and timeline`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/activity/`

- [x] 20. 设置模态框扩展 + Agent 配置弹窗

  **What to do**:
  - 扩展 `SettingsModal.kt`:
    - 侧边导航从 3 项扩展到 7 项: Agent配置 / MCP管理 / Skills管理 / 通用 / 外观 / 快捷键
    - 通用 Tab: 默认工作目录输入框 + 默认 Agent 下拉选择
    - 外观 Tab: 主题预设选择（深色/浅色/系统）
    - 快捷键 Tab: 快捷键列表（命令名称 + 按键组合）
    - Agent 配置 Tab 增强: Provider 预设选择 + API Key + Base URL + Model 选择 + Max Tokens + Temperature
    - MCP 管理 Tab 增强: 导入 JSON 按钮 + Agent 授权 chips 切换
    - Skills 管理 Tab 增强: 扫描本地按钮 + 关联 Agent tags
  - 创建 `AgentConfigDialog.kt`:
    - 独立弹窗（非 Settings 内部）
    - Agent 头像 + 名称 + 版本 + 状态 chip
    - ACP 命令输入 + 配置文件路径 + API Key 输入
    - 取消/保存按钮
    - 通过 `MainViewModel.showAgentConfig` 控制显示

  **Must NOT do**:
  - 不实现主题切换逻辑（仅 UI 占位，固定深色主题）
  - 不实现快捷键自定义（仅显示默认快捷键）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 表单组件扩展 + 弹窗组件
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18, 19, 21)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 977-1008 行 — 设置模态框 HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1395-1509 行 — 设置 Tab 渲染逻辑
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1385-1393 行 — Agent 配置弹窗
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/settings/SettingsModal.kt` — 现有设置模态框

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 设置模态框显示所有 Tab
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 点击设置按钮（或按 Ctrl+,）
      2. 验证侧边导航显示 7 个选项
      3. 逐个点击每个 Tab
      4. 验证每个 Tab 内容正确渲染
    Expected Result: 所有 Tab 可切换，内容完整
    Evidence: .omo/evidence/task-20-settings-tabs.png

  Scenario: Agent 配置弹窗独立显示
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 在 Agent 编排台点击一个 Agent 卡片的配置按钮
      2. 验证弹出独立的 Agent 配置弹窗
      3. 验证显示: Agent 信息 + ACP 命令 + 配置文件 + API Key
      4. 点击取消关闭
    Expected Result: 弹窗独立于 Settings，表单字段完整
    Evidence: .omo/evidence/task-20-agent-config.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Settings modal expansion + Agent config dialog`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/settings/`, `ui/dialog/`

- [x] 21. 会话列表增强 + Mention 下拉

  **What to do**:
  - 增强 `SessionPanel.kt`:
    - 日期分组: 今天 / 昨天 / 本周 / 更早
    - 每个会话项: Agent 头像 + 标题 + Agent 名称 + 相对时间 + 任务数 badge
    - Hover 显示操作按钮（删除/归档）
    - 搜索框实际过滤功能
  - 创建 `MentionDropdown.kt`:
    - 在 Composer 上方弹出
    - 显示 Agent 列表: 头像 + 名称 + 状态
    - 键盘导航: 上下箭头选择，Enter 确认
    - 输入 `@` 触发，继续输入过滤 Agent 名称
    - 选择后插入 `@AgentName` 到输入框
  - 增强 `ChatArea.kt` Composer:
    - 附件 chip 按钮（占位）
    - MCP chip 按钮（切换到插件视图）
    - Skill chip 按钮（切换到插件视图）
    - Token 计数显示

  **Must NOT do**:
  - 不实现附件上传功能（仅 UI 按钮）
  - 不实现 `#file` 引用（仅 `@agent`）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 列表增强 + 下拉组件 + 输入交互
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18, 19, 20)
  - **Blocks**: 无
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 1018-1031 行 — chats 数据结构（日期分组）
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 771-793 行 — Composer HTML
  - `docs/superpowers/specs/mvp-design-mockup.html` 第 206-216 行 — Mention dropdown CSS
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/SessionPanel.kt` — 现有会话面板
  - `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/ChatArea.kt` — 现有聊天区

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: 会话列表按日期分组
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中，有多个不同日期的会话
    Steps:
      1. 查看会话列表
      2. 验证显示 "今天"、"昨天"、"本周" 分组标签
      3. 验证每个会话项显示: Agent 头像、标题、Agent 名称、相对时间
      4. 悬停一个会话项
      5. 验证显示操作按钮
    Expected Result: 分组正确，信息完整，hover 交互正常
    Evidence: .omo/evidence/task-21-session-groups.png

  Scenario: @mention 下拉选择 Agent
    Tool: interactive_bash (tmux)
    Preconditions: 桌面应用运行中
    Steps:
      1. 在聊天输入框输入 "@"
      2. 验证弹出 Agent 下拉列表
      3. 输入 "cl"
      4. 验证列表过滤到 Claude Code
      5. 按 Enter 选择
      6. 验证输入框插入 "@Claude Code"
    Expected Result: 下拉过滤正常，选择插入正确
    Evidence: .omo/evidence/task-21-mention.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): Session list enhancements + mention dropdown`
  - Files: `desktopApp/src/main/kotlin/com/swarmeditor/desktop/ui/session/`, `ui/chat/`

---

## Final Verification Wave

- [x] F1. **计划合规审计** — `oracle` [APPROVE]
  逐一检查 "Must Have" 是否实现，"Must NOT Have" 是否违反。检查 `.omo/evidence/` 中的证据文件。
  输出: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **代码质量审查** — `unspecified-high` [APPROVE]
  运行 `./gradlew build` + linter。检查所有变更文件的 `as any`/`@ts-ignore`、空 catch、console.log、未使用导入。
  输出: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **实际 QA 验证** — `unspecified-high` [APPROVE]
  从干净状态启动。执行每个 Task 的 QA 场景。测试跨 Task 集成。
  输出: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **范围忠实度检查** — `deep` [APPROVE]
  对每个 Task: 读 "What to do"，读实际 diff。验证 1:1 — 没有遗漏、没有超出范围。
  输出: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit 策略

| Task | Commit Message | 文件 |
|------|---------------|------|
| 9 | `feat(backend): expand DTOs and add GitService/ProjectService` | backend/ |
| 10 | `feat(desktop): MainViewModel for view navigation state` | desktopApp/.../viewmodel/ |
| 11 | `feat(desktop): Rail navigation and enhanced topbar` | desktopApp/.../ui/navigation/ |
| 12 | `feat(desktop): Toast notification system` | desktopApp/.../ui/common/ |
| 13 | `feat(desktop): Command palette (Cmd+K)` | desktopApp/.../ui/common/ |
| 14 | `feat(desktop): Agent orchestration view with Swarm visualization` | desktopApp/.../ui/agents/ |
| 15 | `feat(desktop): Plugin center view with MCP/Skill detail pages` | desktopApp/.../ui/plugins/ |
| 16 | `feat(desktop): Chat enhancements - ToolCard, CodeCard, ThinkingIndicator` | desktopApp/.../ui/chat/ |
| 17 | `feat(desktop): Right panel enhancements - change management, inspector, log` | desktopApp/.../ui/session/ |
| 18 | `feat(desktop): File explorer view with project file tree` | desktopApp/.../ui/files/ |
| 19 | `feat(desktop): Activity log view with archive tree and timeline` | desktopApp/.../ui/activity/ |
| 20 | `feat(desktop): Settings modal expansion + Agent config dialog` | desktopApp/.../ui/settings/, .../ui/dialog/ |
| 21 | `feat(desktop): Session list enhancements + mention dropdown` | desktopApp/.../ui/session/, .../ui/chat/ |

---

## 成功标准

### 验证命令
```bash
./gradlew build                        # Expected: BUILD SUCCESSFUL
./gradlew :desktopApp:run              # Expected: 窗口打开，显示完整 UI
./gradlew :backend:test                # Expected: 所有测试通过
```

### 最终检查清单
- [ ] 5 个主视图可通过 Rail 导航切换
- [ ] Agent 编排台显示 Swarm 可视化 + Agent 卡片
- [ ] 插件中心显示 MCP/Skill 列表 + 详情页
- [ ] 文件浏览器显示项目文件树 + Git 变更
- [ ] 活动日志显示按日期归档的会话事件
- [ ] Cmd+K 打开命令面板
- [ ] Toast 通知正常显示和消失
- [ ] Chat 中 ToolCard/CodeCard 正确渲染
- [ ] 设置模态框有 7 个 tab
- [ ] 所有 "Must Have" 存在
- [ ] 所有 "Must NOT Have" 不存在
