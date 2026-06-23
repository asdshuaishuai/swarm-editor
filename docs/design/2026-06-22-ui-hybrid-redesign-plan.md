# Swarm Editor UI 重构方案 · Hybrid C（极客紫 × Apple 克制）

- **日期**: 2026-06-22
- **状态**: 已获批，待执行
- **决策来源**: 用户选 C（混合风）+ 治理铁律（结构 vs 表面分离）

---

## 0. 治理铁律（一切 UI 工作的准绳）

| 维度 | 准则 | 来源 |
|---|---|---|
| **布局 / 交互 / 功能逻辑** | **严格遵守 `docs/design/mvp-design-mockup.html`**（结构真值）。像素审计的 🔴 结构偏差必须按稿修。 | 用户明确 |
| **UI 视觉表面**（配色/字体/图标风/磨砂/圆角/发光） | **自由发挥**，方向 = Hybrid C：保留紫 accent 身份 + 注入 Apple 克制感 | 用户明确 |

即：**骨架按稿，皮肤自由**。

---

## 1. 版本现状（已核实，CLAUDE.md 过时）

| 依赖 | 实际版本（`gradle/libs.versions.toml`） | 备注 |
|---|---|---|
| Kotlin | **2.3.10** | 被 Koog 0.7.3 钉住；远超 hot-reload 要求(≥2.1.20) ✓ |
| Compose Multiplatform | **1.8.1** | CLAUDE.md 写"1.7.x"已过时；离内置 hot-reload 的 1.10.0 差 2 minor |
| Koog / ACP / MCP SDK | 0.7.3 / 0.13.1 / 0.4.0 | CLAUDE.md 的 MVP 描述已严重过时 |
| JDK | 21 | ✓ |

---

## 2. Hybrid 方向定义

保留设计稿的**紫色身份**；注入 Apple 的**克制 + 半透明 + Inter 排版 + 大留白**：
- 紫 accent（`#a78bfa` 系）保留，但按 Apple 式克制——**只用在关键 CTA / 激活态**，不再满屏发光。
- 背景：柔和深色 + **磨砂半透明**（haze 扛 vibrancy）。
- 字体：**Inter**（设计稿本意；SF Pro 合法替身）——代码现误用 `FontFamily.Default`，需还原。
- 图标：**Lucide** 线性（SF Symbols 合法替身）。
- 圆角更大、留白更足、边框更细更柔。
- **不用** SF Pro/SF Symbols（Linux 许可不合规）、不套 compose-cupertino（iOS 皮违和）。

---

## 3. Hybrid 设计 Token 提案（改 `Colors.kt` / `Theme.kt` / `DesignSystem.kt`）

| Token | 现状 | Hybrid 提案 | 说明 |
|---|---|---|---|
| Bg0 底 | `#060709` | `#13141c` | 抬一点，去刺眼 |
| Bg1 面板 | `#0a0b11` | `#1a1c28` + haze 半透明 | Apple 面板感 |
| Bg2 卡片/输入 | `#12151e` | `#232739` (alpha 0.7 over blur) | 磨砂 |
| Bg3 hover | `#1a1f2c` | `#2d3247` | 柔和反馈 |
| Line | `#1e2330` | `#2a2e40` | 降对比 |
| Tx 主文字 | `#f0f1f6` | `#e8eaf2` | 稍收 |
| Tx2 / Tx3 | `#9aa3b8` / `#6b7388` | `#969cb2` / `#6a7088` | 微调 |
| **Ac 紫（克制用）** | `#a78bfa` | `#a78bfa`（不变，但减少使用面） | 仅 CTA/激活 |
| Agent 色 | 已对齐稿 | 不变 | claude/qwen/gemini/kimi/opencode |
| Shape 圆角 | 4/6/8/12 | 6/8/12/16 | 整体上调一档 |
| Font | `FontFamily.Default` | **Inter**（打包 `composeResources/font`） | 还原稿本意 |

> 值定下后用 Hot Reload 实时调。

---

## 4. 技术栈（依赖采纳清单）

| 类别 | 库 | 坐标 | Phase |
|---|---|---|---|
| 🔥 开发前置 | Compose Hot Reload | 升 CMP `1.8.1→1.10.0`（内置，零配置；Kotlin 已满足） | 0 |
| 半透明 | haze | `dev.chrisbanes.haze:haze:1.6.6` | 2 |
| 图标 | Lucide | `com.woowla.compose.icon.collections:lucide:<ver>` | 2 |
| Markdown | mikepenz | `com.mikepenz:multiplatform-markdown-renderer-m3:0.33.0-b05` | 3 |
| 树视图 | bonsai | `com.adrielcafe:bonsai:<ver>`（替 FileTree+ArchiveTree） | 3 |
| 可选·代码高亮 | KodeView | `dev.snipme:kodeview-compose:<ver>` | 5 |
| 可选·富文本编辑 | compose-rich-editor | `com.mohamedrejeb.richeditor:richeditor-compose:<ver>` | 5（SKILL.md 编辑） |
| 可选·加载态 | compose-shimmer | `com.valentinilk.compose:shimmer:<ver>` | 5 |
| 可选·开发工具 | rebugger / inspektify | 重组追踪 / Ktor 抓包 | 5 |
| **不引** | Jewel(只读迁移) / compose-fluent(美学冲突) / 导航库 / DB / DI / 图片库 / SF Symbols / compose-cupertino | — | — |

> 配色用手调 Hybrid 值（已定方向）；MaterialKolor 留作后续程序化换肤。

---

## 5. 分阶段执行计划

| Phase | 目标 | 风险 |
|---|---|---|
| **0 · 热更前置** | CMP `1.8.1→1.10.0`（Kotlin 不动）；验证 Koog/ACP/MCP 兼容；启用 Hot Reload | 中（跨 2 minor + 第三方库兼容） |
| **1 · 基础 token** | Hybrid 调色板 + Inter 字体 + 圆角上调 | 低 |
| **2 · 图标+磨砂** | Lucide 替 emoji/Material；haze 接入 topbar/modal/ctx/composer | 低 |
| **3 · 能力库** | mikepenz markdown（MCP README+chat）；bonsai 替树视图 | 低 |
| **4 · 结构对齐** | 修像素审计 🔴 结构偏差（按稿） | 中 |
| **5 · 可选增强** | KodeView / rich-editor / shimmer / rebugger / inspektify | 低 |

---

## 6. 风险与约束
- **CMP 1.8.1→1.10.0**：跨 2 minor，留意 breaking（统一 `@Preview`、`Dialog/PopupProperties` 转正、material3 API）。Phase 0 须独立验证编译 + Koog/ACP/MCP 兼容。
- **Inter 字体**：打包进 `composeResources/font`，不用系统默认，保 Linux/Win/mac 一致。
- **Hot Reload 仅 Desktop**：本项目 desktop-only，契合。
- **治理铁律**：Phase 1-3 改的是"皮肤"（自由）；Phase 4 改的是"结构"（按稿）；两者不得混淆。

---

## 7. 与像素审计的关系
- 本方案（Phase 1-3）治**丑**（皮肤）；像素审计（Phase 4）治**偏**（结构）。互补。
- Hybrid token 重定义自动消解审计里 🔴 的"token 刻意调亮偏差"项。
- 审计 spec：`docs/superpowers/specs/2026-06-22-pixel-audit-design.md`。

---

## 8. 关联
- 设计稿真值 + 治理铁律：记忆 `design-spec-source-of-truth`
- Hot Reload 接入：记忆 `hot-reload-integration`
- 截图验证流程：记忆 `compose-app-screenshot-loop`
