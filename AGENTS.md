# AGENTS.md — Swarm Editor

为在此仓库工作的 AI Agent 会话准备的紧凑指令文件。

## 项目

Swarm Editor 是一个**多 Agent 协调编辑器**（不是工作流引擎）。Go 后端 + React/Tauri v2 桌面前端。通过 stdio/JSON-RPC 2.0 与外部 ACP Agent 通信。

- **Go 版本**: 1.25.0（硬性要求）
- **模块**: `github.com/swarm-editor/swarm-editor`
- **前端**: React 18, Vite, TypeScript (strict), Tailwind, Zustand, Tauri v2
- **规模**: 23 Go packages | 133 Go 源文件 | 169 测试文件 | 127 UI 测试文件 | 6376 UI 用例

## 构建与测试命令

### Go 后端

```bash
make build              # 构建 bin/swarm-editor, bin/swarm-agent
make test               # 运行全部 Go 测试
make test-race          # 带 race 检测器运行测试
go test -v -run TestName ./internal/swarm/...   # 单测 / 单包
make coverage           # 生成 coverage.out + 摘要
make coverage-html      # 生成 HTML 覆盖率报告
make vet                # go vet
make lint               # staticcheck
make fmt                # gofmt -s -w
make ci                 # fmt → vet → lint → test-race → coverage → ui-test → build
```

### UI 前端

```bash
cd ui && npm install
cd ui && npx tauri dev       # 真正的开发服务器（桌面窗口 + Go 后端 + Vite HMR）
cd ui && npm run dev         # ⚠️ 仅为 Vite HTTP，供 Tauri devUrl 内部使用，不要手动用于开发
cd ui && npm run build       # tsc && vite build
cd ui && npm run test        # vitest run (6376 tests)
cd ui && npm run test:coverage
```

## 架构与入口点

```
cmd/
  swarm-editor/main.go    # 主二进制入口
  swarm-agent/main.go     # Agent 二进制入口
  ws-server/main.go       # 独立 WebSocket 服务器

internal/                  # 16 个核心包
  acp/        # ACP 协议 (JSON-RPC 2.0)、传输、连接管理、日志节流、敏感命令检测
  agent/      # Agent 注册表、生命周期、发现、技能扫描
  api/        # WebSocket API (163 命令路由, handler_*.go 按领域拆分)
              #   shadowbuffer.go — 内存补丁暂存 (Stage/Commit/Reject)
              #   verifier.go — 文件类型路由 linter (go vet/tsc/pylint)
  a2a/        # Agent 间协议、消息路由、代码补丁通道
  lsp/        # LSP 桥接 — 客户端、管理器、扫描器 (32+ 命令)
  mcp/        # MCP 客户端 — 服务器发现、工具调用
  swarm/      # 调度器 (4策略)、协调器、监控器、共识 (Queen Bee)
  session/    # 消息历史的 JSON 文件持久化
  team/       # 团队管理、角色、权限
  audit/      # 审计日志
  config/     # 配置加载
  context/    # 上下文管理、代码库索引、@Files
  log/        # 结构化日志 (基于 slog)
  pair/       # 结对编程
  terminal/   # 终端/PTY 集成
  testutil/   # 测试辅助

ui/src/
  panels/     # 42 个面板组件 (同目录 .test.tsx)
  components/ # 116 个共享组件 (layouts/ 子目录含三列 MainLayout)
  stores/     # 16 个 Zustand store
  hooks/      # 35 个自定义 React hooks
  services/   # 12 个 API 服务 (WebSocket client, lspApi, monitoringApi)
  utils/      # 26 个工具函数 (monacoLSP, fileReference 等)
  types/      # TypeScript 类型定义
  swarm/      # 前端 swarm 数据类型
```

## 代码规范

### Go

- **包名**: 小写，无下划线。
- **导出**: PascalCase。**未导出**: camelCase。
- **接口**: 尽量以 `-er` 结尾 (`Scanner`, `Checker`)。
- **错误**: 使用结构化错误辅助函数 (`errValidation(...)`, `safeError(...)`)，不要用裸 `fmt.Errorf` 处理领域错误。
- **日志**: 通过包级 logger 使用 `slog` (`schedulerLog = log.With("component", "Scheduler")`)。
- **并发**: 共享状态用 `sync.RWMutex`；读用 `RLock`，写用 `Lock`；避免在锁内调用外部函数。
- **测试**: 标准 `*_test.go`，同包。169 个测试文件。
- **路径安全**: 所有文件路径操作必须通过 `safePath()` 防止目录遍历。
- **Windows 兼容**: 路径使用 `replace(/\\/g, '/')` 标准化。

### TypeScript / React

- **组件**: PascalCase 文件名 (`AgentConfigPanel.tsx`)。
- **Hooks**: camelCase，`use` 前缀 (`useEditorStore.ts`)。
- **测试**: 同目录，同名 + `.test.tsx`。127 个测试文件，6376 用例。
- **状态**: `stores/` 中的 Zustand stores。
- **导入**: `@/` 别名指向 `src/`。
- **Lint**: tsconfig 中 `noUnusedLocals: true`、`noUnusedParameters: true`。ESLint 对 `no-explicit-any` 和 `console` 警告（仅允许 `warn`/`error`）。
- **ID 生成**: 使用 `eventId(prefix)` 辅助函数（含 Math.random 后缀）防止碰撞。

## Lint 与 CI

- **Go**: staticcheck + go vet + gofmt。配置在 `.golangci.yml`。
- **TypeScript**: `eslint src`（配置在 `ui/eslint.config.js`）。
- **CI 顺序**: `fmt → vet → lint → test-race → coverage → ui-test → build`。

## 运营陷阱

- **Go 1.25.0 是硬性要求**。
- **`ui/` 内的 `npm run dev` 不能用于手动开发** — 它只为 Tauri 的 `devUrl` 提供 Vite。实际开发始终用 `npx tauri dev`。
- **Agent 配置路径**: `~/.swarm-editor/agents.json` — 6 个 ACP 兼容 Agent。
- **MCP 发现路径**: 全局 (`~/.claude/mcp.json`, `~/.swarm-editor/mcp.json`) + 项目 (`.swarm-editor/mcp.json`, `.mcp.json`)。
- **WebSocket 端口**: UI 开发服务器跑在 `1420` (strictPort)。后端 WebSocket 是独立的。
- **Tauri 构建需要 Rust**；Go 后端不需要。
- **ShadowBuffer stage ID**: `agentID-path-timestamp-monotonicCounter` 格式防止碰撞。
- **A2A 补丁**: 必须用 `Enqueue`（非 `Send`），`Send` 只调 SendFunc 不触发 handler。
- **OnUpdate 拦截器**: 使用 `sensitiveInterceptorWired` 哨兵标志防止回调链堆积。

## 关键外部参考

- `CLAUDE.md` — Claude Code 指引（架构速览、设计决策、自进化历史）。
- `ARCHITECTURE.md` — 系统架构图。
- `docs/DEVELOPMENT.md` — 编码标准、阶段路线图、文件组织。
- `docs/SELF_EVOLUTION.md` — 项目演进历史。
