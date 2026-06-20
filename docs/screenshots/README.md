# Swarm Editor — UI 对齐效果展示（功能测试截图）

本目录收录客户端对齐设计稿后的各视图/浮层截图，用于功能测试与视觉效果展示。

- **设计稿来源（最重）**：`docs/design/mvp-design-mockup.html`
- **补充来源（仅 Agent / MCP 专属配置弹窗）**：`docs/design/old_mvp_design.html`
- 截图分辨率：1280×960（与设计稿一致），Compose Desktop 软件渲染。

## 截图清单

| 文件 | 内容 | 说明 |
|---|---|---|
| `00-design-target-设计稿目标.png` | 设计稿基准 | 核心稿渲染图，对齐目标 |
| `01-chat-会话视图.png` | 会话（默认视图） | 中文会话列表(今天/昨天/本周)、示例对话(工具卡/代码卡)、QwenCode 审查中、自动滚到底部 |
| `02-agents-Agent编排台.png` | Agent 编排台 | 中心⬢+5 彩色节点+连线、在线/待安装分区+统计 |
| `03-plugins-插件中心.png` | 插件中心 | MCP/Skills 市场瓦片(描述/下载量/评分/分类)、中文 |
| `04-files-文件浏览.png` | 文件浏览 | 统计卡(总文件/已修改/新增)、文件树默认展开 |
| `05-activity-活动日志.png` | 活动日志 | 归档树(年/月/日)+事件时间线+会话统计 |
| `06-modal-settings-设置.png` | 设置弹窗 | 通用/外观/快捷键/Agent配置/MCP管理/Skills管理/关于 |
| `07-modal-agent-config-Agent配置.png` | Agent 专属配置（聚焦弹窗，来源 old 稿） | 连接配置/原生配置分区、状态、保存配置 |
| `08-modal-mcp-config-MCP配置.png` | MCP 专属配置（聚焦弹窗，来源 old 稿） | 启动配置/环境变量、保存配置 |
| `09-modal-command-palette-命令面板.png` | 命令面板 ⌘K | 命令/Agent配置/视图分组，中文 |

## 复现方式

```bash
# 无头运行（需 Xvfb；窗口在虚拟显示里有 ~48px 偏移，屏幕需比窗口大）
Xvfb :99 -screen 0 1480x1120x24 &
DISPLAY=:99 ./gradlew :desktopApp:run

# 截图（裁掉 48px 偏移黑边 → 干净 1280×960）
DISPLAY=:99 import -window root /tmp/app.png
convert /tmp/app.png -crop 1280x960+48+48 +repage view.png
```

切换初始视图/浮层用于截图（`MainViewModel` / `App.kt` 读取的系统属性）：
- `-Dswarm.view=chat|agents|plugins|files|activity`
- `-Dswarm.modal=settings|agent|mcp|cmdk`

## 对齐与人体工程学改动概要

- **数据**：注入设计稿示例数据（会话/对话/Agent/MCP/Skills/文件变更/活动），纯前端、无需后端。
- **框架修复**：右侧面板黑屏（默认 tab 错配）、状态栏信息密度、变更卡 ✓/✗ 图标。
- **体工**：全站中文化（plugins/命令面板/配置弹窗）、文件树默认展开、聊天自动滚动、消息按归属 Agent 显示头像、去冗余 `0 tokens`。
- 去掉 OS 标题栏（`undecorated`），符合设计稿无 chrome 风格。
