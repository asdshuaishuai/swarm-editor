# 像素级对齐审计 — 方案设计

- **日期**: 2026-06-22
- **状态**: 待执行
- **目标**: 对 `docs/design/mvp-design-mockup.html`（设计稿真值）与 `desktopApp/`（当前开发应用）做穷尽式像素级对齐审计，覆盖每个按钮/文案/模块/弹窗。
- **约束**: 只分析、不修复对齐 bug。仅允许临时取证脚本（截图用导航钩子，截后还原，git 保持干净）。

---

## 1. 背景与已验证前提

前期已建立的事实（本审计的起点）：

1. **设计稿真值获取方式已跑通**：chrome headless 渲染 `mvp-design-mockup.html`，改 init 行（`renderSide('chat')` → `switchView('<view>')` / `openPluginDetail(...)` / `openSettings()` 等）即可渲染任意视图/弹窗，1280×960 输出，CDN（tailwind/字体）正常加载。只读，不改设计稿源码。
2. **app fresh 截图方式已跑通**：`MainViewModel` 已支持 `swarm.view` 系统属性、`App.kt` 已支持 `swarm.modal`。Xvfb `:99 -screen 0 1480x1120x24` + `import -window root` + `magick -crop 1280x960+48+48` 裁掉 48px 偏移。
3. **详情页取证**：MCP/Skill 详情需点击进入，无系统属性直达 → **授权临时 `swarm.plugin` 钩子**（`App.kt` LaunchedEffect 读属性、delay 400ms 躲过 `PluginCenterView` 的 null-fire 后 set `pluginSelectedItem`），截图后立即还原。
4. **关键可靠性发现（决定方法学）**：`mmx vision describe` 与 `ui_diff_check` 在开放式提示下**会幻觉**——已实测把实际存在的 activity session-header、MVP 徽标、swarm-viz conic 中心环、Gemini 待安装卡**误报为缺失**。因此视觉工具**永远不能作为单一事实来源**。
5. **旧证据废弃**：`docs/screenshots/03-plugins` 为纯黑损坏图（mean=0）；`02-agents/04-files/05-activity` 为 6-20 旧图已过时。本审计一律用 fresh 截图。
6. **全局基础层已知差异**：`Colors.kt` 的 bg/line/text/agent token 被**刻意调亮**（注释自述"提亮/减少疲劳"），与设计稿 hex 不一致；字体从 Inter+JetBrains Mono 换为 `FontFamily.Default`。外层网格（行 48/1fr/26、列 52/260/1fr/320）已像素级对齐。

---

## 2. 覆盖矩阵 — 15 个审计模块

每个模块产出独立的「差异表 + 对齐清单」。处理顺序：A → C → B(plugins-list) → B(其余) → D。

| 区 | 模块 | 设计稿渲染 | app fresh 取证 |
|---|---|---|---|
| **A 全局框架** | A1 topbar | chat 视图 | `swarm.view=chat` |
| | A2 rail（左导航栏） | chat 视图 | 同上 |
| | A3 statusbar（底状态栏） | chat 视图 | 同上 |
| | A4 右侧 ctx 面板（变更/检查/日志，跨视图常驻） | chat 视图 | 同上 |
| **B 主视图** | B1 chat（会话） | `switchView('chat')` | `swarm.view=chat`（已截） |
| | B2 agents（编排台） | `switchView('agents')` | `swarm.view=agents`（已截） |
| | B3 plugins-list（插件中心列表） | `switchView('plugins')` | `swarm.view=plugins`（已截） |
| | B4 files（文件浏览） | `switchView('files')` | `swarm.view=files`（已截） |
| | B5 activity（活动日志） | `switchView('activity')` | `swarm.view=activity`（已截） |
| **C 详情页（焦点）** | C1 MCP detail | `openPluginDetail('mcp','github')` | 临时 `swarm.plugin=mcp:github` 钩子 |
| | C2 Skill detail | `openPluginDetail('skill','<id>')` | 临时 `swarm.plugin=skill:<id>` 钩子 |
| **D 弹窗** | D1 settings | `openSettings()` | `swarm.modal=settings` |
| | D2 agent-config | `openAgentConfig('claude')` | `swarm.modal=agent` |
| | D3 mcp-config | （设计稿无独立弹窗；用 settings>mcp tab） | `swarm.modal=mcp` |
| | D4 command palette | `openCmdk()` | `swarm.modal=cmdk` |

> D3 注：设计稿 MCP 管理在 settings modal 的 mcp tab，无独立弹窗；app 的 `swarm.modal=mcp` 打开的是 `McpConfigModal`（旧配置框）。需在设计稿 settings>mcp tab 与 app McpConfigModal 之间对应核对。

---

## 3. 每个元素的核对维度

每个按钮/文案/卡片/标签/图标跨 6 维核对：

1. **文案** — 文字内容、大小写、中英文（中文化差异标注"刻意/未刻意"）
2. **颜色** — background / text / border 的 hex 值（像素采样）
3. **尺寸** — 宽、高、图标尺寸（dp/px）
4. **位置·间距** — padding、margin、gap
5. **状态** — default / hover / active / disabled；角标计数（如 `变更[3]`）
6. **图标** — 有无、风格（emoji vs SVG）、尺寸

---

## 4. 可靠性协议（防幻觉核心）

### 4.1 置信度标注（每条发现必须带）

| 标记 | 含义 | 能否作为事实报告 |
|---|---|---|
| 🟢 双重证实 | 像素采样 + 源码 双重确认 | ✅ 是 |
| 🔬 像素证实 | 仅 ImageMagick 像素采样 | ✅ 是（颜色/尺寸/位置） |
| 📜 源码证实 | 仅源码字符串/数值 | ✅ 是（文案/结构） |
| ⚠️ 仅视觉 | 仅 mmx/ui_diff_check 单方 | ❌ 否，只标"待查"，不入差异表 |

### 4.2 铁律

1. **mmx 定点提问**：一次只问一个具体元素的一个具体问题（例："`pd-name` 的字号和颜色是多少？"），**严禁**开放式描述（"描述这个页面"）。
2. **视觉声明必须复核**：mmx / ui_diff_check 的任何"缺失/不同"声明，必须经像素采样或源码复核后才入差异表；未复核的归 ⚠️ 待查。
3. **文案以源码为准**：所有文字/数字一律核对源码字符串，不以 mmx 读字为准（mmx 会误读）。
4. **对齐也要举证**：标"已对齐 ✓"的元素必须带证据（像素或源码），以证明覆盖完整、非漏审。

---

## 5. 流水线（每模块固定 6 步）

```
1. 渲染设计稿该视图（chrome headless，init-swap，只读）
2. fresh 截 app（swarm.view / swarm.modal / 临时 swarm.plugin 钩子）
3. 裁 1280×960 匹配对（magick -crop ... +48+48）
4. 列元素清单（设计 HTML 结构 + app 源码 Composable）
5. 逐元素：像素采样两图同坐标 + mmx 定点 + 源码 → 填 6 维表
6. 产出：差异行（deltas）+ ✓ 对齐清单 + 覆盖统计
```

进程安全：杀 app JVM 用 MainKt 变量法（`M=MainKt; for p in $(pgrep -f "swarmeditor.desktop.$M"); do kill -9 "$p"; done`），**绝不** `pkill -f gradle`（会自匹配当前 shell 自杀——已踩坑）。

---

## 6. 产出结构

### 6.1 审计方法 spec（本文件）
`docs/superpowers/specs/2026-06-22-pixel-audit-design.md`

### 6.2 最终审计报告（执行产物）
`docs/design/2026-06-22-pixel-alignment-audit.md`

结构：
- **顶层汇总表**：15 模块 × (设计元素数 / app 元素数 / 对齐数 / 偏差数) + 全局严重度分布
- **全局基础层**：token 调亮差异表（已知，整体复用）
- **每模块章节**：
  - 覆盖统计（N 设计 / N app / M 对齐 / K 偏差）
  - **差异表**：`元素 | 维度 | 设计稿值 | app 值 | 证据(🟢/🔬/📜) | 严重度`
  - **✓ 对齐清单**：已证实一致的元素（带证据）
  - 模块严重度小结
- **跨模块共性**（如 ctx 角标、计数括号格式）

严重度：🔴 结构性 / 🟡 像素·文案 / 🟢 刻意或已对齐 / ❓ 待证实

---

## 7. 范围与边界

- **包含**：13 模块的视觉/结构/文案/尺寸/颜色/状态对齐核对。
- **不包含**：DemoData 数据内容差异（如具体 token 数、文件数、会话标题文字）——这些是数据，非对齐 bug，仅在"导致视觉结构差异"时附带提及。
- **不做**：任何对齐修复（用户明确要求只分析）。
- **hover/动画态**：以 default 静态态为主；hover 态仅在源码可静态推断时核对，不强制 live 触发。

---

## 8. 验收标准

- 15 模块每模块都有差异表 + 对齐清单 + 覆盖统计。
- 每条差异带置信度标记（🟢/🔬/📜），无裸 ⚠️ 入表。
- 顶层汇总表可一眼看出各模块偏差密度与严重度。
- 全程无代码修复；临时钩子已还原（`git diff App.kt` 为空）。
