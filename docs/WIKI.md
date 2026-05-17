# Swarm Editor Wiki

> 最后更新: 2026-05-17 | 版本: R5933

---

## 项目概述

Swarm Editor 是一款**多 Agent 协调编辑器**，对标 Cursor / Claude Code / Windsurf，独有多 Agent 协调、涌现智能、共识机制三大差异化能力。

**技术栈:**
- **前端**: React 18 + TypeScript + Vite + Monaco Editor + TailwindCSS
- **后端**: Go (WebSocket JSON-RPC 2.0) + ACP (Agent Client Protocol) + MCP (Model Context Protocol)
- **桌面**: Tauri 2 (Rust shell)
- **测试**: Vitest (前端 1028 tests) + Go test (后端)

---

## 架构总览

```
┌─────────────────────────────────────────────────┐
│                  Tauri Shell                     │
│  ┌───────────────────────────────────────────┐  │
│  │           React Frontend (Vite)           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐ │  │
│  │  │ Monaco  │ │ Panels  │ │   Stores    │ │  │
│  │  │ Editor  │ │ (20+)   │ │ (Zustand)   │ │  │
│  │  └────┬────┘ └────┬────┘ └──────┬──────┘ │  │
│  │       └───────────┼─────────────┘        │  │
│  │              WebSocket API                │  │
│  └───────────────────┬───────────────────────┘  │
│                      │ JSON-RPC 2.0             │
│  ┌───────────────────┴───────────────────────┐  │
│  │           Go Backend (WebSocket)          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ │  │
│  │  │ Handler  │ │  ACP     │ │   MCP     │ │  │
│  │  │ Router   │ │ Protocol │ │  Client   │ │  │
│  │  └──────────┘ └──────────┘ └───────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ │  │
│  │  │ Scanner  │ │ Health   │ │  LSP      │ │  │
│  │  │ (Agent)  │ │ Checker  │ │  Bridge   │ │  │
│  │  └──────────┘ └──────────┘ └───────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. ACP (Agent Client Protocol)

**协议**: JSON-RPC 2.0 over stdio

**核心类型:**
- `AgentID` — Agent 唯一标识
- `SessionID` — 会话标识
- `Prompt` — 消息内容 (text/image/tool_use blocks)
- `SessionPromptResult` — 包含 `StopReason` + `Content`

**连接流程:**
1. `ConnManager.Connect(ctx, agentID)` → 启动 CLI 进程 → 建立 stdio 连接
2. `conn.CreateSession(ctx, mode)` → 创建 ACP 会话
3. `conn.SendPrompt(ctx, sessionID, prompt)` → 发送消息，阻塞等待响应
4. 内容通过 `client.OnUpdate` 回调累积到 session
5. `conn.CloseSession(ctx, sessionID)` → 关闭会话

**内容捕获模式:**
```
session.StartContentCapture()
  → client.OnUpdate 触发 → session.AddContent(block)
session.FinishContentCapture()
blocks := session.WaitForContent(timeout)
```

**已支持的 Agent:**
- Claude Code (`claude acp`)
- Kimi Code (`kimi acp`)
- OpenCode (`opencode acp`)
- Cline (`cline --acp`)
- QwenCode (`qwen --acp`)
- GeminiCLI (`gemini --acp`)

---

### 2. MCP (Model Context Protocol)

**协议**: JSON-RPC 2.0 over stdio

**核心能力:**
- `tools/list` — 列出可用工具
- `tools/call` — 调用工具
- `resources/list` — 列出资源
- `prompts/list` — 列出提示模板

**健康检查:**
- `HealthChecker` 定期 ping 所有已注册的 MCP 服务器
- 状态: `Healthy`, `LastChecked`, `ResponseTime`, `Error`
- 通过 `SetClientGetter` 注入客户端查找函数

**API 端点:**
- `list_mcp_servers` — 列出已配置的 MCP 服务器
- `list_mcp_tools` — 列出指定服务器的工具
- `scan_mcp_servers` — 自动发现 MCP 服务器
- `call_mcp_tool` — 调用 MCP 工具

---

### 3. Skill Scanner

**扫描源:**
1. **文件系统**: `~/.claude/skills/`, `~/.agents/skills/`, `<workspace>/.claude/skills/`, `<workspace>/.agents/skills/`
2. **Agent 能力**: 从 scanner 结果提取 capabilities
3. **MCP 工具**: 每个 MCP 工具视为一个 skill

**SkillInfo 结构:**
```go
type SkillInfo struct {
    ID          string      // 唯一标识 (fs:name, mcp:server:tool, agent:cap)
    Name        string      // 显示名称
    Description string      // 描述
    Source      SkillSource // 来源: filesystem/mcp/agent
    Path        string      // 文件路径或命令
    AgentID     string      // 关联的 Agent ID
    Tags        []string    // 标签
}
```

**扫描方法:**
- `Scan()` — 仅文件系统
- `ScanWithAgents(agents)` — 文件系统 + Agent 能力
- `ScanWithMCPTools(servers, tools)` — 文件系统 + MCP 服务器 + 每个 MCP 工具

---

### 4. LSP Bridge

**支持命令 (32 个):**
- `textDocument/completion` — 代码补全
- `textDocument/hover` — 悬停信息
- `textDocument/definition` — 跳转定义
- `textDocument/references` — 查找引用
- `textDocument/formatting` — 格式化
- `textDocument/rename` — 重命名
- 等等...

**多语言支持**: 通过 `languages` 配置指定 LSP 服务器

---

### 5. 前端架构

**状态管理**: Zustand stores
- `useEditorStore` — 编辑器状态 (tabs, active file, content)
- `useAppStore` — 全局状态 (toast, panels, theme)
- `useAgentStore` — Agent 状态
- `useWorkspaceStore` — 工作区状态

**面板系统 (20+ 面板):**
- `EditorPanel` — 主编辑器 (Monaco)
- `ExplorerPanel` — 文件树
- `AgentCollaborationPanel` — Agent 协作中心
- `MCPPanel` — MCP 服务器管理
- `AgentScannerPanel` — Agent/MCP/Skill 扫描
- `AgentConfigPanel` — Agent 配置
- `SettingsPanel` — 设置
- 等等...

**WebSocket 通信:**
```typescript
// 发送命令
const result = await api.agent.getAgents()

// 接收事件
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  // 处理 session/update, notification 等
})
```

---

## API 参考

### Agent 命令

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_agents` | - | `AgentInfo[]` | 获取所有 Agent |
| `get_agent` | `{id}` | `AgentInfo` | 获取单个 Agent |
| `start_agent` | `{id}` | `{status}` | 启动 Agent |
| `stop_agent` | `{id}` | `{status}` | 停止 Agent |
| `refresh_agents` | - | `AgentInfo[]` | 刷新并扫描 Agent |
| `add_agent` | `{config}` | `AgentInfo` | 添加 Agent |
| `update_agent` | `{config}` | `AgentInfo` | 更新 Agent |
| `delete_agent` | `{id}` | `{status}` | 删除 Agent |
| `test_agent` | `{id}` | `{status}` | 测试 Agent 连接 |
| `scan_skills` | - | `SkillInfo[]` | 扫描所有 Skills |

### MCP 命令

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `list_mcp_servers` | - | `MCPServerInfo[]` | 列出 MCP 服务器 |
| `list_mcp_tools` | `{serverId}` | `MCPToolInfo[]` | 列出服务器工具 |
| `scan_mcp_servers` | - | `MCPServerInfo[]` | 扫描发现 MCP 服务器 |
| `call_mcp_tool` | `{serverId, toolName, args}` | `any` | 调用 MCP 工具 |

### Session 命令

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `create_session` | `{agentId, mode}` | `{sessionId}` | 创建会话 |
| `send_message` | `{sessionId, content}` | `{content, stopReason}` | 发送消息 |
| `close_session` | `{sessionId}` | `{status}` | 关闭会话 |

---

## 开发指南

### 构建

```bash
# 前端
cd ui && npm install && npm run build

# 后端
go build ./...

# 桌面 (Tauri)
cargo tauri dev
```

### 测试

```bash
# 前端测试
cd ui && npm run test

# 后端测试
go test ./...

# 静态分析
staticcheck ./...
go vet ./...
```

### 添加新的 API 命令

1. 在 `internal/api/handler_*.go` 添加 handler 函数
2. 在 `internal/api/handler.go` 的 `handleCommand` 添加路由
3. 在 `ui/src/services/api.ts` 添加前端调用方法
4. 在对应面板组件中调用 API

### 添加新的面板

1. 在 `ui/src/panels/` 创建面板组件
2. 在 `ui/src/components/ActivityBar.tsx` 添加入口
3. 在 `ui/src/App.tsx` 添加路由
4. 编写测试文件 `*.test.tsx`

---

## 配置文件

### Agent 配置 (`~/.swarm-editor/agents.json`)

```json
{
  "agents": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "command": "claude",
      "args": ["acp"],
      "description": "Anthropic's coding agent",
      "enabled": true
    }
  ]
}
```

### MCP 配置 (`~/.swarm-editor/mcp.json`)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "type": "stdio"
    }
  }
}
```

---

## 故障排查

### Agent 连接失败

1. 检查 Agent CLI 是否安装: `which claude`
2. 检查 ACP 模式是否支持: `claude acp --help`
3. 查看后端日志中的错误信息
4. 使用 `test_agent` 命令测试连接

### MCP 服务器无响应

1. 检查 MCP 服务器进程是否运行
2. 查看健康检查状态: `list_mcp_servers` 返回中的 `healthy` 字段
3. 检查命令路径和参数是否正确

### 前端构建失败

1. 清除缓存: `rm -rf node_modules/.vite`
2. 重新安装: `rm -rf node_modules && npm install`
3. 检查 TypeScript 错误: `npx tsc --noEmit`
