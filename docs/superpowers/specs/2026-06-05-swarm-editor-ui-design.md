# Swarm Editor UI 模块设计

## 概述

Swarm Editor 是基于 Tauri v2 的桌面多 Agent 协调编辑器。本文档定义 13 个 UI 模块的详细设计，覆盖左侧边栏、中心区域、右侧边栏、底部面板和全局组件。

**设计原则**：
- 纯中文 UI，无双语标签
- 移除无意义装饰文字（如 "QUEEN AGENT DEPLOYED // ACTIVE DAEMONS"）
- 统一色彩体系：`bg=#0d1117, sidebar=#161b22, card=#21262d, border=#30363d, accent=#58a6ff`
- Agent 配色：Claude=橙 `#fb923c`, Kimi=青 `#22d3ee`, OpenCode=紫 `#a78bfa`, Qwen=粉 `#f778ba`

---

## 布局架构

```
┌─────────────────────────────────────────────────────────────────┐
│ 标题栏 (h-10) — Logo + 导航菜单 + 心跳指示 + Git + 设置        │
├──────────┬─────────────────────────────────┬────────────────────┤
│ 左侧边栏 │ 中心区域                         │ 右侧边栏           │
│ (w-80)   │ (flex-1)                        │ (w-80)             │
│          │                                 │                    │
│ 3 Tab:   │ 2 Tab:                          │ 2 Tab:             │
│ · 文件   │ · 蜂王沙盘                       │ · 指令交互          │
│ · MCP    │ · 编辑器                         │ · 活动日志          │
│ · Agent  │                                 │                    │
├──────────┴─────────────────────────────────┴────────────────────┤
│ 底部面板 (h-64) — CLI 工坊 / 终端 / 问题 / 守护进程 / 监督者    │
├─────────────────────────────────────────────────────────────────┤
│ 状态栏 (h-6) — 守护进程 + 技能数 + 编码 + 分支                  │
└─────────────────────────────────────────────────────────────────┘
```

**通信层**：Unix Socket + Tauri IPC（替代原 WebSocket JSON-RPC 2.0）

---

## 模块 1: MCP 面板

**位置**：左侧边栏 → "MCP" Tab

**结构**：表格式布局，每行一个 MCP 服务器

| 列 | 内容 |
|----|------|
| Toggle | 全局启用/禁用开关 |
| 名称 | 服务器名 + 命令/URL |
| 类型 | stdio / http / sse |
| Agent pills | 4 个 agent 缩写 pill（C/K/O/Q），彩色=启用，灰色=禁用 |
| 配置 | ⚙ 按钮 → 打开 MCP 配置 Modal |

**Header 操作**：扫描 / 导入 / +添加

**数据来源**：
- `UnifiedMCPStore` 统一存储 → per-agent 同步
- 扫描结果通过 `mcp_servers_scanned` 事件到达（fire-and-forget 模式）
- 启动时 `periodicScan` 自动触发

---

## 模块 2: CLI 工坊

**位置**：底部面板 → "CLI 工坊" Tab

**结构**：每行一个 Agent CLI 进程

| 字段 | 内容 |
|------|------|
| 状态灯 | Agent 专属颜色（绿=运行中，黄=空闲，灰=停止） |
| Agent 名 | 带颜色标识 |
| PID | 进程 ID |
| 内存 | 估算内存占用 |
| 操作 | 启动/停止/重启按钮 |

**设计要点**：每行带 agent 专属颜色条，进程状态实时更新

---

## 模块 3: Agent 能力面板

**位置**：左侧边栏 → "Agent" Tab

**结构**：卡片列表，每个 Agent 一张卡片

**卡片内容**：
- Agent 名称 + 状态指示灯（绿/黄/红/灰）
- 能力标签（MCP、LSP、代码执行 等）
- 配置按钮 → 打开 Agent 配置 Modal
- 描述信息

**Filter Tab**：全部 / 运行中 / 空闲 / 错误

**数据来源**：`handleGetAgents()` 合并 4 个数据源（registry、connection manager、scanner、agents.json）

---

## 模块 4: Agent 配置 Modal

**位置**：从 Agent 能力面板触发

**结构**：Provider 预设卡片式

**布局**：
1. **Provider 类别 Tab**：第一方（官方） / 第三方（代理）
2. **Provider 预设列表**：单选卡片，显示名称 + Base URL
3. **模型配置**：Model、API Key（脱敏+显示切换）、Base URL
4. **其他配置**：raw JSON 编辑区（Monaco Editor）

**适配的 4 个 Agent 配置格式**：

| Agent | 格式 | 配置路径 | 模型字段 |
|-------|------|----------|----------|
| Claude | JSON | `~/.claude/settings.json` | `env.ANTHROPIC_MODEL` |
| Kimi | TOML | `~/.kimi/config.toml` | `models.*.model` |
| OpenCode | JSON | `~/.config/opencode/opencode.json` | `model` |
| Qwen | JSON | `~/.qwen/settings.json` | `model.name` |

**预设分类**：
- 第一方：Anthropic Official、Kimi Code、Moonshot、智谱
- 第三方：OpenRouter、XiaoMi MiMo、自定义代理

**格式保护**：校验通过才写入，校验失败不破坏 agent 可用性

---

## 模块 5: 指令交互

**位置**：右侧边栏 → "指令交互" Tab

**结构**：ACP/A2A/MCP 协议包实时监控

**Filter Tab**：全部 / ACP / A2A / MCP

**视图模式**：列表 / 时间轴

**列表行内容**：
- 协议类型标签（ACP=蓝, A2A=青, MCP=紫）
- 方向箭头（→ 发送 / ← 接收）
- Agent 名称
- 消息摘要
- 时间戳

**深包解析**：ACP_ORCHESTRATE、A2A_PROTOCOL、ACP_PRIVILEGE_GATE、MCP_TOOL_INVOKED

**搜索**：跨所有字段全文搜索

**上下文过滤**：蜂王沙盘节点选择时自动过滤对应 agent

---

## 模块 6: 活动日志

**位置**：右侧边栏 → "活动日志" Tab

**结构**：分类审计日志

**Filter**：全部 / MCP / 工具 / Agent / 协定 / Skill / 系统

**卡片样式**：
- 每种类型有专属颜色（cyan=purple=green=amber=rose=orange=gray）
- 卡片内容：类型标签 + 描述 + 时间戳
- 描述中 `<code>` 元素带颜色高亮

---

## 模块 7: 蜂王沙盘

**位置**：中心区域 → "蜂王沙盘" Tab

**结构**：SVG 拓扑可视化

**节点**：
- 每个 Agent 一个圆形节点，带 agent 专属颜色
- 状态：idle / executing / blocked / error / waiting_auth / thinking / stuck
- 每种状态有对应 CSS 动画（pulse/rotate/dash/bounce）

**边**：
- 有向边表示 Agent 间通信
- 流动粒子动画（SVG `animateMotion`）
- 颜色编码：数据流=蓝，控制流=橙，结果流=绿

**HITL 授权弹窗**：
- 节点状态为 `waiting_auth` 时弹出
- 显示 Agent 名 + 请求内容 + 批准/拒绝按钮
- 需人工确认后继续执行

**节点布局**：按 pipeline stage 排列，坐标固定

---

## 模块 8: 蜂王调度器

**位置**：底部面板右侧 / 独立区域

**结构**：目标输入区

**组件**：
- 策略选择器：round_robin / least_loaded / priority / capability（4 种）
- 目标输入框 + bee icon + 发送按钮（Enter 快捷键）
- 最近任务状态：最多显示 3 条，带状态标签

---

## 模块 9: 标题栏 & 状态栏

**标题栏**（顶部，h-10）：
- Logo + "Swarm Editor"
- 导航菜单：文件 / 工作区 / 蜂群架构 / MCP 服务器（纯中文）
- 心跳指示灯
- Git 同步状态
- 设置按钮

**状态栏**（底部，h-6）：
- 守护进程状态（绿点=就绪）
- 技能数量
- 编码格式（UTF-8）
- Git 分支名

**移除项**：
- ~~"QUEEN AGENT DEPLOYED // ACTIVE DAEMONS: ..."~~
- ~~所有英文标签~~

---

## 模块 10: 左侧边栏

**位置**：左侧边栏主区域（w-80）

**Tab 栏**：3 个 Tab
1. **项目文件 & Git** — 文件树 + Git 状态
2. **MCP 与技能** — MCP 面板 + 技能面板
3. **Agent 能力** — Agent 列表

**文件树**：
- 语言标签色块（TS=蓝, GO=青, MK=灰）
- Git 状态标记（M=修改/橙, A=新增/绿）
- 当前文件蓝色背景高亮
- 新建文件 / 刷新按钮

**符号大纲**（下半部分，上下分割）：
- LSP SymbolKind 标签：C=类/蓝, M=方法/紫, F=函数/黄, I=接口/青
- 搜索过滤输入框
- 行号（点击跳转到编辑器对应行）
- 符号数量统计

---

## 模块 11: 技能面板

**位置**：左侧边栏 → "MCP 与技能" Tab 下方

**结构**：独立技能列表

**Filter Tab**：全部 / 文件系统 / Agent / 项目

**技能卡片**：
- 来源标签：FS=文件系统(蓝), AGENT=Agent能力(紫), PROJ=项目(绿)
- 技能名称 + 范围标签（global/project/agent 名称）
- Agent pills：彩色=已启用，灰色=未启用，点击切换
- 路径/描述信息

**数据来源**：`scanSkills` API → `skills_scanned` 事件（fire-and-forget）

---

## 模块 12: MCP 配置 Modal

**位置**：从 MCP 面板每行的 ⚙ 按钮触发

**结构**：单个 MCP 服务器的详细配置

**字段**：
- 名称（文本输入）
- 类型切换：stdio / http / sse（按钮组）
- 命令（stdio 模式）/ URL（http/sse 模式）
- 参数（文本输入）
- 环境变量（textarea，KEY=value 格式）
- 描述（文本输入）

**操作**：
- 取消 — 关闭不保存
- 删除 — 红色按钮，二次确认
- 保存 — 绿色按钮，校验通过才写入

**类型切换行为**：切换后命令字段 ↔ URL 字段自动替换

---

## 模块 13: MCP 导入 Modal

**位置**：从 MCP 面板 Header 的 "导入" 按钮触发

**结构**：从 Agent 配置文件扫描并导入

**扫描来源区域**：
- 每个 Agent 配置文件一行：Agent 名 + 配置路径 + 发现数量
- 绿点=已扫描有结果，橙点=无结果
- 扫描中显示旋转动画

**发现的服务器列表**：
- Checkbox 多选（默认全选）
- 每行：名称 + 命令/URL + 来源 Agent 标签
- 最大高度限制，超出滚动

**操作**：
- 底部显示已选数量（已选 3 / 8）
- 取消 / 导入选中 按钮

**去重**：同名服务器合并来源标签

---

## 统一管理架构

三个管理模块结构同构：

```
Agent:  agents.json (统一存储) → sync → ~/.claude/settings.json, ~/.kimi/config.toml, ...
MCP:    mcp-servers.json       → sync → 各 agent 配置文件的 mcpServers 段
Skills: skills.json            → sync → ~/.claude/skills/, ~/.kimi/skills/, ...
```

每个都是：**统一存储 → per-agent 同步 → WebSocket API → UI 管理**

**扫描架构**：
- 扫描与连接解耦，独立触发
- Agent 扫描时自动携带 MCP/Skills 子扫描
- 前端调用 scan API → 后端返回 `{"status":"scanning"}` → 通过事件推送结果
- `periodicScan` 每 30 秒自动执行一次全量扫描

---

## Mockup 文件索引

所有 mockup 位于 `.superpowers/brainstorm/105931-1780589149/content/`：

| 文件 | 模块 |
|------|------|
| `index.html` | 目录页 |
| `mod-mcp-panel.html` | MCP 面板 |
| `mod-cli-workshop.html` | CLI 工坊 |
| `mod-agent-capability.html` | Agent 能力 |
| `mod-agent-config-modal.html` | Agent 配置 |
| `mod-protocol-monitor.html` | 指令交互 |
| `mod-activity-log.html` | 活动日志 |
| `mod-queen-sandbox.html` | 蜂王沙盘 |
| `mod-queen-dispatcher.html` | 蜂王调度器 |
| `mod-header-statusbar.html` | 标题栏 & 状态栏 |
| `mod-left-sidebar.html` | 左侧边栏 |
| `mod-skill-panel.html` | 技能面板 |
| `mod-mcp-config.html` | MCP 配置 |
| `mod-mcp-import.html` | MCP 导入 |
